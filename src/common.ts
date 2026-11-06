//
// common.mjs
//

const initial = true;

export const getCookieStoreIds = async <T = boolean>(
  callback: (context: browser.contextualIdentities.ContextualIdentity) => T = (() =>
    initial) as () => T,
) => {
  if (typeof callback !== "function") {
    throw new TypeError("getCookieStoreIds: callback");
  }

  const obj: Record<string, T> = {};

  for (const context of await browser.contextualIdentities.query({})) {
    obj[context.cookieStoreId] = callback(context);
  }

  return Object.freeze(obj);
};

export const getImages = () =>
  getCookieStoreIds((context) =>
    Object.freeze({
      name: context.name,
      style: `background-color: ${context.colorCode}; mask-image: url(${context.iconUrl});`,
    }),
  );

export const setStorage = async (key: string, value = initial) => {
  if (typeof key !== "string") {
    throw new TypeError("setStorage: key");
  } else if (typeof value !== "boolean") {
    throw new TypeError("setStorage: value");
  }

  await browser.storage.local.set({ [key]: value });
  return value;
};
