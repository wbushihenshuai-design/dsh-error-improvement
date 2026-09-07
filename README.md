# DSH Error Improvement

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
3. On the first model step of each turn, the Host wraps the `agent/pre-step` waterfall and inspects the complete downstream message batch.
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
