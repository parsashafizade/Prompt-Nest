import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const expectedPermissions = ["storage", "activeTab", "scripting", "contextMenus"];
if (JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error("Manifest permissions differ from the approved minimal set.");
}
if ("host_permissions" in manifest) throw new Error("host_permissions must not be present.");
if (!manifest.content_security_policy?.extension_pages?.includes("connect-src 'none'")) {
  throw new Error("Extension pages must block outbound connections in CSP.");
}

const executableExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);
const forbiddenFetchCalls = [
  // Ignore class/object method declarations such as KaTeX's `fetch() { ... }` parser helper.
  /(^|[^.\w$])fetch\s*\((?!\s*\)\s*\{)/m,
  /\b(?:globalThis|window|self)\s*(?:\.\s*fetch|\[\s*["']fetch["']\s*\])\s*\(/,
];
const forbiddenRuntimeCalls = [
  ...forbiddenFetchCalls,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /\bsendBeacon\s*\(/,
];

function executableFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return executableFiles(path);
    return executableExtensions.has(extname(path)) && !path.endsWith(".test.ts") ? [path] : [];
  });
}

for (const file of executableFiles("src")) {
  const source = readFileSync(file, "utf8");
  if (forbiddenRuntimeCalls.some((pattern) => pattern.test(source))) {
    throw new Error(`Forbidden network primitive found in ${file}.`);
  }
}

for (const file of executableFiles("dist")) {
  const source = readFileSync(file, "utf8");
  if (forbiddenFetchCalls.some((pattern) => pattern.test(source))) {
    throw new Error(`Unexpected fetch call found in built file ${file}.`);
  }
}

console.log("Offline runtime and manifest permission audit passed.");
