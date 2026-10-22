import { createHash } from "node:crypto";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

const root = resolve(".");
const staticRoot = join(root, ".next", "static");

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    ),
  );
  return nested.flat();
}

const staticFiles = (await files(staticRoot))
  .filter((file) => /\.(js|css|woff2?|wasm|png|svg|json)$/.test(file))
  .sort();
if (!staticFiles.some((file) => file.endsWith(".js")))
  throw new Error("No production JavaScript found.");
const assets = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  ...staticFiles.map((file) => "/_next/static/" + relative(staticRoot, file).split(sep).join("/")),
];
const buildId = (await readFile(join(root, ".next", "BUILD_ID"), "utf8")).trim();
const template = await readFile(join(root, "scripts", "service-worker.js"), "utf8");
const version = createHash("sha256")
  .update(buildId)
  .update(template)
  .update(JSON.stringify(assets));
for (const icon of assets.filter((asset) => asset.startsWith("/icons/")))
  version.update(await readFile(join(root, "public", icon.slice(1))));
const versionId = version.digest("hex").slice(0, 20);
const cacheName = `mmf-studio-shell-${versionId}`;
const publicRoot = join(root, "public");
const shellName = `mmf-offline-${versionId}.html`;
const html = await readFile(join(root, ".next", "server", "app", "index.html"));
for (const entry of await readdir(publicRoot, { withFileTypes: true })) {
  if (entry.isFile() && /^mmf-offline-[0-9a-f]{20}\.html$/.test(entry.name))
    await unlink(join(publicRoot, entry.name));
}
await writeFile(join(publicRoot, shellName), html);
// Repairing an older worker must not cache a newer homepage with incompatible chunks.
assets[0] = `/${shellName}`;
const source = template
  .replace(
    'const CACHE_NAME = "__MMF_CACHE_NAME__";',
    `const CACHE_NAME = ${JSON.stringify(cacheName)};`,
  )
  .replace("const PRECACHE_URLS = [];", `const PRECACHE_URLS = ${JSON.stringify(assets)};`);
if (source === template || source.includes("__MMF_CACHE_NAME__"))
  throw new Error("Service worker template substitution failed.");
await writeFile(join(root, "public", "sw.js"), source);
console.log(
  `Offline shell prepared: ${assets.length} assets, including deferred spreadsheet code.`,
);
