import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshRegistry, parseRoots } from "../src/indexer.mjs";
import { selectCapabilities } from "../src/selector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const request =
  process.argv.slice(2).join(" ") ||
  "Fix a failing React checkout button test by inspecting local files and running the focused test.";

function defaultRoots() {
  const roots = [process.cwd(), pluginRoot];
  if (process.env.USERPROFILE) {
    roots.push(path.join(process.env.USERPROFILE, ".codex"));
    roots.push(path.join(process.env.USERPROFILE, ".agents"));
  }
  if (process.env.HOME) {
    roots.push(path.join(process.env.HOME, ".codex"));
    roots.push(path.join(process.env.HOME, ".agents"));
  }
  return [...new Set(roots)];
}

function estimateTokens(text) {
  // Cheap, deterministic approximation. It is intentionally not model-specific.
  return Math.ceil(text.length / 4);
}

function compactRecord(record) {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    description: record.description,
    capabilities: record.capabilities ?? []
  };
}

const roots = process.env.CAPABILITY_ROUTER_BENCH_ROOTS
  ? parseRoots(process.env.CAPABILITY_ROUTER_BENCH_ROOTS)
  : defaultRoots();

const registry = await refreshRegistry({
  roots,
  cacheDir: path.join(pluginRoot, "data"),
  pluginRoot,
  includeBuiltins: true
});

const normalPayload = JSON.stringify({
  request,
  capabilities: registry.records.map(compactRecord)
});

const routed = await selectCapabilities({
  request,
  records: registry.records,
  topK: Number(process.env.CAPABILITY_ROUTER_BENCH_TOP_K ?? 5),
  cacheFile: path.join(pluginRoot, "data", "request-cache.json"),
  vectorFile: path.join(pluginRoot, "data", "vectors.json")
});

const pluginPayload = JSON.stringify({
  request,
  recommendation: routed.recommended,
  maskedOutSummary: routed.maskedOutSummary,
  contextSavings: routed.contextSavings
});

const normalChars = normalPayload.length;
const pluginChars = pluginPayload.length;
const normalTokens = estimateTokens(normalPayload);
const pluginTokens = estimateTokens(pluginPayload);
const savedTokens = normalTokens - pluginTokens;
const reductionPercent = normalTokens > 0 ? (savedTokens / normalTokens) * 100 : 0;

console.log(
  JSON.stringify(
    {
      request,
      roots,
      capabilitiesIndexed: registry.records.length,
      normalApproach: {
        payloadChars: normalChars,
        estimatedTokens: normalTokens,
        description: "All compact capability metadata serialized into context."
      },
      pluginApproach: {
        payloadChars: pluginChars,
        estimatedTokens: pluginTokens,
        capabilitiesReturned: routed.recommended.length,
        cacheHit: routed.cache.hit,
        retrieval: routed.retrieval,
        topRecommendation: routed.recommended[0] ?? null,
        description: "Only router recommendation payload serialized into context."
      },
      savings: {
        estimatedTokens: savedTokens,
        reductionPercent: Number(reductionPercent.toFixed(2))
      }
    },
    null,
    2
  )
);
