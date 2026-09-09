# Changelog

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
