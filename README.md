# dsh-worklog-topics

DeepSeek Harness 的自动工作日志：每轮对话结束自动记一行，按天存 NDJSON，可按会话、按主题、按时间轴回看，也能被 Agent 直接检索。

> npm 包名是 `dsh-worklog-topics`（`dsh-worklog` 已被他人占用）；侧栏标签显示为「工作日志」。

![甘特视图](docs/screenshots/panel-gantt.webp)

## 它解决什么问题

聊完一天，想知道「今天到底做了什么、时间花在哪些事上」，靠翻会话记录几乎不可行。这个插件做三件事：

1. **每轮自动落一行**——不用手动记，也不存对话正文；
2. **两个模型各写一份摘要**——主摘要跟随你在 DSH 里选的模型，对比槽可以是另一个宿主模型或本地 Ollama；
3. **判主题**——每轮再判一次「这一轮属于哪个主题」，于是日志多了一个可分组、可画时间轴的维度。

## 功能

**记录**：一轮结束时写一条，包含时间、会话 id/标题、工作区、会话文件路径、摘要、两条模型摘要、工具名、`git status` 得到的相对路径、标签、主题 id/主题名。

**摘要**：主摘要走宿主 `llm` 服务（默认跟随你在 DSH 里选的模型，不写密钥）；对比槽可以选另一个宿主模型，或本地 Ollama。两个模型失败互不影响，都失败则回落零成本截断。

**主题**：每轮多输出一行 `主题：`——沿用就写 id（`t2`），新主题就写 `新 <标签>`。id 由插件分配，标签去空格去标点归一，模型答「不确定」时保留上一轮主题。

**三种视图 + 日期导航**：

| 视图 | 用途 |
| --- | --- |
| 甘特 | 一天/一段时间的主题时间轴，会话为一级、主题为二级，横轴可滚动 |
| 按会话 | 今天的时间线，按会话分组 |
| 按主题 | 同一主题跨会话合并，按标签归一 |

顶部支持 ‹ › 前后一天、「今日」、日期范围选择；跨天时甘特轴自动从"每小时"切到"每天"。

**Agent 工具**：`worklog_today`、`worklog_search`、`worklog_append`、`worklog_status`、`worklog_topics`。

**DSH Pocket**：只读的服务端直出页面，跟桌面面板同一份数据，每张卡带主题标签。

## 安装

```bash
dsh plugin --profile <profile> add dsh-worklog-topics
# 或在 DSH「插件 → 添加插件」里选这个包
```

装完重启一次 DeepSeek Harness。

## 配置

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `storePath` | `~/.dsh/worklog` | 一天一个 `.jsonl` |
| `captureEnabled` | `true` | 关掉就完全不写 |
| `includeToolCalls` | `true` | 关掉则 `tools` 留空 |
| `maxSummaryChars` | `200` | 摘要长度上限 |
| `aiDeepseek` | `true` | 主摘要开关 |
| `aiProvider` / `aiModel` | 空 | 空 = 跟随宿主默认模型 |
| `aiCompareProvider` / `aiCompareModel` | 空 | 都填则对比槽用这个宿主模型 |
| `aiOllama` | `true` | 对比槽用本地 Ollama（未配对比宿主模型时生效） |
| `aiOllamaUrl` / `aiOllamaModel` | `http://127.0.0.1:11434` / `qwen3.5:9b-q4_K_M` | 本地模型 |
| `aiTimeoutMs` | `20000` | 单个摘要器超时 |
| `contextTurns` | `3` | 背景里带几条本会话的旧摘要 |
| `contextTopics` | `true` | 每轮判主题 |
| `contextOllama` | `false` | 是否把背景也给本地模型 |
| `promptPrimary` / `promptSecondary` | 空 | 空 = 内置提示词 |
| `gitSync` | 关闭 | 可选 `pull --ff-only` / `push`，不合并不提交 |

面板右上角「设置」里可以直接选模型、改提示词，改完即时生效。

## 数据

```
~/.dsh/worklog/2026-11-26.jsonl
```

一行一条。`summary` 是主摘要，`summaries` 存两份，`topicId`/`topic` 是主题，`answer` 是回答摘录。移动端页面只下发主题、摘要、工具，不下发原始回答与绝对路径。

## 隐私

- 默认全部在本机：NDJSON 落盘、Ollama 本地推理、主题判定在本地拼接；
- 主摘要会调用你账户已登录的宿主模型，发送的是**该轮的用户输入与助手回复各最多 1200 字**；
- 插件不保存任何 API key，也不自建 token 表；Pocket 页面只校验 App 统一签发的 token 格式；
- 想完全不出机器：把 `aiDeepseek` 关掉，只留本地 Ollama，或全关走零成本截断。

## 开发

```bash
node scripts/self-test.mjs      # 全部自测，不需要 DSH 进程
node scripts/self-check.mjs     # 静态检查
```

`scripts/bench-context.mjs` 可以拿真实会话日志回放，对比不同上下文策略下的摘要质量。

## 许可

MIT
