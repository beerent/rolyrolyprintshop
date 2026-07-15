import { copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const output = new URL("./dist/", root);
const publicFiles = ["index.html", "app.js", "styles.css"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(
  publicFiles.map((file) => copyFile(new URL(file, root), new URL(file, output)))
);

console.log(`Built ${publicFiles.length} files in dist/.`);
