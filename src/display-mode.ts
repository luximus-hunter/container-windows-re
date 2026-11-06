import type { RouterApi, Tab, WindowInfo } from "./types.ts";
// Runs in an isolated, top-level content-script world. Never reads page content.
export function readDisplayMode() {
  if (
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches
  ) {
    return "app";
  }
  if (document.readyState !== "complete") {
    return "unknown";
  }
  return window.matchMedia("(display-mode: browser)").matches ? "browser" : "unknown";
}

export async function detectTab(
  api: RouterApi,
  tab: Pick<Tab, "id" | "windowId">,
  timeoutMs = 1500,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      api.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        func: readDisplayMode,
        injectImmediately: true,
      }),
      new Promise<browser.scripting.InjectionResult<unknown>[]>((resolve) => {
        timer = setTimeout(() => resolve([]), timeoutMs);
      }),
    ]);
    const frame = result.find((item) => item.frameId === 0 && !item.error);
    if (!frame || (frame.result !== "browser" && frame.result !== "app")) {
      return "unknown";
    }
    const current = await api.tabs.get(tab.id);
    if (current.windowId !== tab.windowId) {
      return "unknown";
    }
    if (frame.result === "app") {
      return "app";
    }
    return current.status !== "loading" && !current.discarded ? frame.result : "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
}

export async function detectWindow(api: RouterApi, windowInfo: WindowInfo, timeoutMs = 1500) {
  if (windowInfo.type !== "normal" || windowInfo.incognito) {
    return "unknown";
  }
  // Query every available top-level document. Any positive app signal wins.
  const results = await Promise.all(
    windowInfo.tabs.map((tab) =>
      detectTab(api, { id: tab.id, windowId: windowInfo.id }, timeoutMs),
    ),
  );
  if (results.includes("app")) {
    return "app";
  }
  return results.includes("browser") ? "browser" : "unknown";
}
