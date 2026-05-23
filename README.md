# Capability Router

Capability Router is a Codex plugin that routes a task to the most relevant tool, skill, or plugin without loading every capability description into the active context.

It is designed for explicit use through natural language or slash commands:

```text
Use Capability Router for this task: fix a failing React checkout button test by inspecting local files and running the focused test.
```

```text
/capability fix a failing React checkout button test by inspecting local files and running the focused test
```

The router scans available Codex capabilities, builds a compact local registry, ranks the task against that registry, applies soft masking rules, and returns only the top candidates.

## Quick Start

See [USAGE.md](USAGE.md) for full installation instructions, including repo marketplace and personal local plugin setup.

After installing the plugin, register its MCP server in Codex:

```powershell
npm run register:mcp --prefix plugins/capability-router
```

Then restart Codex or open a new Codex session. The slash command can appear before the MCP server is registered, but the router cannot call `capability_router.select` until the MCP server is listed under `[mcp_servers]` in `~/.codex/config.toml`.

After installing, invoke the router with:

```text
/capability fix a failing React checkout button test by inspecting local files and running the focused test
```

or:

```text
Use Capability Router for this task: fix a failing React checkout button test by inspecting local files and running the focused test.
```

## Repository Layout

```text
.
|-- .agents/plugins/marketplace.json
|-- plugins/capability-router/
|   |-- .codex-plugin/plugin.json
|   |-- .mcp.json
|   |-- commands/
|   |   |-- capability.md
|   |   `-- capability-router.md
|   |-- data/builtin-capabilities.json
|   |-- mcp/server.mjs
|   |-- scripts/
|   |   |-- benchmark-context.mjs
|   |   `-- smoke-select.mjs
|   |-- skills/capability-router/SKILL.md
|   |-- src/
|   |   |-- embeddings.mjs
|   |   `-- vector-store.mjs
|   `-- test/
|-- USAGE.md
`-- TODO.md
```

The plugin root is `plugins/capability-router`. The repo-local marketplace entry is `.agents/plugins/marketplace.json`.

## Slash Commands

Capability Router includes two slash commands:

- `/capability`
- `/capability-router`

Use either command with a task argument. Full usage examples are in [USAGE.md](USAGE.md).

```text
/capability fix a failing React checkout button test by inspecting local files and running the focused test
```

The command definitions live in `plugins/capability-router/commands/` and include explicit `name:` frontmatter so Codex can index them as slash commands.

If a command does not appear immediately in Codex, restart the Codex app or reload local plugins so the command index is rebuilt.

## How It Works

1. Codex loads the plugin metadata, slash commands, and the `capability-router` skill.
2. The MCP registration in `~/.codex/config.toml` starts the local router server and exposes `capability_router.select`.
3. When you invoke `/capability`, `/capability-router`, or explicitly ask for routing, Codex calls the MCP tool `capability_router.select`.
4. The MCP server scans installed capability metadata:
   - skill frontmatter from `SKILL.md`
   - plugin manifests from `.codex-plugin/plugin.json`
   - bundled known Codex tool metadata from `data/builtin-capabilities.json`
5. The scanner normalizes each item into a compact capability record.
6. The local embedding layer turns capability records and the user request into deterministic hashed vectors.
7. The vector store persists capability vectors in `data/vectors.json` and retrieves nearest matches with cosine similarity.
8. The semantic result cache stores prior selections in `data/semantic-cache.json` and reuses them for similar requests when the capability set and constraints are unchanged.
9. The selector combines vector similarity with lexical scoring, inferred intent tags, and task-specific boosts.
10. The policy layer applies soft masking constraints such as disallowed network access.
11. The MCP server returns only the top relevant candidates, confidence scores, reasons, and context-savings metadata.

## Why It Reduces Token Usage

The traditional approach is to make many tool, skill, and plugin descriptions available in the model context so the model can choose directly. That is simple, but expensive: every capability description consumes prompt/context space.

Capability Router keeps the full catalog outside the main prompt in a local registry, local vector store, and semantic result cache. At task time it retrieves only the most relevant few records or reuses a previous result for a semantically similar request.

Measured in this workspace with 203 indexed capabilities:

| Task | Traditional Context | Router Context | Reduction |
|---|---:|---:|---:|
| React checkout button test fix | ~19,432 estimated tokens | ~434 estimated tokens | ~97.77% |
| Local code-edit task | ~19,399 estimated tokens | ~395 estimated tokens | ~97.96% |

These are deterministic payload estimates from `scripts/benchmark-context.mjs`, not hidden Codex internal prompt accounting. They measure the serialized capability context that would be needed by each approach.

## Current Limitations

- Soft masking only: the router can recommend or exclude capabilities, but cannot physically remove Codex-native tools from the model unless Codex exposes a hard tool-masking hook.
- Practical caching only: the router caches metadata, file hashes, local vectors, semantic selection results, request rankings, and registry output. It cannot access transformer-level KV cache inside Codex.
- Local embeddings are dependency-free hashed vectors, not transformer embeddings. Future versions can add optional hosted or local model embeddings for stronger semantic RAG.

## Development

Run tests:

```powershell
npm test --prefix plugins/capability-router
```

Run a smoke selection:

```powershell
npm run smoke --prefix plugins/capability-router -- "Fix a failing React checkout button test"
```

Run routing quality evals:

```powershell
npm run eval --prefix plugins/capability-router
```

Register or refresh the Codex MCP config:

```powershell
npm run register:mcp --prefix plugins/capability-router
```

Run the context benchmark:

```powershell
node plugins/capability-router/scripts/benchmark-context.mjs "Fix a failing React checkout button test by inspecting local files and running the focused test"
```
