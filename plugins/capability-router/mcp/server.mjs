#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { refreshRegistry, parseRoots } from "../src/indexer.mjs";
import { selectCapabilities } from "../src/selector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const cacheDir = path.join(pluginRoot, "data");
let registry = null;

const tools = [
  {
    name: "capability_router.select",
    description: "Rank installed Codex tools, skills, and plugins for a task using compact retrieval and policy masking.",
    inputSchema: {
      type: "object",
      properties: {
        request: { type: "string" },
        topK: { type: "number", default: 5 },
        constraints: { type: "object" },
        useVectors: { type: "boolean", default: true },
        vectorDimensions: { type: "number", default: 256 },
        refresh: { type: "boolean", default: false }
      },
      required: ["request"]
    }
  },
  {
    name: "capability_router.refresh_index",
    description: "Rescan installed Codex capabilities and rebuild the compact local registry.",
    inputSchema: { type: "object", properties: { roots: { type: "array", items: { type: "string" } } } }
  },
  {
    name: "capability_router.list_capabilities",
    description: "List the compact capability records currently known to the router.",
    inputSchema: { type: "object", properties: { kind: { type: "string" } } }
  },
  {
    name: "capability_router.explain",
    description: "Explain which capabilities match a task and why.",
    inputSchema: { type: "object", properties: { request: { type: "string" } }, required: ["request"] }
  }
];

async function currentRegistry(force = false, roots = null) {
  if (!registry || force) {
    registry = await refreshRegistry({
      roots: roots ?? parseRoots(process.env.CAPABILITY_ROUTER_ROOTS),
      cacheDir,
      pluginRoot,
      includeBuiltins: true
    });
  }
  return registry;
}

async function callTool(name, args = {}) {
  if (name === "capability_router.refresh_index") {
    const refreshed = await currentRegistry(true, args.roots ?? null);
    return { refreshedAt: refreshed.refreshedAt, count: refreshed.records.length, roots: refreshed.roots };
  }

  const active = await currentRegistry(Boolean(args.refresh));

  if (name === "capability_router.select") {
    return selectCapabilities({
      request: args.request,
      records: active.records,
      constraints: args.constraints ?? {},
      topK: args.topK ?? 5,
      cacheFile: path.join(cacheDir, "request-cache.json"),
      vectorFile: args.useVectors === false ? null : path.join(cacheDir, "vectors.json"),
      vectorDimensions: args.vectorDimensions ?? 256
    });
  }

  if (name === "capability_router.list_capabilities") {
    const records = args.kind ? active.records.filter((record) => record.kind === args.kind) : active.records;
    return { count: records.length, records };
  }

  if (name === "capability_router.explain") {
    const result = await selectCapabilities({
      request: args.request,
      records: active.records,
      topK: 5,
      vectorFile: path.join(cacheDir, "vectors.json")
    });
    return {
      explanation: result.recommended.length
        ? `Top match is ${result.recommended[0].kind}:${result.recommended[0].name} because ${result.recommended[0].reason}`
        : "No capability scored above zero. Refresh the index or clarify the task.",
      ...result
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(message) {
  if (message.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "capability-router", version: "0.1.0" }
    };
  }
  if (message.method === "tools/list") {
    return { tools };
  }
  if (message.method === "tools/call") {
    const result = await callTool(message.params?.name, message.params?.arguments ?? {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
  if (message.method === "notifications/initialized") {
    return undefined;
  }
  throw new Error(`Unsupported method: ${message.method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
      const result = await handle(message);
      if (message.id !== undefined && result !== undefined) {
        send({ jsonrpc: "2.0", id: message.id, result });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message?.id ?? null,
        error: { code: -32000, message: error.message }
      });
    }
  }
});

if (process.argv.includes("--stdio-smoke")) {
  const active = await currentRegistry(true, [pluginRoot]);
  process.stdout.write(JSON.stringify({ ok: true, count: active.records.length }, null, 2));
  process.exit(0);
}
