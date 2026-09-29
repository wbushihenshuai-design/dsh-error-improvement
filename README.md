# DSH Error Improvement

English | [中文](README.zh.md)

A DeepSeek Harness plugin that turns **user-confirmed experience** into a durable agent memory: mistakes become prevention rules, proven fixes become recipes, and battle-tested entries graduate into standalone skills.

It is intentionally independent from EverOS, memory services, databases, browsers, and network APIs. All persistent state lives in plain files under `$DSH_HOME/error-improvement/`.

**Targets DSH 2.0.15+** (Node 22.19+ or 24+). For 0.1.x hosts use release 0.2.x.

## Safety contract

- A memory entry is injected only when `confirmed: true`. **Every auto-captured lesson lands in `drafts/` first and requires explicit user approval** — the plugin never writes model output into memory silently. (Deliberate exception: the agent-invoked `improve_record_recipe` tool, which records an already-verified solution.)
- It never executes tools or changes permissions, Desktop mode, browser access, network exposure, sandbox presets, or approval policy.
- Injected text uses plugin provenance (`form: instructions`), never direct-user provenance; subagents are told not to re-inject or re-record (`<SUBAGENT-STOP>` recursion guard).
- Stored text is control-character cleaned, role-tag encoded (all `<` and `>` are escaped), count-limited, and character-limited; files are written atomically (tmp + rename).
- Lessons are rendered atomically: an entry is included only if the entire block fits the character budget; otherwise it is omitted entirely (no mid-rule truncation).
- Every hook and every file/LLM operation **fails open**: a plugin error never blocks the tool pipeline or the agent loop.

## How it works

### Memory layer (0.3.0)

Plain Markdown (with structured fields) is the single source of truth:

```
$DSH_HOME/error-improvement/memory/
  lessons.md       # confirmed mistakes → prevention rules
  recipes.md       # confirmed proven solutions
  decisions.md     # user decisions (e.g. rejected drafts, with reason)
  candidates.jsonl # zero-LLM capture queue
  drafts/          # pending drafts awaiting user confirmation
$DSH_HOME/error-improvement/state.json   # error statistics + enforcement rules (v2)
$DSH_HOME/skills/<slug>/SKILL.md         # graduated skills
```

1. **Capture (zero LLM).** Turn outcomes and tool errors from direct sessions (delegated sessions are skipped) are queued into `candidates.jsonl` — capped per session and per text size.
2. **Distillation (LLM, gated).** When the queue reaches `capture.minQueueSize` **and** `capture.minIntervalMs` has passed, a two-stage Curator→Writer run proposes draft entries into `drafts/`. Empty results return a sentinel (`FLUSH_OK`) and retry later; nothing is written to memory.
3. **Confirmation gate.** Drafts appear in **Settings → 错误改进 → 待确认草稿** (list, edit, approve, reject). The agent can also list and act on them via the **`improve_review_drafts`** tool. Approval writes the entry (confirmed) into the memory file; rejection logs a decision entry. Approving a draft whose `supersedes` points at an older entry disables the predecessor (never deletes).
4. **Injection.** On every model step of each turn the `agent/pre-step` waterfall selects relevant confirmed lessons (`assist` mode scores by scope/keywords with CJK bigram matching; `strict` injects all eligible entries; `off` disables injection) and renders them plus recipes inside one bounded, budget-measured block.
5. **Turn signals & maturity.** Entries presented during a turn that ended successfully (no new enforcement promotions, failures ≤ successes) gain a `hit`. Maturity evolves `draft → validated (≥2 hits) → core (≥5 hits)`.
6. **Skill graduation.** Validated/core entries reaching `graduation.minHits` (default 3) are **proposed** as skills — again through a confirmation draft — and on approval written as `$DSH_HOME/skills/<slug>/SKILL.md` (agentskills.io-style frontmatter; refuses to overwrite existing files; the source entry is marked `core` and gains a `skill:` evidence note).

### Repeated errors graduate into rules (0.2.0)

1. The Host listens to `tools/post-execute` and counts identical failures (same tool + same normalized error signature, long hex/digit runs collapsed). Counts persist across restarts in `state.json`.
2. Once a failure crosses `enforcement.threshold` (default **3**), it is promoted into a rule — linked to a matching confirmed lesson when one exists, otherwise synthesized from the error sample as an auto-rule.
3. Matching future calls (same tool + sufficiently overlapping arguments) are intercepted on `tools/pre-execute`:
   - `warn` (default): intercepts once per cooldown window (`warnCooldownMs`, default 1h), showing the model the prevention reason; an immediate retry is allowed — a reminder, not a blockade;
   - `deny`: always blocks, for calls that must never happen again.
4. Every hook fails open and never weakens an existing downstream deny/ask into an allow. Rules are capped by `maxRules` (default 20); only the oldest auto-rules are evicted beyond the cap, lesson-linked rules are kept.

### Success recipes

- After solving a non-trivial problem, the agent can call the **`improve_record_recipe`** tool to persist the *verified* solution (title/problem/solution/scope/keywords) into `recipes.md` as a confirmed entry.
- Recipes share the lessons' relevance engine (including CJK bigrams) and render in a `<success_recipes>` block next to the lessons, so a recurring problem is answered with the proven fix instead of being re-derived from scratch.

## Configuration

Configuration is declared as a Schemastery schema and lives in the profile's `cordis.patch.yml` (`~/.dsh/profiles/<profile>/cordis.patch.yml`). Fields marked volatile are live-editable from the settings page without a plugin remount.

| Field | Default | Meaning |
| --- | ---: | --- |
| `enabled` | `true` | Master switch for injection, enforcement, capture and graduation. |
| `mode` | `assist` | `assist` = inject relevant lessons as advice; `strict` = inject all confirmed lessons as rules; `off` = capture only, no injection. |
| `maxLessons` | `5` | Maximum lessons injected per turn (1–50). |
| `maxChars` | `6000` | Hard character budget for the lessons + recipes injection block (500–50000). |
| `maxRecipes` | `3` | Maximum success recipes injected per turn (0–20). |
| `enforcement.enabled` | `true` | Intercept tool calls that repeat a known failure signature. |
| `enforcement.threshold` | `3` | Identical tool errors before a runtime rule is promoted (2–10). |
| `enforcement.defaultMode` | `warn` | `warn` = intercept once per cooldown; `deny` = block repeats. |
| `enforcement.warnCooldownMs` | `3600000` | Minimum interval between two warnings of the same rule. |
| `enforcement.maxRules` | `20` | Cap of runtime auto-rules; oldest unlinked rules are evicted. |
| `capture.enabled` | `true` | Observe turns and queue candidate lessons/recipes (no LLM). |
| `capture.distillEnabled` | `true` | Periodically distill the queue into user-confirmation drafts (LLM). |
| `capture.minQueueSize` | `3` | Minimum queued candidates before a distillation run. |
| `capture.minIntervalMs` | `1800000` | Minimum interval between two distillation runs. |
| `capture.provider` / `capture.model` | empty | LLM route for distillation; empty = the turn's routed provider/model. |
| `capture.maxCandidateChars` | `16000` | Character budget of candidates fed into one distillation run. |
| `graduation.enabled` | `true` | Propose turning validated experience into reusable SKILL.md files. |
| `graduation.minHits` | `3` | Hits before a validated entry is proposed for skill graduation. |

> **Migrating from 0.2.x:** legacy `~/.dsh/settings.yaml` values are **not** auto-migrated into `cordis.patch.yml` — defaults apply until you reconfigure. Only *data* (lessons, recipes, error statistics, rules) is imported automatically on first run.

> **Context compaction** was removed in 0.3.0. Use the official `compaction-basic` plugin, configured in the same `cordis.patch.yml`.

A memory entry looks like:

```markdown
## lesson-abc123
- title: Verify the active profile
- mistake: Edited a different profile from the one used by Desktop
- prevention: Confirm the active profile before editing any profile files
- applies_when: DSH Desktop profile changes
- keywords: desktop profile package.json
- confirmed: true
- maturity: validated
- hits: 3
```

## Install into DSH Desktop

> **Do not edit DSH Desktop security settings** (mode, openBrowser, networkExposure, sandbox presets). Install through the normal DSH profile plugin mechanism, then restart DSH Desktop once.

### From GitHub (recommended)

Add this to your DSH Desktop profile's `package.json` (the file at `C:\Users\<you>\.dsh\profiles\desktop\package.json`):

```json
{
  "dependencies": {
    "dsh-error-improvement": "github:wbushihenshuai-design/dsh-error-improvement"
  }
}
```

Also add `"dsh-error-improvement"` to the `dsh.profile.bundles` array in the same file (and remove it from `dsh.desktopDeselectedBundles` if present).

Then run in the profile directory:

```powershell
pnpm install
```

Restart DSH Desktop. The settings section appears under **Settings → 错误改进**, with a **待确认草稿** subsection for pending drafts.

### From a local checkout (development)

```json
{
  "dependencies": {
    "dsh-error-improvement": "link:D:/work/DS/dsh-error-improvement"
  }
}
```

Preserve all existing bundles and dependencies when merging. The plugin's `cordis.patch.yml` mounts exactly one Host row; its `dsh.client` metadata loads the settings-section UI.

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

The CI command performs formatting/lint checks, TypeScript checks, 32 Host/store/matching/enforcement/drafts/graduation tests, production build, safety preflight scan (all published JS files), and a clean-consumer pack smoke test that installs the tarball into a fresh `node_modules` and imports the real artifact.

## Development layout

- `src/index.ts` — Host registration, injection waterfall, tool/RPC mounting.
- `src/memory.ts` — memory entry schema, Markdown parse/render, atomic writes.
- `src/lessons.ts` / `src/recipes.ts` — selection, sanitization, budget-measured rendering.
- `src/capture.ts` / `src/distill.ts` — zero-LLM capture and Curator→Writer distillation.
- `src/drafts.ts` — draft lifecycle (write/review/approve/reject).
- `src/signals.ts` / `src/graduate.ts` — turn signals, maturity, skill graduation.
- `src/enforcement.ts` — error statistics and pre-execution interception.
- `src/store.ts` — v2 state file (error signatures + promotion rules).
- `src/client.js` — immediately loaded settings-section UI (pending drafts + stats).
- `test/` — 32 node:test cases.
- `scripts/preflight.mjs` — scans all published JS for forbidden coupling.
- `scripts/pack-smoke.mjs` — clean-consumer tarball install + import verification.

## Privacy

No telemetry and no network requests beyond the LLM calls used for distillation (opt-out via `capture.distillEnabled: false`). Memory stays in local files under `$DSH_HOME` and is sent only as part of the local agent context when selected.

## License

[MIT](LICENSE) © 2026 wbushihenshuai-design
