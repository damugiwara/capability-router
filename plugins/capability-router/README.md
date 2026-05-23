# Capability Router

Capability Router is a Codex plugin that indexes available tools, skills, and plugins, then exposes MCP tools for compact task routing.

## What it provides

- `capability_router.select`: rank relevant capabilities for a task
- `capability_router.refresh_index`: rebuild the local capability registry
- `capability_router.list_capabilities`: inspect indexed capabilities
- `capability_router.explain`: explain a routing recommendation

The router uses metadata retrieval, policy filtering, and local caches to reduce how much capability context needs to be loaded for a task.

## Install

Use the plugin folder at `plugins/capability-router` as the distributable plugin root. The repo-local marketplace entry is at `.agents/plugins/marketplace.json`.

## Test

```powershell
npm test --prefix plugins/capability-router
npm run smoke --prefix plugins/capability-router -- "Research this Wikipedia page"
node plugins/capability-router/scripts/benchmark-context.mjs "Research this Wikipedia page"
```

## Limitations

This plugin performs soft masking and cache-backed retrieval. It cannot force Codex to hide native tools, and it cannot access transformer-level KV cache unless Codex exposes such a runtime hook.
