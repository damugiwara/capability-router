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

## Install In Codex

### Option 1: Install From The Repo Marketplace

1. Clone this repository.

   ```powershell
   git clone https://github.com/damugiwara/capability-router.git
   cd capability-router
   ```

2. In Codex, add or open the repo marketplace file:

   ```text
   .agents/plugins/marketplace.json
   ```

3. Install or enable `capability-router` from that marketplace.

4. Restart Codex or reload plugins so skills, MCP tools, and slash commands are indexed.

5. Type `/capability` in the composer. You should see the slash command.

### Option 2: Install As A Personal Local Plugin

Copy the plugin to your personal plugin folder:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\plugins" | Out-Null
Copy-Item -Recurse -Force ".\plugins\capability-router" "$HOME\plugins\capability-router"
```

Add this plugin entry to:

```text
$HOME\.agents\plugins\marketplace.json
```

```json
{
  "name": "capability-router",
  "source": {
    "source": "local",
    "path": "./plugins/capability-router"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

Restart Codex or reload plugins after updating the marketplace.

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
|   `-- test/
|-- USAGE.md
`-- TODO.md
```

The plugin root is `plugins/capability-router`. The repo-local marketplace entry is `.agents/plugins/marketplace.json`.

## Slash Commands

The plugin includes two command files:

- `/capability`
- `/capability-router`

Use either command with a task argument:

```text
/capability fix a failing React checkout button test by inspecting local files and running the focused test
```

The command definitions live in `plugins/capability-router/commands/` and include explicit `name:` frontmatter so Codex can index them as slash commands.

If a command does not appear immediately in Codex, restart the Codex app or reload local plugins so the command index is rebuilt.

## How It Works

1. Codex loads the plugin metadata, slash commands, MCP server config, and the `capability-router` skill.
2. When you invoke `/capability`, `/capability-router`, or explicitly ask for routing, Codex calls the MCP tool `capability_router.select`.
3. The MCP server scans installed capability metadata:
   - skill frontmatter from `SKILL.md`
   - plugin manifests from `.codex-plugin/plugin.json`
   - bundled known Codex tool metadata from `data/builtin-capabilities.json`
4. The scanner normalizes each item into a compact capability record.
5. The selector scores the user request against capability names, descriptions, inferred intent tags, and task-specific boosts.
6. The policy layer applies soft masking constraints such as disallowed network access.
7. The MCP server returns only the top relevant candidates, confidence scores, reasons, and context-savings metadata.

## Why It Reduces Token Usage

The traditional approach is to make many tool, skill, and plugin descriptions available in the model context so the model can choose directly. That is simple, but expensive: every capability description consumes prompt/context space.

Capability Router keeps the full catalog outside the main prompt in a local registry. At task time it retrieves only the most relevant few records.

Measured in this workspace with 203 indexed capabilities:

| Task | Traditional Context | Router Context | Reduction |
|---|---:|---:|---:|
| React checkout button test fix | ~19,408 estimated tokens | ~390 estimated tokens | ~97.99% |
| Local code-edit task | ~19,399 estimated tokens | ~395 estimated tokens | ~97.96% |

These are deterministic payload estimates from `scripts/benchmark-context.mjs`, not hidden Codex internal prompt accounting. They measure the serialized capability context that would be needed by each approach.

## Current Limitations

- Soft masking only: the router can recommend or exclude capabilities, but cannot physically remove Codex-native tools from the model unless Codex exposes a hard tool-masking hook.
- Practical caching only: the router caches metadata, file hashes, request rankings, and registry output. It cannot access transformer-level KV cache inside Codex.
- Retrieval is dependency-free lexical scoring in this MVP. A future version can add embeddings for stronger semantic RAG.

## Development

Run tests:

```powershell
npm test --prefix plugins/capability-router
```

Run a smoke selection:

```powershell
npm run smoke --prefix plugins/capability-router -- "Fix a failing React checkout button test"
```

Run the context benchmark:

```powershell
node plugins/capability-router/scripts/benchmark-context.mjs "Fix a failing React checkout button test by inspecting local files and running the focused test"
```
