# Capability Router

Capability Router is a Codex plugin that indexes available tools, skills, and plugins, then exposes MCP tools for compact task routing.

## What It Provides

- `capability_router.select`: rank relevant capabilities for a task
- `capability_router.refresh_index`: rebuild the local capability registry
- `capability_router.list_capabilities`: inspect indexed capabilities
- `capability_router.explain`: explain a routing recommendation

The router uses metadata retrieval, local hashed embeddings, vector search, semantic result caching, policy filtering, and local caches to reduce how much capability context needs to be loaded for a task.

## Install

Use this folder as the distributable plugin root:

```text
plugins/capability-router
```

The repo-local marketplace entry is:

```text
.agents/plugins/marketplace.json
```

To install in another Codex:

1. Clone the repository.
2. Add or open `.agents/plugins/marketplace.json` in Codex.
3. Install or enable `capability-router`.
4. Register the MCP server:

   ```powershell
   npm run register:mcp --prefix plugins/capability-router
   ```

5. Restart Codex or reload plugins.
6. Type `/capability` or `/capability-router` in the composer.

For a personal local install, copy this folder to:

```text
$HOME\plugins\capability-router
```

Then add a marketplace entry in:

```text
$HOME\.agents\plugins\marketplace.json
```

pointing to:

```text
./plugins/capability-router
```

Then register the MCP server from the personal plugin copy:

```powershell
node "$HOME\plugins\capability-router\scripts\register-codex-mcp.mjs"
```

If the slash command appears but `capability_router.select` is not exposed, the command is installed but the MCP server is not active in the current Codex session. Register the MCP server and restart Codex.

## Slash Commands

The plugin includes:

- `/capability`
- `/capability-router`

The command definitions live in `commands/` and include explicit `name:` frontmatter so Codex can index them.

## Local Embeddings And Vectors

The plugin uses dependency-free local embeddings:

- `src/embeddings.mjs` converts task/capability text into deterministic hashed vectors.
- `src/vector-store.mjs` persists vectors in `data/vectors.json`.
- `src/selector.mjs` combines vector similarity with lexical scoring and intent boosts.

No hosted embedding API key or external vector database is required.

## Semantic Result Cache

The plugin stores prior routing results in `data/semantic-cache.json`.

When a later request has a similar local request vector and the capability set plus constraints have not changed, the selector can reuse the cached recommendation instead of re-running full ranking.

This is a KV-cache-like router optimization. It is not transformer KV cache.

## Test

```powershell
npm test --prefix plugins/capability-router
npm run eval --prefix plugins/capability-router
npm run register:mcp --prefix plugins/capability-router
npm run smoke --prefix plugins/capability-router -- "Fix a failing React checkout button test"
node plugins/capability-router/scripts/benchmark-context.mjs "Fix a failing React checkout button test by inspecting local files and running the focused test"
```

The routing eval suite is intentionally cross-category so broad skills cannot silently win only because their descriptions contain generic words.

## Limitations

This plugin performs soft masking and cache-backed local vector retrieval. It cannot force Codex to hide native tools, and it cannot access transformer-level KV cache unless Codex exposes such a runtime hook.
