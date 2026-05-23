import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshRegistry } from "../src/indexer.mjs";
import { selectCapabilities } from "../src/selector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const registry = await refreshRegistry({
  roots: [pluginRoot],
  pluginRoot,
  cacheDir: path.join(pluginRoot, "data"),
  includeBuiltins: true
});
const result = await selectCapabilities({
  request:
    process.argv.slice(2).join(" ") ||
    "Fix a failing React checkout button test by inspecting local files and running the focused test",
  records: registry.records,
  topK: 3,
  vectorFile: path.join(pluginRoot, "data", "vectors.json")
});

console.log(JSON.stringify(result, null, 2));
