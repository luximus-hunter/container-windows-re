/** Firefox supplies IDs on live tabs and populated window snapshots. */
export type Tab = browser.tabs.Tab & { id: number; windowId: number };
export type WindowInfo = Omit<browser.windows.Window, "id" | "tabs"> & { id: number; tabs: Tab[] };
export type RouterApi = Omit<typeof browser, "tabs" | "windows" | "sessions"> & {
  sessions: Omit<typeof browser.sessions, "getTabValue"> & {
    getTabValue(id: number, key: string): Promise<unknown>;
  };
  tabs: Omit<typeof browser.tabs, "get"> & { get(id: number): Promise<Tab> };
  windows: Omit<typeof browser.windows, "get" | "getAll" | "create"> & {
    get(id: number, options?: browser.windows.GetInfo): Promise<WindowInfo>;
    getAll(options?: browser.windows._GetAllGetInfo): Promise<WindowInfo[]>;
    create(options: browser.windows._CreateCreateData): Promise<WindowInfo>;
  };
};
export type PendingTab = Tab & { revision: number; globalRevision: number; explicit?: boolean };
export type Outcome = "moved" | "skipped" | "deferred";
export interface Activity {
  tabId: number;
  windowId: number;
  container: string | null;
  outcome: Outcome;
  reason: string;
  destinationId?: number;
  createdWindow?: boolean;
}
export interface Batch {
  status: "running" | "failed" | "blocked" | "complete";
  examined: number;
  moved: number;
  createdWindows: number;
  skipped: number;
  deferred: number;
  errors: number;
  reasons: Record<string, number>;
  errorMessages: string[];
  message?: string;
}
export type GroupingState = Awaited<
  ReturnType<ReturnType<typeof import("./router.ts").createRouter>["state"]>
>;
