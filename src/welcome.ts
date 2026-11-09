import { WEBSITE_ACCESS } from "./permissions.ts";

const access = document.querySelector<HTMLButtonElement>("#access")!;
const settings = document.querySelector<HTMLButtonElement>("#settings")!;
const status = document.querySelector<HTMLParagraphElement>("#permission-status")!;

function showAccess(granted: boolean, declined = false) {
  access.hidden = granted;
  access.disabled = false;
  status.textContent = granted
    ? "Website access granted. App window detection is ready."
    : declined
      ? "Website access was declined. You can try again here or grant access later in Settings."
      : "You can skip this step. Windows with unknown display modes may still be grouped.";
}

async function refreshAccess() {
  try {
    showAccess(await browser.permissions.contains(WEBSITE_ACCESS));
  } catch {
    access.disabled = false;
    status.textContent = "Couldn’t check website access. You can still request it below.";
  }
}

access.addEventListener("click", async () => {
  access.disabled = true;
  try {
    // Firefox requires the request to start directly in this click handler.
    const granted = await browser.permissions.request(WEBSITE_ACCESS);
    if (granted) {
      settings.focus();
    }
    showAccess(granted, !granted);
  } catch {
    access.disabled = false;
    status.textContent = "Couldn’t request website access. Try again or open Settings.";
  }
});

settings.addEventListener("click", async () => {
  try {
    await browser.runtime.openOptionsPage();
  } catch {
    status.textContent = "Couldn’t open Settings. Open the add-on’s Preferences in Firefox.";
  }
});

browser.permissions.onAdded.addListener(refreshAccess);
browser.permissions.onRemoved.addListener(refreshAccess);
void refreshAccess();
