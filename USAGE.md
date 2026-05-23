# Using Capability Router In Another Codex

## Install From This Repository

1. Clone the repository.

   ```powershell
   git clone <repo-url>
   cd <repo-folder>
   ```

2. Open the repo-local marketplace in Codex.

   The marketplace file is:

   ```text
   .agents/plugins/marketplace.json
   ```

3. Install or enable `capability-router` from that marketplace.

4. Confirm the plugin root exists:

   ```text
   plugins/capability-router
   ```

## Install Manually As A Personal Plugin

Copy the plugin folder into your personal plugin directory:

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\plugins" | Out-Null
Copy-Item -Recurse -Force ".\plugins\capability-router" "$HOME\plugins\capability-router"
```

Then add this entry to `$HOME\.agents\plugins\marketplace.json`:

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

## How To Invoke It

Mention Capability Router explicitly:

```text
Use Capability Router for this task: research this Wikipedia page and summarize it.
```

```text
Use capability-router to choose the best tool for this task: edit the local React component to fix the failing button test.
```

```text
Use Capability Router to explain which capability should handle this task: generate an image from this prompt.
```

## Refresh The Index

After installing or removing skills/plugins:

```text
Use Capability Router to refresh its capability index.
```

## Available MCP Tools

- `capability_router.select`: choose ranked capability candidates for a task
- `capability_router.refresh_index`: rebuild the local capability registry
- `capability_router.list_capabilities`: list indexed records
- `capability_router.explain`: explain the routing decision

## Test Locally

```powershell
npm test --prefix plugins/capability-router
node plugins/capability-router/mcp/server.mjs --stdio-smoke
npm run smoke --prefix plugins/capability-router -- "Research this Wikipedia page"
```

