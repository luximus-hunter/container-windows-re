import { detectWindow, detectTab } from "./display-mode.ts";
import { WEBSITE_ACCESS } from "./permissions.ts";
import type { Tab, WindowInfo, RouterApi, PendingTab, Activity, Batch, Outcome } from "./types.ts";

// Keep legacy session marker names so updating does not replay already-seen tabs.
export const MARKER = "container-windows-opt-in-seen-v1";
export const INITIAL_MARKER = "container-windows-initial-window-tab-v1";
export const PREFIX = "paused-window:";
export const HOME_PREFIX = "container-home:";
const compatible = (window: WindowInfo) => window.type === "normal" && !window.incognito;
// Enabled containers get dedicated windows. Default/disabled containers are
// untouched themselves, but no longer make a compatible grouping destination.
const mixed = (window: WindowInfo, tab: Tab) =>
  window.tabs.some((t) => t.id !== tab.id && t.cookieStoreId !== tab.cookieStoreId);
const sameTabs = (before: WindowInfo, after: WindowInfo) => {
  if (before.tabs.length !== after.tabs.length) {
    return false;
  }
  // Most fresh snapshots keep tab order, so compare without allocating first.
  let index = 0;
  while (index < before.tabs.length && before.tabs[index].id === after.tabs[index].id) {
    ++index;
  }
  if (index === before.tabs.length) {
    return true;
  }
  // A reorder is allowed: validate membership without a quadratic nested scan.
  const ids = new Set<number>();
  for (const tab of after.tabs) {
    ids.add(tab.id);
  }
  for (; index < before.tabs.length; ++index) {
    if (!ids.has(before.tabs[index].id)) {
      return false;
    }
  }
  return true;
};

export function chooseDestination(
  windows: WindowInfo[],
  tab: Tab,
  eligible: Set<number>,
  homes: Map<string, number>,
) {
  const home = homes.get(tab.cookieStoreId ?? "");
  let destination: number | undefined;
  for (const window of windows) {
    if (!compatible(window) || !eligible.has(window.id)) {
      continue;
    }
    let hasCompanion = false;
    let hasOtherContainer = false;
    for (const current of window.tabs) {
      if (current.id === tab.id) {
        continue;
      }
      if (current.cookieStoreId !== tab.cookieStoreId) {
        hasOtherContainer = true;
        break;
      }
      hasCompanion = true;
    }
    if (hasOtherContainer || (!hasCompanion && window.id !== tab.windowId)) {
      continue;
    }
    if (window.id === home) {
      return home;
    }
    if (destination === undefined || window.id < destination) {
      destination = window.id;
    }
  }
  return destination;
}

export function createRouter(api: RouterApi, report = console.error) {
  const paused = new Set<number>();
  const revisions = new Map<number, number>();
  const documentChanges = new Map<number, number>();
  const pending = new Map<number, PendingTab>();
  const homes = new Map<string, number>();
  const knownWindows = new Set<number>();
  const openingWindows = new Set<number>();
  const initialTabs = new Set<number>();
  let automatic = true;
  let initialized = false;
  let globalRevision = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let writes: Promise<unknown> = Promise.resolve();
  let lastActivity: Activity | null = null;
  let lastBatch: Batch | null = null;
  let lastError: string | null = null;
  const logError = (error: unknown) => {
    lastError = error instanceof Error ? error.message : String(error);
    report(error);
  };
  const decision = (
    item: Tab,
    outcome: Outcome,
    reason: string,
    extra: Partial<Activity> = {},
  ): Activity => {
    lastActivity = {
      tabId: item.id,
      windowId: item.windowId,
      container: item.cookieStoreId ?? null,
      outcome,
      reason,
      ...extra,
    };
    return lastActivity!;
  };
  const revision = (id: number) => revisions.get(id) || 0;
  const documentVersion = (id: number | undefined) => documentChanges.get(id ?? -1) || 0;
  const allowed = (id: number) => automatic && !paused.has(id);
  const persist = <T>(task: () => Promise<T>) => {
    const result = writes.then(task);
    writes = result.catch(() => {});
    return result;
  };
  const safe = <T>(task: Promise<T>) => task.catch(logError);
  const enqueue = (task: () => Promise<unknown>) => {
    queue = queue.then(task).catch((error) => {
      logError(error);
      if (lastBatch?.status === "running") {
        lastBatch.status = "failed";
        ++lastBatch.errors;
        lastBatch.errorMessages.push(lastError!);
      }
      return { error: lastError };
    });
    return queue;
  };
  const mark = (id: number) => api.sessions.setTabValue(id, MARKER, true);

  const ready = (async () => {
    const [stored, settings, windows] = await Promise.all([
      api.storage.session.get(null),
      api.storage.local.get(null),
      api.windows.getAll({ populate: true }),
    ]);
    automatic = settings.automaticGrouping !== false;
    // Temporary reload/background restart need not emit onInstalled.
    // Seed missing preferences every time, preserving explicit false values.
    await ensureContainerDefaults();
    const live = new Set(windows.filter(compatible).map((w) => w.id));
    for (const window of windows) {
      knownWindows.add(window.id);
    }
    for (const key of Object.keys(stored)) {
      if (key.startsWith(HOME_PREFIX)) {
        if (Number.isInteger(stored[key]) && live.has(stored[key])) {
          homes.set(key.slice(HOME_PREFIX.length), stored[key]);
        } else {
          await api.storage.session.remove(key);
        }
      }
      if (key.startsWith("managed-window:")) {
        await api.storage.session.remove(key);
      }
      if (!key.startsWith(PREFIX)) {
        continue;
      }
      const id = Number(key.slice(PREFIX.length));
      if (stored[key] === true && live.has(id)) {
        paused.add(id);
      } else {
        await api.storage.session.remove(key);
      }
    }
    await Promise.all(windows.flatMap((w) => w.tabs).map((t) => mark(t.id).catch(() => {})));
    initialized = true;
  })();
  void safe(ready);

  async function state(id: number) {
    await ready;
    const window = await api.windows.get(id, { populate: true });
    const mode = await detectWindow(api, window);
    const access = await api.permissions.contains(WEBSITE_ACCESS);
    const [settings, containers] = await Promise.all([
      api.storage.local.get(null),
      api.contextualIdentities.query({}),
    ]);
    return {
      enabled: allowed(id),
      automatic,
      paused: paused.has(id),
      mode,
      access,
      available: compatible(window) && mode !== "app",
      containers: containers.map((container) => ({
        id: container.cookieStoreId,
        name: container.name || container.cookieStoreId,
        enabled: settings[container.cookieStoreId] === true,
      })),
      lastActivity,
      lastBatch,
      lastError,
    };
  }
  async function setManaged(id: number, enabled: boolean) {
    await ready;
    if (!Number.isInteger(id)) {
      throw new TypeError("Invalid window ID");
    }
    revisions.set(id, revision(id) + 1);
    if (enabled) {
      paused.delete(id);
    } else {
      paused.add(id);
    }
    // No existing tabs are examined for routing here.
    return persist(async () => {
      if (enabled) {
        await api.storage.session.remove(PREFIX + id);
      } else {
        await api.storage.session.set({ [PREFIX + id]: true });
      }
      return state(id);
    });
  }
  async function setAutomatic(enabled: boolean) {
    await ready;
    automatic = enabled;
    ++globalRevision;
    pending.clear();
    await persist(() => api.storage.local.set({ automaticGrouping: enabled }));
    return enabled;
  }
  function storageChanged(changes: Record<string, browser.storage.StorageChange>, area: string) {
    if (area === "local" && changes.automaticGrouping) {
      const enabled = changes.automaticGrouping.newValue !== false;
      if (automatic !== enabled) {
        automatic = enabled;
        ++globalRevision;
        pending.clear();
      }
    }
  }
  function permissionsChanged() {
    ++globalRevision;
    pending.clear(); // Revoked/regranted permissions never replay earlier tabs.
  }
  async function removed(id: number) {
    knownWindows.delete(id);
    openingWindows.delete(id);
    paused.delete(id);
    revisions.set(id, revision(id) + 1);
    for (const [tabId, item] of pending) {
      if (item.windowId === id) {
        pending.delete(tabId);
      }
    }
    await safe(
      ready.then(() => {
        paused.delete(id);
        return persist(async () => {
          await api.storage.session.remove(PREFIX + id);
          for (const [container, home] of homes) {
            if (home === id) {
              homes.delete(container);
              await api.storage.session.remove(HOME_PREFIX + container);
            }
          }
        });
      }),
    );
  }
  async function remember(container: string, id: number) {
    const token = revision(id);
    await api.windows.get(id);
    await persist(async () => {
      if (revision(id) !== token) {
        return;
      }
      homes.set(container, id);
      await api.storage.session.set({ [HOME_PREFIX + container]: id });
    });
  }
  function valid(item: PendingTab) {
    return (
      allowed(item.windowId) &&
      item.revision === revision(item.windowId) &&
      item.globalRevision === globalRevision
    );
  }
  async function baselineWindow(id: number) {
    try {
      const window = await api.windows.get(id, { populate: true });
      for (const tab of window.tabs) {
        initialTabs.add(tab.id);
        pending.delete(tab.id);
        await mark(tab.id).catch(() => {});
        await api.sessions.setTabValue(tab.id, INITIAL_MARKER, true).catch(() => {});
      }
      knownWindows.add(id);
    } finally {
      openingWindows.delete(id);
    }
  }
  function windowCreated(window: WindowInfo) {
    if (knownWindows.has(window.id) && !openingWindows.has(window.id)) {
      return queue;
    }
    openingWindows.add(window.id);
    return enqueue(async () => {
      await ready;
      await baselineWindow(window.id);
    });
  }
  async function attempt(item: PendingTab) {
    if (!valid(item)) {
      pending.delete(item.id);
      return decision(item, "skipped", "Grouping paused, disabled, or request cancelled");
    }
    const tab = await api.tabs.get(item.id);
    if (
      tab.windowId !== item.windowId ||
      tab.cookieStoreId !== item.cookieStoreId ||
      tab.incognito
    ) {
      pending.delete(item.id);
      return decision(item, "skipped", "Tab moved, changed container, or is private");
    }
    const settings = await api.storage.local.get(null);
    if (typeof tab.cookieStoreId !== "string") {
      pending.delete(item.id);
      return decision(item, "skipped", "Firefox did not provide the tab container ID");
    }
    if (settings[tab.cookieStoreId] !== true) {
      pending.delete(item.id);
      return decision(
        item,
        "skipped",
        tab.cookieStoreId === "firefox-default"
          ? "Default-container tab"
          : settings[tab.cookieStoreId] === false
            ? "Container disabled in options"
            : "Missing container preference",
      );
    }
    const tabMode = await detectTab(api, tab);
    if (tabMode === "app") {
      pending.delete(item.id);
      return decision(item, "skipped", "Detected app tab");
    }
    const protectedInitial =
      initialTabs.has(tab.id) || (await api.sessions.getTabValue(tab.id, INITIAL_MARKER)) === true;
    if (protectedInitial && (!item.explicit || tabMode !== "browser")) {
      pending.delete(item.id);
      return decision(item, "skipped", "Protected initial tab of a newly opened window");
    }
    const windows = await api.windows.getAll({ populate: true });
    const source = windows.find((w) => w.id === tab.windowId);
    if (!source || !compatible(source)) {
      pending.delete(item.id);
      return decision(item, "skipped", "Private, unsupported, or closed source window");
    }
    const sourceVersion = documentVersion(source.id);
    const sourceMode = await detectWindow(api, source);
    if (sourceMode === "app") {
      pending.delete(item.id);
      return decision(item, "skipped", "Detected app window");
    }
    if (!valid(item) || sourceVersion !== documentVersion(source.id)) {
      return decision(item, "deferred", "Source changed during display-mode check");
    }
    const candidates = windows.filter(
      (w) =>
        compatible(w) &&
        allowed(w.id) &&
        w.id !== source.id &&
        !mixed(w, tab) &&
        w.tabs.some((t) => t.cookieStoreId === tab.cookieStoreId),
    );
    const eligible = new Set([source.id]);
    for (const window of candidates) {
      const mode = await detectWindow(api, window);
      if (mode !== "app") {
        eligible.add(window.id);
      }
    }
    const destinationId = chooseDestination(windows, tab, eligible, homes);
    if (destinationId === source.id) {
      pending.delete(item.id);
      await remember(tab.cookieStoreId, source.id);
      return decision(item, "skipped", "Already in its dedicated container window");
    }
    if (destinationId === undefined && !mixed(source, tab)) {
      pending.delete(item.id);
      return decision(item, "skipped", "Already in a dedicated container window");
    }
    const destinationRevision = destinationId === undefined ? undefined : revision(destinationId);
    // Fresh snapshots, fresh display-mode probes, then refresh API state once
    // more. No await between final cancellation checks and the native operation.
    const sourceNow = await api.windows.get(source.id, { populate: true });
    const destination =
      destinationId === undefined
        ? undefined
        : await api.windows.get(destinationId, { populate: true });
    const sourceDocument = documentVersion(source.id);
    const destinationDocument = documentVersion(destinationId);
    const modes = await Promise.all([
      detectWindow(api, sourceNow),
      destination ? detectWindow(api, destination) : Promise.resolve("browser"),
      detectTab(api, tab),
    ]);
    if (modes.some((mode) => mode === "app")) {
      pending.delete(item.id);
      return decision(item, "skipped", "Tab, source, or destination became an app");
    }
    if (protectedInitial && modes[2] !== "browser") {
      pending.delete(item.id);
      return decision(item, "skipped", "Initial-window tab has no positive regular-browser signal");
    }
    const [current, finalSource, finalDestination, finalSettings] = await Promise.all([
      api.tabs.get(tab.id),
      api.windows.get(source.id, { populate: true }),
      destination
        ? api.windows.get(destination.id, { populate: true })
        : Promise.resolve(undefined),
      api.storage.local.get(null),
    ]);
    if (
      !valid(item) ||
      current.windowId !== item.windowId ||
      current.incognito ||
      current.cookieStoreId !== item.cookieStoreId ||
      !compatible(finalSource) ||
      !sameTabs(sourceNow, finalSource) ||
      finalSettings[current.cookieStoreId ?? ""] !== true ||
      sourceDocument !== documentVersion(source.id) ||
      destinationDocument !== documentVersion(destinationId)
    ) {
      return decision(
        item,
        "deferred",
        "Tab, source, settings, or navigation changed before moving",
      );
    }
    if (
      destination &&
      finalDestination &&
      (!allowed(destination.id) ||
        revision(destination.id) !== destinationRevision ||
        !compatible(finalDestination) ||
        !sameTabs(destination, finalDestination) ||
        chooseDestination(
          [finalSource, finalDestination],
          current,
          new Set([finalSource.id, finalDestination.id]),
          homes,
        ) !== destination.id)
    ) {
      return decision(item, "deferred", "Destination paused, changed, or became incompatible");
    }
    if (
      !destination &&
      chooseDestination([finalSource], current, new Set([finalSource.id]), homes) === finalSource.id
    ) {
      pending.delete(item.id);
      return decision(item, "skipped", "Source is now a dedicated container window");
    }
    if (!destination && !mixed(finalSource, current)) {
      pending.delete(item.id);
      return decision(item, "skipped", "Source is now a dedicated container window");
    }
    // Remove before issuing the API call: emitted attach/update events cannot
    // enqueue another move. A rejection is caught by the queue, never retried.
    pending.delete(item.id);
    if (destination) {
      let index = -1;
      if (current.pinned) {
        index = 0;
        for (const tab of finalDestination!.tabs) {
          if (tab.pinned) {
            ++index;
          }
        }
      }
      await api.tabs.move(current.id, { windowId: destination.id, index });
      await safe(remember(current.cookieStoreId!, destination.id));
      return decision(item, "moved", "Moved to container window", {
        destinationId: destination.id,
      });
    } else {
      const created = await api.windows.create({
        tabId: current.id,
        type: "normal",
        focused: false,
      });
      await safe(remember(current.cookieStoreId!, created.id));
      return decision(item, "moved", "Created dedicated container window", {
        destinationId: created.id,
        createdWindow: true,
      });
    }
  }
  function created(tab: Tab) {
    const item = { ...tab, revision: revision(tab.windowId), globalRevision };
    const duringStartup = !initialized;
    const initialWindowTab = !knownWindows.has(tab.windowId) || openingWindows.has(tab.windowId);
    if (initialWindowTab) {
      initialTabs.add(tab.id);
    }
    return enqueue(async () => {
      await ready;
      const seen = await api.sessions.getTabValue(tab.id, MARKER);
      await mark(tab.id);
      if (initialWindowTab && !duringStartup) {
        await baselineWindow(tab.windowId);
        decision(item, "skipped", "Protected initial tab of a newly opened window");
        return;
      }
      if (seen || duringStartup || !valid(item) || pending.has(tab.id)) {
        return;
      }
      pending.set(tab.id, item);
      try {
        await attempt(item);
      } catch (error) {
        pending.delete(tab.id);
        throw error;
      }
    });
  }
  function updated(_id: number, change: browser.tabs._OnUpdatedChangeInfo, tab: Tab) {
    if (change.status) {
      documentChanges.set(tab.windowId, documentVersion(tab.windowId) + 1);
    }
    if (change.status !== "complete" || !pending.size) {
      return queue;
    }
    return enqueue(async () => {
      // A destination finishing loading can unblock another window's
      // newly created tabs. Startup/restored tabs are never in this map.
      // Iterate a snapshot because attempts can remove pending entries.
      // oxlint-disable-next-line unicorn/no-useless-spread
      for (const item of [...pending.values()]) {
        try {
          await attempt(item);
        } catch (error) {
          pending.delete(item.id);
          logError(error);
        }
      }
    });
  }
  function groupExisting() {
    const requestedGlobal = globalRevision;
    const requestedRevisions = new Map(revisions);
    return enqueue(async () => {
      await ready;
      lastBatch = {
        status: "running",
        examined: 0,
        moved: 0,
        createdWindows: 0,
        skipped: 0,
        deferred: 0,
        errors: 0,
        reasons: {},
        errorMessages: [],
      };
      lastError = null;
      if (!automatic || globalRevision !== requestedGlobal) {
        lastBatch.status = "blocked";
        lastBatch.message = !automatic ? "Automatic grouping is disabled" : "Request cancelled";
        return { ...lastBatch };
      }
      await ensureContainerDefaults();
      const windows = await api.windows.getAll({ populate: true });
      const items: PendingTab[] = [];
      for (const window of windows) {
        if (!compatible(window) || !allowed(window.id)) {
          continue;
        }
        const revision = requestedRevisions.get(window.id) || 0;
        for (const tab of window.tabs) {
          items.push({ ...tab, explicit: true, revision, globalRevision: requestedGlobal });
        }
      }
      for (const item of items) {
        // Explicit button press authorizes this snapshot only.
        // Each tab still gets current source/app/pause checks.
        pending.set(item.id, item);
        ++lastBatch.examined;
        try {
          await mark(item.id);
          const result = await attempt(item);
          ++lastBatch[result.outcome];
          if (result.createdWindow) {
            ++lastBatch.createdWindows;
          }
          lastBatch.reasons[result.reason] = (lastBatch.reasons[result.reason] || 0) + 1;
        } catch (error) {
          pending.delete(item.id);
          logError(error);
          ++lastBatch.errors;
          if (!lastBatch.errorMessages.includes(lastError!)) {
            lastBatch.errorMessages.push(lastError!);
          }
        }
      }
      lastBatch.status = "complete";
      return { ...lastBatch };
    });
  }
  function tabRemoved(id: number) {
    pending.delete(id);
    initialTabs.delete(id);
  }
  function tabAttached(id: number) {
    pending.delete(id);
  }
  async function ensureContainerDefaults() {
    const existing = await api.storage.local.get(null);
    const defaults: Record<string, boolean> = {};
    for (const item of await api.contextualIdentities.query({})) {
      if (!(item.cookieStoreId in existing)) {
        defaults[item.cookieStoreId] = true;
      }
    }
    if (Object.keys(defaults).length) {
      await api.storage.local.set(defaults);
    }
  }
  async function initializeContainers() {
    await safe(ensureContainerDefaults());
  }
  return {
    ready,
    created,
    updated,
    tabRemoved,
    tabAttached,
    state,
    setManaged,
    setAutomatic,
    removed,
    initializeContainers,
    storageChanged,
    permissionsChanged,
    groupExisting,
    windowCreated,
  };
}
