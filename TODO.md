# Capability Router Future Plan

This file tracks future work for reducing or removing current Codex-native limitations.

## Hard Tool Masking

- [ ] Investigate whether Codex exposes a pre-tool-selection hook that can return an allowed tool list.
- [ ] If such a hook exists, add a hard-mask mode where `capability_router.select` returns `allowed_tools`.
- [ ] Add tests proving disallowed tools are not callable in hard-mask mode.
- [ ] If no Codex hook exists, build an external orchestrator prototype that calls an LLM with only the selected tools.
- [ ] Compare Codex-native soft masking against external-runtime hard masking on identical tasks.

## True KV Cache

- [ ] Track whether Codex exposes model-runtime prompt cache or KV-cache controls to plugins.
- [ ] If exposed, add stable prompt-prefix caching for capability instructions.
- [ ] If not exposed, keep improving practical substitutes:
  - [ ] registry cache
  - [x] local vector cache
  - [x] semantic result cache
  - [ ] hosted/model embedding cache
  - [x] retrieval result cache
  - [ ] ranking cache
  - [ ] explanation cache

## Stronger RAG

- [x] Add dependency-free local embedding-based retrieval.
- [x] Store local vectors in a small JSON vector store.
- [ ] Support transformer-based local embedding providers for stronger no-extra-API-cost usage.
- [ ] Add an adapter for hosted embedding APIs.
- [ ] Store vectors in SQLite or a small local vector index if the capability catalog grows beyond JSON scale.
- [ ] Benchmark lexical retrieval versus embedding retrieval.

## Better Capability Discovery

- [ ] Discover active MCP tool schemas when Codex exposes them.
- [ ] Detect installed plugins from all known marketplace files.
- [ ] Add file watchers for automatic incremental re-indexing.
- [ ] Add duplicate detection for skills/plugins installed in multiple locations.

## Evaluation

- [ ] Create a benchmark suite for common task categories:
  - [ ] web research
  - [ ] local code edits
  - [ ] debugging
  - [ ] image generation
  - [ ] spreadsheet/document tasks
  - [ ] database/Supabase tasks
- [ ] Track top-1 accuracy, top-3 accuracy, estimated token savings, and cache hit rate.
- [ ] Add regression tests for known misroutes.

## Distribution

- [ ] Add release packaging automation.
- [ ] Add versioned zip artifacts.
- [ ] Add installation screenshots or Codex app deeplinks if the platform supports stable plugin install URLs.
- [ ] Add a changelog once there is more than one release.
