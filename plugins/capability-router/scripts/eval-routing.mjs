#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshRegistry, parseRoots } from "../src/indexer.mjs";
import { selectCapabilities } from "../src/selector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const casesFile = process.env.CAPABILITY_ROUTER_EVAL_CASES || path.join(pluginRoot, "data", "routing-eval-cases.json");
const topK = Number(process.env.CAPABILITY_ROUTER_EVAL_TOP_K ?? 5);
const minTop1 = Number(process.env.CAPABILITY_ROUTER_EVAL_MIN_TOP1 ?? 0.8);
const minTop3 = Number(process.env.CAPABILITY_ROUTER_EVAL_MIN_TOP3 ?? 0.95);

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

const roots = process.env.CAPABILITY_ROUTER_EVAL_ROOTS
  ? parseRoots(process.env.CAPABILITY_ROUTER_EVAL_ROOTS)
  : defaultRoots();

const cases = JSON.parse(await readFile(casesFile, "utf8"));
const registry = await refreshRegistry({
  roots,
  cacheDir: path.join(pluginRoot, "data"),
  pluginRoot,
  includeBuiltins: true
});
const availableIds = new Set(registry.records.map((record) => record.id));
const results = [];

for (const testCase of cases) {
  const availableExpected = testCase.expectedAny.filter((id) => availableIds.has(id));
  if (!availableExpected.length) {
    results.push({ ...testCase, skipped: true, reason: "No expected capability is installed." });
    continue;
  }

  const routed = await selectCapabilities({
    request: testCase.query,
    records: registry.records,
    topK,
    cacheFile: null,
    vectorFile: path.join(pluginRoot, "data", "vectors.json"),
    semanticCacheFile: null
  });
  const rankedIds = routed.recommended.map((item) => item.id);
  const top1 = rankedIds[0] ?? null;
  const top3 = rankedIds.slice(0, 3);
  const blockedTop1 = (testCase.mustNotTop1 ?? []).includes(top1);

  results.push({
    id: testCase.id,
    category: testCase.category,
    query: testCase.query,
    expectedAny: availableExpected,
    top1,
    top3,
    top1Pass: availableExpected.includes(top1),
    top3Pass: top3.some((id) => availableExpected.includes(id)),
    blockedTop1,
    recommended: routed.recommended
  });
}

const evaluated = results.filter((result) => !result.skipped);
const top1Passes = evaluated.filter((result) => result.top1Pass).length;
const top3Passes = evaluated.filter((result) => result.top3Pass).length;
const blocked = evaluated.filter((result) => result.blockedTop1);
const top1Accuracy = evaluated.length ? top1Passes / evaluated.length : 0;
const top3Accuracy = evaluated.length ? top3Passes / evaluated.length : 0;
const failures = evaluated.filter((result) => !result.top1Pass || !result.top3Pass || result.blockedTop1);

const summary = {
  cases: cases.length,
  evaluated: evaluated.length,
  skipped: results.length - evaluated.length,
  top1Accuracy: Number(top1Accuracy.toFixed(4)),
  top3Accuracy: Number(top3Accuracy.toFixed(4)),
  blockedTop1: blocked.length,
  thresholds: { minTop1, minTop3 },
  failures,
  skippedCases: results.filter((result) => result.skipped).map((result) => ({
    id: result.id,
    category: result.category,
    reason: result.reason
  }))
};

console.log(JSON.stringify(summary, null, 2));

if (top1Accuracy < minTop1 || top3Accuracy < minTop3 || blocked.length) {
  process.exitCode = 1;
}
