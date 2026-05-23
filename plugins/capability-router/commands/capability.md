---
name: capability
description: Route a task to the best Codex capability with Capability Router
argument-hint: "[task to route]"
---

Use the Capability Router plugin to select the best Codex tool, skill, or plugin for this task:

$ARGUMENTS

Call `capability_router.select` first. Use the top recommendation when confidence is at least `0.6`; otherwise explain the uncertainty and ask a concise clarification.
