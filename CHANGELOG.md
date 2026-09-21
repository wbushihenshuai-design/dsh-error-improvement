# Changelog

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
