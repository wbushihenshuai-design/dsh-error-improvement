# DSH Error Improvement

English | [中文](README.zh.md)

A standalone DeepSeek Harness plugin that turns **user-confirmed mistakes** into bounded pre-task checks, helping an agent avoid repeating the same error.

It is intentionally independent from EverOS, memory services, databases, browsers, and network APIs. The only persistent state is the normal DSH settings namespace `error-improvement`.

**Tested with DSH 0.1.2-rc.1** (Node 22.19+ or 24+).

## Safety contract

- A lesson is injected only when its `confirmed` checkbox is enabled.
- The plugin never creates lessons automatically from model output.
- It never executes tools or changes permissions.
- It never modifies Desktop mode, browser access, network exposure, sandbox presets, or approval policy.
- Injected text uses plugin provenance (`form: instructions`), never direct-user provenance.
- Stored lesson text is fenced, control-character cleaned, role-tag encoded (all `<` and `>` are escaped), count-limited, and character-limited.
- Lessons are rendered atomically: a lesson is included only if the entire block fits the character budget; otherwise it is omitted entirely (no mid-rule truncation).
- Any runtime rendering failure fails open: the original downstream agent decision is returned unchanged.

## How it works

1. The Host registers the `error-improvement` settings section through DSH's settings provider.
2. In **Settings → 错误改进**, the user records a mistake, a prevention rule, optional scope/keywords, and explicitly confirms it.
3. On every model step of each turn, the Host wraps the `agent/pre-step` waterfall and inspects the complete downstream message batch. Unlike a one-shot injection at the first step only, this ensures prevention rules are visible before **every** LLM call — including follow-up tool calls that the model makes within the same turn.
4. `assist` mode injects only lessons whose explicit scope/keywords match the current direct-user message. Latin/digit keywords require whole-token equality (no substring false positives); CJK uses bigram matching. If scope/keywords are blank, it falls back to conservative multi-term matching.
5. `strict` mode injects all enabled, confirmed, complete lessons up to the configured limits.

`strict` is a stronger prompt policy, **not hard enforcement**. It never expands model or tool capabilities.

## Settings

| Field | Default | Meaning |
| --- | ---: | --- |
| `enabled` | `true` | Enables lesson injection. |
| `mode` | `assist` | `assist` matches relevant rules; `strict` injects all eligible rules. |
| `maxLessons` | `5` | Maximum injected rules per turn, clamped to 1–50. |
| `maxChars` | `6000` | Maximum complete lesson block, clamped to 500–50000 characters. |
| `lessons[]` | `[]` | User-managed lesson records. |

### Context compaction

| Field | Default | Meaning |
| --- | ---: | --- |
| `compaction.enabled` | `true` | Enables automatic pre-step pressure compaction and context-overflow recovery. |
| `compaction.thresholdRatio` | `0.8` | Start normal compaction once the active conversation route reaches this fraction of its advertised context window. |
| `compaction.retainRatio` | `0.16` | Recent conversation fraction retained verbatim; it must be lower than `thresholdRatio`. |
| `compaction.summarizationProvider` / `summarizationModel` | empty | Primary summary route. Leave both empty to use the active conversation route. The pair must be complete or both blank. |
| `compaction.fallbackSummarizationProvider` / `fallbackSummarizationModel` | empty | Explicit fallback summary route when the primary call fails (for example, exhausted balance or authentication/provider failure). The pair must be complete or both blank. |
| `compaction.maxTokens` | `8192` | Maximum summary output tokens. |

When the primary route is configured but its summary call fails, the plugin tries the explicit fallback route once. If no explicit fallback is set, it retries using the current conversation route when that is different. It never chooses an arbitrary provider/model: a route must already be known to DSH, so recovery stays predictable and reproducible. The upstream DSH engine records the normal durable transaction (`compaction/start` → summary → checkpoint replacement → `compaction/end`) and then retries a context-overflow request only after the replacement was committed.

> ⚠️ **Threshold and summarization model context window.**
> If your summarization model has the same advertised context window as your conversation model, the default threshold of `0.8` (80 %) can cause a chicken-and-egg problem: the compaction engine fires once the conversation reaches 80 % of the context window, but the summarization call then sends the full conversation to the same model and overflows its limit. **Set `compaction.thresholdRatio` to `0.5` or lower** so compaction starts well before the conversation fills the window, leaving enough headroom for the summarization request. Alternatively, configure a different summarization model with a larger context window.

A lesson contains:

```json
{
  "id": "stable-unique-id",
  "title": "Verify the active profile",
  "mistake": "Edited a different profile from the one used by Desktop",
  "prevention": "Confirm the active profile before editing any profile files",
  "scope": "DSH Desktop profile changes",
  "keywords": "desktop profile package.json",
  "confirmed": true,
  "enabled": true
}
```

## Install into DSH Desktop

> **Do not edit DSH Desktop security settings** (mode, openBrowser, networkExposure, sandbox presets). Install through the normal DSH profile plugin mechanism, then restart DSH Desktop once.

### From GitHub (recommended)

Add this to your DSH Desktop profile's `package.json` (the file at `C:\Users\<you>\.dsh\profiles\desktop\package.json`):

```json
{
  "dependencies": {
    "dsh-error-improvement": "https://github.com/wbushihenshuai-design/dsh-error-improvement"
  }
}
```

Also add `"dsh-error-improvement"` to the `dsh.profile.bundles` array in the same file.

Then run in the profile directory:

```powershell
pnpm install
```

Restart DSH Desktop. The settings section appears under **Settings → 错误改进**.

### From a local checkout (development)

```json
{
  "dependencies": {
    "dsh-error-improvement": "link:D:/work/DS/dsh-error-improvement"
  }
}
```

Preserve all existing bundles and dependencies when merging. The plugin's `cordis.patch.yml` mounts exactly one Host row; its `dsh.client` metadata loads the Settings UI.

### Before installing into a live Desktop profile

- Run `npm run ci` in this repository.
- Make a backup of the profile's `package.json`, lockfile, and `cordis.patch.yml`.
- This repository does not include an auto-installer because silently rewriting a live profile is unsafe.

## Build and verify

Requires Node.js 22.19+ or 24+.

```powershell
npm install
npm run ci
npm run pack:check
```

The CI command performs formatting/lint checks, TypeScript checks, 24 Host/client/matching/integration tests, production build, safety preflight scan (all published JS files), and a clean-consumer pack smoke test that installs the tarball into a fresh `node_modules` and imports the real artifact.

## Development layout

- `src/index.ts` — Host registration and pre-step middleware.
- `src/lessons.ts` — schema, matching, sanitization, atomic rendering, message provenance.
- `src/client.js` — immediately loaded Settings UI with conflict-aware save controller.
- `test/` — Host, matching, safety, client controller, and integration tests.
- `scripts/preflight.mjs` — scans all published JS for forbidden coupling.
- `scripts/pack-smoke.mjs` — clean-consumer tarball install + import verification.

## Privacy

No telemetry and no network requests. Lessons remain in the user's DSH settings document and are sent only as part of the local agent context when selected.

## License

[MIT](LICENSE) © 2026 wbushihenshuai-design
