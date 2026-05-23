---
name: capability-router
description: Use when the user explicitly asks to route, rank, mask, compare, explain, or optimize Codex tool, skill, plugin, or capability selection for a task; use when the user names Capability Router or asks to reduce tool-selection context usage.
---

# Capability Router

Use this skill as an explicit pre-selection step for Codex capabilities.

1. Call `capability_router.select` with the user's task.
2. Prefer the top recommendation when its confidence is at least `0.6`.
3. If confidence is lower, use the alternates and reason field to decide or ask a concise clarification.
4. Do not load unrelated skill bodies or plugin details before routing.
5. After selecting, call the recommended tool/skill/plugin normally.

Use `capability_router.refresh_index` after installing, removing, or updating Codex skills/plugins.
Use `capability_router.explain` when the user asks why a capability was chosen.
