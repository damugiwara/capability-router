import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanCapabilities } from "./scanner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLUGIN_ROOT = path.resolve(__dirname, "..");

export function parseRoots(value) {
  if (!value) return [process.cwd()];
  return value
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/^%USERPROFILE%/i, process.env.USERPROFILE ?? "")
        .replace(/^~/, process.env.HOME ?? process.env.USERPROFILE ?? "")
    );
}

export async function refreshRegistry({
  roots = [process.cwd()],
  cacheDir = path.join(DEFAULT_PLUGIN_ROOT, "data"),
  pluginRoot = DEFAULT_PLUGIN_ROOT,
  includeBuiltins = false
} = {}) {
  await mkdir(cacheDir, { recursive: true });
  const records = await scanCapabilities({ roots, pluginRoot, includeBuiltins });
  const registry = {
    version: 1,
    refreshedAt: new Date().toISOString(),
    roots,
    records
  };
  await writeFile(path.join(cacheDir, "registry.json"), JSON.stringify(registry, null, 2));
  return registry;
}
