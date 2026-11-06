import { requestStartupAccess } from "./permissions.ts";
import { createRouter } from "./router.ts";
import type { RouterApi, Tab, WindowInfo } from "./types.ts";

const router = createRouter(browser as RouterApi);
browser.tabs.onCreated.addListener((tab) => {
  void router.created(tab as Tab);
});
browser.tabs.onUpdated.addListener((id, change, tab) => {
  void router.updated(id, change, tab as Tab);
});
browser.tabs.onRemoved.addListener((id) => router.tabRemoved(id));
browser.tabs.onAttached.addListener((id) => router.tabAttached(id));
browser.windows.onRemoved.addListener((id) => {
  void router.removed(id);
});
browser.windows.onCreated.addListener((window) => {
  void router.windowCreated(window as WindowInfo);
});
browser.storage.onChanged.addListener((changes, area) => router.storageChanged(changes, area));
browser.permissions.onRemoved.addListener(() => router.permissionsChanged());
browser.permissions.onAdded.addListener(() => router.permissionsChanged());
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) {
    return undefined;
  }
  if (message?.type === "grouping-state") {
    return router.state(message.windowId);
  }
  if (message?.type === "group-existing") {
    return router.groupExisting();
  }
  if (message?.type === "set-grouping" && typeof message.enabled === "boolean") {
    return router.setManaged(message.windowId, message.enabled);
  }
  if (message?.type === "set-automatic" && typeof message.enabled === "boolean") {
    return router.setAutomatic(message.enabled);
  }
  return undefined;
});
browser.runtime.onInstalled.addListener(() => {
  void router.initializeContainers();
  void requestStartupAccess().catch(console.error);
});
browser.contextualIdentities.onCreated.addListener(({ contextualIdentity }) => {
  void browser.storage.local.set({ [contextualIdentity.cookieStoreId]: true }).catch(console.error);
});
browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
  void browser.storage.local.remove(contextualIdentity.cookieStoreId).catch(console.error);
});

// onStartup covers browser startup; the top-level check below also runs when
// Firefox enables the extension or reloads its background script.
browser.runtime.onStartup.addListener(() => {
  void requestStartupAccess().catch(console.error);
});
void requestStartupAccess().catch(console.error);
