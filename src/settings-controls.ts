import { WEBSITE_ACCESS } from "./permissions.ts";
function element(id: string) {
  return document.getElementById(id) as HTMLButtonElement;
}
import type { Batch, GroupingState } from "./types.ts";
const status = element("status");
const access = element("access");
const automatic = element("automatic");
const pause = element("pause");
const existing = element("group-existing");
const result = element("result");
const permissionStatus = element("permission-status");
const containers = element("containers");
const diagnostics = element("diagnostics");
const version = browser.runtime.getManifest().version;
element("version").textContent = `Version ${version}`;
let windowId: number;
let state: GroupingState;
function renderResult(batch: Batch | null) {
  if (!batch) {
    return "";
  }
  if (batch.status === "blocked") {
    return batch.message ?? "";
  }
  const summary = `Grouping ${batch.status}: ${batch.moved} moved, ${batch.createdWindows} windows created, ${batch.skipped} skipped, ${batch.deferred} deferred, ${batch.errors} errors.`;
  const reasons = Object.entries(batch.reasons)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join("; ");
  return [summary, reasons, ...batch.errorMessages].filter(Boolean).join("\n");
}
async function refresh() {
  state = await browser.runtime.sendMessage({ type: "grouping-state", windowId });
  status.textContent = `Detected window: ${
    state.mode === "app"
      ? "app: excluded"
      : state.mode === "browser"
        ? "regular browser"
        : "unknown: treated as non-app"
  }. Grouping: ${
    !state.automatic
      ? "off everywhere"
      : state.paused
        ? "paused in this window"
        : state.available
          ? "automatic"
          : "inactive in this window"
  }.`;
  access.hidden = state.access;
  permissionStatus.textContent = state.access
    ? "Website access granted. App-mode detection is available on accessible websites."
    : "Allow website access so Container Windows RE can detect app windows. Unknown windows still participate in grouping.";
  automatic.textContent = state.automatic
    ? "Disable automatic grouping"
    : "Enable automatic grouping";
  pause.textContent = state.paused
    ? "Resume grouping in this window"
    : "Pause grouping in this window";
  pause.disabled = !state.automatic;
  existing.disabled = !state.automatic;
  let enabled = 0;
  for (const container of state.containers) {
    if (container.enabled) {
      ++enabled;
    }
  }
  containers.textContent = enabled
    ? `Enabled containers: ${enabled} of ${state.containers.length}`
    : "No containers enabled. Select containers below.";
  result.textContent = [
    renderResult(state.lastBatch),
    state.lastError
      ? `Last error: ${state.lastError}`
      : !state.lastBatch && state.lastActivity
        ? `Last action: ${state.lastActivity.reason}`
        : "",
  ]
    .filter(Boolean)
    .join("\n");
  diagnostics.textContent = JSON.stringify(
    {
      version,
      windowId,
      ...state,
    },
    null,
    2,
  );
}
async function act(task: () => Promise<unknown>) {
  try {
    await task();
    await refresh();
  } catch (error) {
    result.textContent = `Grouping failed: ${error instanceof Error ? error.message : String(error)}`;
    existing.disabled = !state?.automatic;
  }
}
access.addEventListener("click", async () => {
  // Must call request directly from a user gesture, before awaiting anything.
  access.disabled = true;
  try {
    if (await browser.permissions.request(WEBSITE_ACCESS)) {
      await refresh();
    } else {
      permissionStatus.textContent =
        "Website access was declined. You can try again whenever you’re ready.";
    }
  } catch {
    permissionStatus.textContent = "Couldn’t update website access. Try again.";
  } finally {
    access.disabled = false;
  }
});
automatic.addEventListener("click", () => {
  void act(() =>
    browser.runtime.sendMessage({
      type: "set-automatic",
      enabled: !state.automatic,
    }),
  );
});
pause.addEventListener("click", () => {
  void act(() =>
    browser.runtime.sendMessage({
      type: "set-grouping",
      windowId,
      enabled: state.paused,
    }),
  );
});
existing.addEventListener("click", () => {
  existing.disabled = true;
  result.textContent = "Grouping in progress…";
  void act(async () => {
    const response = await browser.runtime.sendMessage({ type: "group-existing" });
    if (response?.error) {
      throw new Error(response.error);
    }
    if (!response?.status) {
      throw new Error("No grouping result received. Check that the loaded build is current.");
    }
  });
});
try {
  windowId = (await browser.windows.getCurrent()).id!;
  await refresh();
  automatic.disabled = false;
} catch (error) {
  status.textContent = `Grouping unavailable: ${error instanceof Error ? error.message : String(error)}`;
}

browser.permissions.onAdded.addListener(() => {
  void act(async () => {});
});
browser.permissions.onRemoved.addListener(() => {
  void act(async () => {});
});
browser.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") {
    void act(async () => {});
  }
});
