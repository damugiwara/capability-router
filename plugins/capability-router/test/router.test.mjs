import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CacheStore } from "../src/cache.mjs";
import { embedText, cosineSimilarity } from "../src/embeddings.mjs";
import { refreshRegistry } from "../src/indexer.mjs";
import { applyPolicy } from "../src/policy.mjs";
import { selectCapabilities } from "../src/selector.mjs";
import { refreshVectorStore, searchVectorStore } from "../src/vector-store.mjs";

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "capability-router-"));
  const skillDir = path.join(root, "skills", "openai-docs");
  const pluginDir = path.join(root, "plugins", "browser", ".codex-plugin");
  await mkdir(skillDir, { recursive: true });
  await mkdir(pluginDir, { recursive: true });

  await writeFile(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      "name: openai-docs",
      "description: Use when the user asks how to build with OpenAI APIs, Agents SDK, or ChatGPT Apps.",
      "---",
      "",
      "# OpenAI Docs"
    ].join("\n")
  );

  await writeFile(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify(
      {
        name: "browser",
        description: "Browser automation for opening, inspecting, clicking, typing, and screenshotting web pages.",
        interface: {
          displayName: "Browser",
          shortDescription: "Automate and inspect browser pages."
        }
      },
      null,
      2
    )
  );

  return root;
}

test("refreshRegistry scans skills and plugin manifests into compact capability records", async () => {
  const root = await makeFixture();
  const registry = await refreshRegistry({ roots: [root], cacheDir: path.join(root, ".cache") });

  assert.equal(registry.records.length, 2);
  assert.deepEqual(
    registry.records.map((record) => `${record.kind}:${record.name}`).sort(),
    ["plugin:browser", "skill:openai-docs"]
  );
  assert.ok(registry.records.every((record) => record.description.length > 20));
});

test("selectCapabilities ranks relevant records and reports context savings", async () => {
  const root = await makeFixture();
  const registry = await refreshRegistry({ roots: [root], cacheDir: path.join(root, ".cache") });

  const result = await selectCapabilities({
    request: "Research and inspect this Wikipedia page in a browser",
    records: registry.records,
    topK: 1
  });

  assert.equal(result.recommended.length, 1);
  assert.equal(result.recommended[0].name, "browser");
  assert.equal(result.contextSavings.totalCapabilitiesIndexed, 2);
  assert.equal(result.contextSavings.capabilitiesReturned, 1);
});

test("selectCapabilities prefers web tools over generic research skills for Wikipedia page research", async () => {
  const records = [
    {
      id: "tool:web.open",
      kind: "tool",
      name: "web.open",
      description: "Open a public web page or URL and read content for source-grounded answers.",
      capabilities: ["network", "web", "research"]
    },
    {
      id: "skill:generic-research",
      kind: "skill",
      name: "generic-research",
      description: "Use for research, summarize, planning, and editing workflows.",
      capabilities: ["network", "research", "editing", "planning"]
    }
  ];

  const result = await selectCapabilities({
    request: "Research this Wikipedia page and summarize the important facts with citations.",
    records,
    topK: 2
  });

  assert.equal(result.recommended[0].name, "web.open");
});

test("applyPolicy masks capabilities that violate user constraints", () => {
  const records = [
    {
      id: "plugin:browser",
      kind: "plugin",
      name: "browser",
      description: "Browser automation for web pages.",
      capabilities: ["network", "browser"]
    },
    {
      id: "skill:local-files",
      kind: "skill",
      name: "local-files",
      description: "Read and edit local files.",
      capabilities: ["filesystem"]
    }
  ];

  const filtered = applyPolicy(records, { disallow: ["network"] });

  assert.deepEqual(filtered.allowed.map((record) => record.name), ["local-files"]);
  assert.match(filtered.maskedOutSummary, /network/);
});

test("embedText creates deterministic normalized local vectors", () => {
  const first = embedText("edit local source files with patch hunks", { dimensions: 64 });
  const second = embedText("edit local source files with patch hunks", { dimensions: 64 });
  const unrelated = embedText("generate a product image", { dimensions: 64 });

  assert.equal(first.length, 64);
  assert.deepEqual(first, second);
  assert.ok(cosineSimilarity(first, second) > 0.99);
  assert.ok(cosineSimilarity(first, unrelated) < 0.9);
});

test("vector store persists local embeddings and retrieves semantic capability matches", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "capability-vectors-"));
  const vectorFile = path.join(root, "vectors.json");
  const records = [
    {
      id: "tool:functions.apply_patch",
      kind: "tool",
      name: "functions.apply_patch",
      description: "Edit local files using patch hunks for precise code changes.",
      capabilities: ["filesystem", "editing"]
    },
    {
      id: "tool:image_gen.imagegen",
      kind: "tool",
      name: "image_gen.imagegen",
      description: "Generate or edit raster images from prompts.",
      capabilities: ["image", "generation"]
    }
  ];

  await refreshVectorStore({ records, vectorFile, dimensions: 64 });
  const search = await searchVectorStore({
    request: "repair a source file by changing code",
    records,
    vectorFile,
    topK: 1,
    dimensions: 64
  });

  assert.equal(search.results[0].record.name, "functions.apply_patch");
  assert.ok(search.results[0].vectorScore > 0);
});

test("selectCapabilities can use local vector retrieval and reports vector mode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "capability-vector-select-"));
  const records = [
    {
      id: "tool:functions.apply_patch",
      kind: "tool",
      name: "functions.apply_patch",
      description: "Edit local files using patch hunks for precise code changes.",
      capabilities: ["filesystem", "editing"]
    },
    {
      id: "tool:web.search_query",
      kind: "tool",
      name: "web.search_query",
      description: "Search the internet for current external information.",
      capabilities: ["network", "web", "search"]
    }
  ];

  const result = await selectCapabilities({
    request: "repair source code in this project",
    records,
    topK: 1,
    vectorFile: path.join(root, "vectors.json")
  });

  assert.equal(result.recommended[0].name, "functions.apply_patch");
  assert.equal(result.retrieval.mode, "hybrid-vector");
  assert.equal(result.contextSavings.vectorCandidatesConsidered, 2);
});

test("CacheStore avoids rewriting unchanged registry records by file hash", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "capability-cache-"));
  const cache = new CacheStore(path.join(root, "cache.json"));
  const file = path.join(root, "source.txt");
  await writeFile(file, "alpha");

  const first = await cache.hasFreshFile(file);
  assert.equal(first, false);
  await cache.rememberFile(file);
  const second = await cache.hasFreshFile(file);
  assert.equal(second, true);

  await writeFile(file, "beta");
  const third = await cache.hasFreshFile(file);
  assert.equal(third, false);

  const raw = JSON.parse(await readFile(path.join(root, "cache.json"), "utf8"));
  assert.ok(raw.files[file]);
});
