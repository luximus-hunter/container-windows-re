export const WEBSITE_ACCESS = { origins: ["http://*/*", "https://*/*"] };

let opening: Promise<void> | undefined;

/** Open embedded add-on preferences immediately when startup access is missing. */
export function requestStartupAccess(): Promise<void> {
  if (opening) {
    return opening;
  }
  opening = (async () => {
    if (await browser.permissions.contains(WEBSITE_ACCESS)) {
      return;
    }
    // Firefox requires a user gesture for permissions.request(). The settings
    // page supplies that gesture through its Allow website access button.
    await browser.runtime.openOptionsPage();
  })().finally(() => {
    opening = undefined;
  });
  return opening;
}
