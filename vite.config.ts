import { readFile, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const source = (file: string) => fileURLToPath(new URL(`./src/${file}`, import.meta.url));
const outputUrl = new URL("./build/extension/", import.meta.url);
const output = fileURLToPath(outputUrl);

export default defineConfig({
  root: source(""),
  base: "./",
  publicDir: false,
  plugins: [
    {
      name: "extension-assets",
      async writeBundle() {
        const manifest = JSON.parse(await readFile(source("manifest.json"), "utf8"));
        if (
          manifest.browser_specific_settings.gecko.id !== "{572d2b62-7dda-4e5e-b71f-e6480f4bd5cd}"
        ) {
          throw new Error("Unexpected fork identity");
        }
        await Promise.all([
          ...["manifest.json", "app-window.svg"].map((file) =>
            copyFile(source(file), new URL(file, outputUrl)),
          ),
          ...["LICENCE", "LUCIDE-LICENSE"].map((file) =>
            copyFile(new URL(`./${file}`, import.meta.url), new URL(file, outputUrl)),
          ),
        ]);
        const files = await readdir(output);
        if (files.includes("META-INF")) {
          throw new Error("Original signatures must not ship");
        }
      },
    },
  ],
  build: {
    outDir: output,
    emptyOutDir: true,
    target: "firefox148",
    minify: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    rolldownOptions: {
      input: {
        options: source("options.html"),
        background: source("background.ts"),
      },
      output: {
        assetFileNames: "assets/[name]-[hash][extname]",
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
});
