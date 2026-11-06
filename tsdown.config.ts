import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["scripts/package.ts"],
  outDir: "build/tools",
  platform: "node",
  target: "node22",
  format: "esm",
  dts: false,
  clean: true,
  deps: { onlyBundle: ["fflate"] },
  outExtensions: () => ({ js: ".mjs" }),
});
