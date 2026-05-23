import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CacheStore } from "../src/cache.mjs";
import { refreshRegistry } from "../src/indexer.mjs";
import { applyPolicy } from "../src/policy.mjs";
import { selectCapabilities } from "../src/selector.mjs";

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
