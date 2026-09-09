# DSH 错误改进

一个独立的 DeepSeek Harness 插件，将**用户确认的错误**转化为有界的前置检查，帮助 Agent 避免重复犯同样的错。

它有意独立于 EverOS、记忆服务、数据库、浏览器和网络 API。唯一的持久化状态是 DSH 常规设置命名空间 `error-improvement`。

**已在 DSH 0.1.2-rc.1 上测试**（Node 22.19+ 或 24+）。

[English](README.md) | 中文

## 安全契约

- 只有勾选了 `confirmed` 的教训才会被注入。
- 插件从不自动从模型输出创建教训。
- 从不执行工具或更改权限。
- 从不修改桌面模式、浏览器访问、网络暴露、沙箱预设或审批策略。
- 注入文本使用插件来源（`form: instructions`），而非直接用户来源。
- 存储的教训文本经过围栏包裹、控制字符清理、角色标签编码（所有 `<` 和 `>` 均被转义）、条数限制和字符限制。
- 教训原子渲染：只有整个文本块在字符预算内才包含，否则整条省略（无中间截断）。
- 任何运行时渲染失败都安全降级：原始下游 Agent 决策原样返回。

## 工作原理

1. Host 通过 DSH 设置提供者注册 `error-improvement` 设置节。
2. 在 **设置 → 错误改进** 中，用户记录一个错误、一条预防规则、可选的范围/关键词，并显式确认。
3. 在每轮的**每个模型步骤**中，Host 包装 `agent/pre-step` 瀑布流，检查完整的下游消息批次。不同于只在第一步注入一次，这种方式确保预防规则在**每次 LLM 调用前**都可见——包括同一轮内模型的后续工具调用。
4. **assist 模式**只注入其显式范围/关键词与当前用户消息匹配的教训。拉丁/数字关键词要求完整词元匹配（无子串误匹配）；中文使用二元组匹配。范围/关键词为空时回退到保守的多词匹配。
5. **strict 模式**注入所有已启用、已确认、完整的教训，直到达到配置上限。

`strict` 是更强的提示策略，**不是硬性执行**。它从不扩展模型或工具能力。

## 设置

| 字段 | 默认值 | 含义 |
| --- | ---: | --- |
| `enabled` | `true` | 启用教训注入。 |
| `mode` | `assist` | `assist` 匹配相关规则；`strict` 注入所有符合条件的规则。 |
| `maxLessons` | `5` | 每轮最多注入的规则数，限制在 1–50。 |
| `maxChars` | `6000` | 最大完整教训块，限制在 500–50000 字符。 |
| `lessons[]` | `[]` | 用户管理的教训记录。 |

### 上下文压缩

| 字段 | 默认值 | 含义 |
| --- | ---: | --- |
| `compaction.enabled` | `true` | 启用每步前的常规压缩和上下文溢出恢复。 |
| `compaction.thresholdRatio` | `0.8` | 活动对话路由达到其声明上下文窗口的该比例时，开始常规压缩。 |
| `compaction.retainRatio` | `0.16` | 压缩后原样保留的最近对话比例；必须严格小于 `thresholdRatio`。 |
| `compaction.summarizationProvider` / `summarizationModel` | 留空 | 主摘要路由。两个字段同时留空时使用当前对话路由；填写时必须是完整的一对。 |
| `compaction.fallbackSummarizationProvider` / `fallbackSummarizationModel` | 留空 | 主摘要调用失败（例如余额耗尽、鉴权或供应商错误）时尝试一次的显式备用路由；填写时必须是完整的一对。 |
| `compaction.maxTokens` | `8192` | 摘要输出的最大 token 数。 |

如果配置了主摘要路由而其调用失败，插件会先尝试一次显式备用路由；没有填写备用路由时，若当前对话路由与主路由不同，则改用当前对话路由。它**不会随机选择任意模型**：所有回退路由都必须已由 DSH 知道，保证恢复过程可预测、可复现。底层仍使用 DSH 的持久事务：`compaction/start` → 摘要 → checkpoint 替换 → `compaction/end`；只有替换成功提交后，因上下文溢出失败的原请求才会自动重试。

> ⚠️ **压缩阈值与摘要模型上下文窗口。**
> 如果摘要模型与对话模型使用相同的声明上下文窗口，默认阈值 `0.8`（80%）会导致鸡生蛋问题：对话用到 80% 时触发压缩，但摘要调用又要把完整对话发给同一个模型，超出其限制。**将 `compaction.thresholdRatio` 改为 `0.5` 或更低**，让压缩在对话填满窗口前就启动，为摘要请求留足余量。或者配置一个上下文窗口更大的摘要模型。

教训记录结构：

```json
{
  "id": "stable-unique-id",
  "title": "验证活动配置文件",
  "mistake": "编辑了与桌面使用的不同的配置文件",
  "prevention": "编辑任何配置文件前先确认当前活动的配置文件",
  "scope": "DSH 桌面配置文件更改",
  "keywords": "desktop profile package.json",
  "confirmed": true,
  "enabled": true
}
```

## 安装到 DSH 桌面版

> **不要修改 DSH 桌面版安全设置**（模式、openBrowser、networkExposure、沙箱预设）。通过常规 DSH 配置文件插件机制安装，然后重启一次 DSH 桌面版。

### 从 GitHub 安装（推荐）

在你的 DSH 桌面版配置文件 `package.json`（路径 `C:\Users\<你>\.dsh\profiles\desktop\package.json`）中添加：

```json
{
  "dependencies": {
    "dsh-error-improvement": "https://github.com/wbushihenshuai-design/dsh-error-improvement"
  }
}
```

同时在同一文件的 `dsh.profile.bundles` 数组中添加 `"dsh-error-improvement"`。

然后在配置文件目录中运行：

```powershell
pnpm install
```

重启 DSH 桌面版。设置节出现在 **设置 → 错误改进**。

### 从本地检出安装（开发）

```json
{
  "dependencies": {
    "dsh-error-improvement": "link:D:/work/DS/dsh-error-improvement"
  }
}
```

合并时保留所有现有 bundles 和 dependencies。插件的 `cordis.patch.yml` 挂载恰好一个 Host 行；其 `dsh.client` 元数据加载设置 UI。

### 安装到活动桌面配置文件之前

- 在此仓库中运行 `npm run ci`。
- 备份配置文件的 `package.json`、lockfile 和 `cordis.patch.yml`。
- 此仓库不包含自动安装器，因为静默重写活动配置文件是不安全的。

## 构建与验证

需要 Node.js 22.19+ 或 24+。

```powershell
npm install
npm run ci
npm run pack:check
```

CI 命令执行格式化/lint 检查、TypeScript 检查、24 个 Host/客户端/匹配/集成测试、生产构建、安全预检扫描（所有发布的 JS 文件），以及一个干净消费者打包冒烟测试——将 tarball 安装到全新的 `node_modules` 并导入真实产物。

## 开发布局

- `src/index.ts` — Host 注册和 pre-step 中间件。
- `src/lessons.ts` — 模式、匹配、清理、原子渲染、消息来源。
- `src/client.js` — 即时加载的设置 UI 和冲突感知保存控制器。
- `test/` — Host、匹配、安全、客户端控制器和集成测试。
- `scripts/preflight.mjs` — 扫描所有发布的 JS 以查找禁止的耦合。
- `scripts/pack-smoke.mjs` — 干净消费者 tarball 安装 + 导入验证。

## 隐私

无遥测、无网络请求。教训保留在用户的 DSH 设置文档中，仅在选中时作为本地 Agent 上下文的一部分发送。

## 许可证

[MIT](LICENSE) © 2026 wbushihenshuai-design
