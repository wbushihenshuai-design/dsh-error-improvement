# DSH 错误改进

一个 DeepSeek Harness 插件，把**用户确认过的经验**变成持久的 Agent 记忆：错误沉淀为预防规则，已验证的修复沉淀为配方，久经考验的条目毕业为独立技能。

它有意独立于 EverOS、记忆服务、数据库、浏览器和网络 API。全部持久化状态都是 `$DSH_HOME/error-improvement/` 下的普通文件。

**面向 DSH 2.0.15+**（Node 22.19+ 或 24+）。0.1.x 宿主请使用 0.2.x 版本。

[English](README.md) | 中文

## 安全契约

- 记忆条目只有 `confirmed: true` 才会被注入。**每条自动捕获的教训先落入 `drafts/`，必须用户显式批准**——插件从不静默地把模型输出写入记忆。（刻意例外：agent 主动调用的 `improve_record_recipe` 工具，记录的是已验证的方案。）
- 从不执行工具或更改权限、桌面模式、浏览器访问、网络暴露、沙箱预设或审批策略。
- 注入文本使用插件来源（`form: instructions`），而非直接用户来源；并通过 `<SUBAGENT-STOP>` 递归护栏告知子代理不要重复注入或重复记录。
- 存储文本经控制字符清理、角色标签编码（所有 `<` 和 `>` 均被转义）、条数限制和字符限制；文件写入均为原子操作（tmp + rename）。
- 条目原子渲染：只有整个文本块在字符预算内才包含，否则整条省略（无中间截断）。
- 所有钩子与所有文件/LLM 操作均**失败开放**：插件异常绝不阻断工具流水线或 Agent 循环。

## 工作原理

### 记忆层（0.3.0）

Markdown（含结构化字段）是唯一事实源：

```
$DSH_HOME/error-improvement/memory/
  lessons.md       # 已确认的错误 → 预防规则
  recipes.md       # 已确认的已验证方案
  decisions.md     # 用户决策（如被拒绝的草稿及理由）
  candidates.jsonl # 零 LLM 捕获队列
  drafts/          # 等待用户确认的草稿
$DSH_HOME/error-improvement/state.json   # 错误统计 + 拦截规则（v2）
$DSH_HOME/skills/<slug>/SKILL.md         # 毕业技能
```

1. **捕获（零 LLM）**：直接会话（跳过委派会话）中的轮次结果与工具错误进入 `candidates.jsonl` 队列——按会话与文本大小设上限。
2. **蒸馏（LLM，有门控）**：队列达到 `capture.minQueueSize` **且**距上次超过 `capture.minIntervalMs` 后，两阶段 Curator→Writer 运行产出草稿到 `drafts/`。空结果返回哨兵（`FLUSH_OK`）后稍后重试；绝不写入记忆。
3. **确认闸门**：草稿出现在 **设置 → 错误改进 → 待确认草稿**（列表、编辑、批准、拒绝）；agent 也可通过 **`improve_review_drafts`** 工具处理。批准把（confirmed）条目写入记忆文件；拒绝会记录一条 decision 条目。批准带 `supersedes` 的草稿时，旧条目被禁用（绝不删除）。
4. **注入**：每轮的每个模型步骤，`agent/pre-step` 瀑布流选取相关的已确认教训（assist 模式按范围/关键词打分，含中文二元组；strict 注入全部合格条目；off 关闭注入），与配方一起渲染为单个有界、计量预算的文本块。
5. **轮次信号与成熟度**：被展示过的条目，若该轮成功结束（无新拦截规则、失败数 ≤ 成功数）则 `hits +1`。成熟度演进 `draft → validated（≥2 次）→ core（≥5 次）`。
6. **技能毕业**：达到 `graduation.minHits`（默认 3）的 validated/core 条目会被**提案**为技能——同样走确认草稿——批准后写成 `$DSH_HOME/skills/<slug>/SKILL.md`（agentskills.io 风格 frontmatter；拒绝覆盖已存在文件；源条目标记为 `core` 并追加 `skill:` 证据）。

### 重复错误升级为规则（0.2.0）

1. Host 监听 `tools/post-execute`，对**相同工具 + 相同错误签名**的失败计数（长十六进制/数字串归一化；计数持久化在 `state.json`，重启不丢）。
2. 同一错误达到 `enforcement.threshold`（默认 **3**）次后升级为规则：能匹配到已确认教训就关联该教训，否则从错误样本自动合成一条自动规则。
3. 之后在 `tools/pre-execute` **前置拦截**匹配的调用（同工具 + 参数重叠度足够）：
   - `warn`（默认）：每个冷却窗口（`warnCooldownMs`，默认 1 小时）拦截一次，把预防原因展示给模型，**立即重试即放行**——提醒而不阻断工作；
   - `deny`：始终拦截，用于绝不应再发生的调用。
4. 所有钩子**失败开放**，也绝不会把下游已有的 deny/ask 决策放宽成 allow。规则上限 `maxRules`（默认 20），超出时只驱逐最旧的自动规则，关联教训的规则不驱逐。

### 成功配方沉淀

- 解决非平凡问题后，agent 可调用 **`improve_record_recipe`** 工具把**已验证可行**的方案写入 `recipes.md`（标题 / 问题 / 方案 / 范围 / 关键词），作为 confirmed 条目持久化。
- 配方与教训共用同一套相关性引擎（含中文二元组），以 `<success_recipes>` 块和教训一起注入，遇到同类问题时**直接复用已验证方案，不再重新造轮子**。

## 设置

配置以 Schemastery schema 声明，存放在 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/<profile>/cordis.patch.yml`）。标记 volatile 的字段可在设置页即时修改、无需重载插件。

| 字段 | 默认值 | 含义 |
| --- | ---: | --- |
| `enabled` | `true` | 注入、拦截、捕获与毕业的总开关。 |
| `mode` | `assist` | `assist` = 注入相关教训作为建议；`strict` = 注入全部已确认教训作为规则；`off` = 只捕获不注入。 |
| `maxLessons` | `5` | 每轮注入的最大教训数（1–50）。 |
| `maxChars` | `6000` | 教训 + 配方注入块的硬字符预算（500–50000）。 |
| `maxRecipes` | `3` | 每轮注入的最大配方数（0–20）。 |
| `enforcement.enabled` | `true` | 拦截重复已知失败签名的工具调用。 |
| `enforcement.threshold` | `3` | 相同工具错误达到多少次后升级为运行时规则（2–10）。 |
| `enforcement.defaultMode` | `warn` | `warn` = 冷却窗口内拦截一次；`deny` = 拦截所有重复。 |
| `enforcement.warnCooldownMs` | `3600000` | 同一条规则两次警告的最小间隔。 |
| `enforcement.maxRules` | `20` | 运行时自动规则上限；最旧的未关联规则优先驱逐。 |
| `capture.enabled` | `true` | 观察轮次并把候选教训/配方入队（零 LLM）。 |
| `capture.distillEnabled` | `true` | 定期把队列蒸馏为用户确认草稿（LLM）。 |
| `capture.minQueueSize` | `3` | 触发一次蒸馏的最小队列长度。 |
| `capture.minIntervalMs` | `1800000` | 两次蒸馏运行的最小间隔。 |
| `capture.provider` / `capture.model` | 空 | 蒸馏用的 LLM 路由；留空 = 跟随当前轮的路由 provider/model。 |
| `capture.maxCandidateChars` | `16000` | 单次蒸馏输入候选的字符预算。 |
| `graduation.enabled` | `true` | 提案把已验证经验转化为可复用的 SKILL.md 文件。 |
| `graduation.minHits` | `3` | 命中多少次后被提案毕业为技能。 |

> **从 0.2.x 迁移：** 旧 `~/.dsh/settings.yaml` 的配置值**不会**自动迁移到 `cordis.patch.yml`——重新配置前一律使用默认值。只有**数据**（教训、配方、错误统计、规则）在首次运行时自动导入。

> **上下文压缩**已在 0.3.0 移除。请使用官方 `compaction-basic` 插件，在同一个 `cordis.patch.yml` 中配置。

一条记忆条目形如：

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

## 安装到 DSH Desktop

> **不要改 DSH Desktop 安全设置**（模式、openBrowser、networkExposure、沙箱预设）。通过常规 DSH profile 插件机制安装，然后重启一次 DSH Desktop。

### 从 GitHub 安装（推荐）

把下面内容加入 DSH Desktop profile 的 `package.json`（位于 `C:\Users\<你>\.dsh\profiles\desktop\package.json`）：

```json
{
  "dependencies": {
    "dsh-error-improvement": "github:wbushihenshuai-design/dsh-error-improvement"
  }
}
```

同时在同一文件里把 `"dsh-error-improvement"` 加入 `dsh.profile.bundles` 数组（若在 `dsh.desktopDeselectedBundles` 中则移除）。

然后在 profile 目录执行：

```powershell
pnpm install
```

重启 DSH Desktop。设置节出现在 **设置 → 错误改进**，其中 **待确认草稿** 小节列出待处理的草稿。

### 从本地检出的目录安装（开发）

```json
{
  "dependencies": {
    "dsh-error-improvement": "link:D:/work/DS/dsh-error-improvement"
  }
}
```

合并时保留现有 bundles 和 dependencies。插件的 `cordis.patch.yml` 只挂载一个 Host 行；`dsh.client` 元数据负责加载设置节 UI。

### 安装到活的 Desktop profile 之前

- 在本仓库运行 `npm run ci`。
- 备份该 profile 的 `package.json`、lockfile 和 `cordis.patch.yml`。
- 本仓库不提供自动安装器，因为静默改写活的 profile 不安全。

## 构建与验证

需要 Node.js 22.19+ 或 24+。

```powershell
npm install
npm run ci
npm run pack:check
```

CI 命令包含格式/lint 检查、TypeScript 检查、32 个 Host/存储/匹配/拦截/草稿/毕业测试、生产构建、安全预检（扫描所有发布 JS 文件），以及干净消费者打包冒烟测试（把 tarball 安装到全新 `node_modules` 并导入真实产物）。

## 开发布局

- `src/index.ts` — Host 注册、注入瀑布流、工具/RPC 挂载。
- `src/memory.ts` — 记忆条目 schema、Markdown 解析/渲染、原子写入。
- `src/lessons.ts` / `src/recipes.ts` — 选取、净化、按预算计量渲染。
- `src/capture.ts` / `src/distill.ts` — 零 LLM 捕获与 Curator→Writer 蒸馏。
- `src/drafts.ts` — 草稿生命周期（写入/审阅/批准/拒绝）。
- `src/signals.ts` / `src/graduate.ts` — 轮次信号、成熟度、技能毕业。
- `src/enforcement.ts` — 错误统计与前置拦截。
- `src/store.ts` — v2 状态文件（错误签名 + 拦截规则）。
- `src/client.js` — 立即加载的设置节 UI（待确认草稿 + 统计）。
- `test/` — 32 个 node:test 用例。
- `scripts/preflight.mjs` — 扫描所有发布 JS 的违规耦合。
- `scripts/pack-smoke.mjs` — 干净消费者 tarball 安装 + 导入验证。

## 隐私

除蒸馏使用的 LLM 调用外（可通过 `capture.distillEnabled: false` 关闭）无遥测、无网络请求。记忆保存在 `$DSH_HOME` 本地文件中，仅在选中时作为本地 Agent 上下文的一部分发送。

## 许可证

[MIT](LICENSE) © 2026 wbushihenshuai-design
