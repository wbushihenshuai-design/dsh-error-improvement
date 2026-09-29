# Changelog

## 0.3.1

- **Fix (critical): `agent/turn-stopping` handler no longer calls a non-existent `next`.** That hook is *serial* — the host dispatches it with the payload `{ agent, turn, signal }` only (see `dsh-tool-cordis` api-catalog: `'agent/turn-stopping'(payload): Promise<void> | void`). 0.3.0 declared it as a waterfall (`async (payload, next) => await next()`), so every turn end threw `TypeError: next is not a function`, which the agent runtime reported as `agent turn failed`. The handler is now synchronous and fully fail-open.
- **Fix: `/error-improvement` RPC actually registers.** `connection.rpc.handle()` mounts its route through the *reading* context (`owner.effect(() => owner.webServer.register(route))` in `@deepseek-ai/dsh-client-connection`), so the inject scope must include `webServer`. 0.3.0 injected only `connection`, which made cordis throw `cannot get property "webServer" without inject` inside `apply()` — the plugin fork died, the settings page stayed on "无法连接 Host", and the half-mounted hooks kept running. The scope is now `ctx.inject(["connection", "webServer"], …)` with an inner try/catch so a missing service degrades to a warning instead of killing the plugin.

## 0.3.0

- **Breaking: compaction wrapper removed.** This plugin no longer ships a context-compaction engine; use the official `compaction-basic` plugin instead (configure it via `~/.dsh/profiles/<profile>/cordis.patch.yml`). This removes the `summarization*` / `thresholdRatio` / `modelPolicies` settings surface.
- **Breaking: settings migration to DSH 2.0.15.** The plugin now declares its configuration as a Schemastery `Config` schema consumed from `cordis.patch.yml`; the legacy `settings.installSection` / `settings.register` integration (removed by the 2.0.15 host) is gone. **Legacy `~/.dsh/settings.yaml` values are *not* auto-migrated into `cordis.patch.yml`** — defaults apply until you reconfigure there; only *data* is migrated.
- **New: agent memory layer ("never repeat a mistake").** Markdown-native memory directory at `$DSH_HOME/error-improvement/memory/` (`lessons.md`, `recipes.md`, `decisions.md`, `candidates.jsonl`, `drafts/`) — atomic tmp+rename writes, fail-open everywhere. Legacy v1 `state.json` (errors/promotions/recipes) and the old `error-improvement:` settings section are imported automatically on first run.
- **New: auto-capture + LLM distillation (assist mode).** Zero-LLM capture of tool errors and turn outcomes (skipped for delegated sessions, capped per session) feeds a two-stage Curator→Writer distillation that proposes *draft* entries. **Every draft requires explicit user confirmation** before it becomes memory — nothing writes to memory silently (the agent-invoked `improve_record_recipe` tool, which records an already-verified solution, is the deliberate exception).
- **New: draft review UI + RPC.** A settings-page section ("待确认草稿" / pending drafts) lists drafts with approve/reject; an agent-facing `improve_review_drafts` tool and a `/error-improvement` RPC channel (`drafts.list|get|approve|reject|update`, `memory.stats`) back it.
- **New: turn-signal maturity + skill graduation.** Presented entries that coincided with a successful, non-regressing turn gain `hits`; maturity evolves `draft → validated (≥2) → core (≥5)`. Entries crossing the graduation threshold (`graduation.minHits`, default 3) are auto-*proposed* as skills — again confirmation-gated — and on approval are written as `$DSH_HOME/skills/<slug>/SKILL.md` (agentskills.io-style frontmatter; refuses to overwrite existing files).
- **Enforcement keeps working on 2.0.15.** Error-signature statistics, warn/deny promotion rules, and cooldown interception are unchanged in behavior, with all hooks mounted via structural event casts and fail-open guards.
- **Tests/CI**: 32 node:test cases covering store/lessons/recipes/enforcement/drafts/signals/graduation/host-apply; biome lint, `tsc` strict (incl. `noUncheckedIndexedAccess`), preflight, and pack-smoke all gate the release.

## 0.2.0

- **New: enforcement loop (repeated errors become rules).** The plugin now observes `tools/post-execute` and counts identical tool failures (same tool + same normalized error signature, persisted across restarts in `$DSH_HOME/error-improvement/state.json`). When a failure crosses `enforcement.threshold` (default 3), it is promoted into a rule — linked to a matching confirmed lesson when one exists, otherwise as an auto-rule synthesized from the error.
- **New: pre-execution interception.** Promoted rules are enforced on `tools/pre-execute` before the matching call runs (same tool + overlapping arguments). Two modes per rule: `warn` (default) intercepts the call once per `enforcement.warnCooldownMs` (default 1h) with the prevention reason, then allows an immediate retry; `deny` always blocks. Downstream allow/deny/ask decisions are never weakened, and every hook fails open.
- **New: success recipes.** A symmetric knowledge base for *proven solutions* so solved problems are not re-derived from scratch. Recipes render in a `<success_recipes>` block alongside lessons through the same relevance engine (CJK-aware, budget-shared via `maxChars`, capped by `maxRecipes`, default 3). Sources: the `recipes` settings section and runtime-recorded entries.
- **New: `improve_record_recipe` tool.** The agent can record a verified solution (title/problem/solution/scope/keywords) the moment it succeeds; the recipe is persisted and becomes eligible for injection on future matching tasks. `asSkill: true` additionally graduates the recipe into a standalone skill file at `$DSH_HOME/skills/<slug>/SKILL.md`.
- **Settings**: new `recipes`, `maxRecipes`, and `enforcement` (`enabled`/`threshold`/`defaultMode`/`warnCooldownMs`/`maxRules`) sections, all defaulted and backward compatible with 0.1.x configuration files.

## 0.1.1

- **Fix**: Resolved JavaScript Proxy invariant violation caused by `Object.freeze()` on the compaction config target. The `modelPolicies` proxy trap returned a different frozen array reference, triggering a hard invariant check failure. Now uses an unfrozen shallow copy as the Proxy target. The engine mounts synchronously and works in both Desktop and Web hosts.
- **Fix**: Lessons are now injected at **every model step** (removed the `step !== 1` restriction). Previously lessons were only injected at the first step of each turn, so the model could still make the same mistake on later tool calls within the same turn. Now prevention rules are shown before every LLM call.
- **Fix**: Compaction engine now mounts synchronously via module-level `inject` declaration instead of lazy `ctx.inject`, ensuring reliable availability for both standalone and Web-hosted scenarios.
- **Fix**: Model catalog is retried and normalized when loading locales, improving robustness across DSH hosts.
- **New**: Dynamic compaction model selectors: `summarizationProvider`/`summarizationModel` and `fallbackSummarizationProvider`/`fallbackSummarizationModel` settings, so users can route compaction summaries through a different model than the conversation model.
- **New**: Durable compaction fallback chain — primary → explicit fallback → conversation-route fallback — each tried once, with no arbitrary model selection.
- **Note**: The compaction `thresholdRatio` default is `0.8` (80%). If your summarization model has the same context window as your conversation model, set a lower threshold (e.g., `0.5`) so compaction starts before the conversation fills the context window, leaving room for the summarization request. See the README for details.

## 0.1.0

- Initial standalone Host and Settings UI.
- Explicit user confirmation gate for every lesson.
- Assist and strict prompt modes.
- Relevance scoring with explicit scope/keyword preference and CJK support.
- Bounded, sanitized, provenance-preserving lesson messages.
- DSH 0.1.2-rc.1 pre-step and settings-provider compatibility tests.
- No EverOS, external service, or Desktop security coupling.
