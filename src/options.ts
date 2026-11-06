import "./settings-controls.ts";
import { getCookieStoreIds, getImages, setStorage } from "./common.ts";

// Top level await
const storage = await browser.storage.local.get();
const checkboxes = await getImages().then(async (images) => {
  const obj: Record<string, HTMLInputElement> = {};

  const section = document.querySelector("#container-settings")!;
  const template = document.querySelector("template")!.content;

  for (const key in images) {
    if (!(key in storage)) {
      storage[key] = await setStorage(key);
    }

    const fragment = template.cloneNode(true) as DocumentFragment;

    fragment.querySelector("div")!.style.cssText = images[key].style;
    fragment.querySelector("span")!.textContent = images[key].name;

    const input = fragment.querySelector("input")!;
    input.checked = storage[key];
    input.addEventListener("change", (event) =>
      setStorage(key, (event.target as HTMLInputElement).checked),
    );

    obj[key] = input;
    section.appendChild(fragment);
  }

  return Object.freeze(obj);
});

Object.seal(storage); // !freeze

const str = "select";
const func = (id: string) =>
  document.getElementById(id)!.addEventListener("click", (event) => {
    const checked = (event.target as HTMLElement).id === str;

    for (const key in checkboxes) {
      checkboxes[key].checked = checked;
      storage[key] = checked;
    }

    browser.storage.local.set(
      Object.fromEntries(Object.keys(checkboxes).map((key) => [key, checked])),
    );
  });

func(`de${str}`);
func(str);

document.getElementById("initialize")!.addEventListener("click", async () => {
  await browser.storage.local.set(await getCookieStoreIds());
  for (const key in checkboxes) {
    checkboxes[key].checked = true;
    storage[key] = true;
  }
});
