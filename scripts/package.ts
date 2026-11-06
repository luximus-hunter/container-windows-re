import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { zipSync, type Zippable } from "fflate";
// Resolve from the project root so bundling cannot change asset paths.
const target = pathToFileURL(resolve("build/extension") + "/");
async function listFiles(directory: URL, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? listFiles(new URL(entry.name + "/", directory), prefix + entry.name + "/")
          : [prefix + entry.name],
      ),
    )
  ).flat();
}
const files = await listFiles(target);
if (files.some((file) => file.startsWith("META-INF/"))) {
  throw new Error("Original signatures must not ship");
}
const entries: Zippable = {};
const sortedFiles = files.sort();
const contents = await Promise.all(sortedFiles.map((file) => readFile(new URL(file, target))));
for (let index = 0; index < sortedFiles.length; ++index) {
  entries[sortedFiles[index]] = [contents[index], { mtime: new Date(2020, 0, 1), os: 0, attrs: 0 }];
}
const bytes = zipSync(entries, { level: 9 });
const output = new URL("../../dist/", target);
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(new URL("manifest.json", target), "utf8"));
const name = "container-windows-re-" + manifest.version + "-unsigned.zip";
await writeFile(new URL(name, output), bytes);
await writeFile(
  new URL(name + ".sha256", output),
  createHash("sha256").update(bytes).digest("hex") + "  " + name + "\n",
);
console.log("Packaged dist/" + name);
