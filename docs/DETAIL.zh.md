# 工作日志

「工作日志」是 DeepSeek Harness 的自动记忆：每次对话结束，它往当天的纯文本日志里追加一行。你不用再手动记「刚才做了什么」，回头翻日志就能看到。

## 它做什么

- **自动采集。** Host 插件订阅会话事件流（`session/event`），在一轮对话结束时写一条记录。不是每个 token 写一条，也不是每次工具调用写一条：一轮一行。
- **按天分文件，但按会话可读。** 默认写到 `~/.dsh/worklog/YYYY-MM-DD.jsonl`，append-only，路径可用 `storePath` 改。文件是纯文本，`grep`、`jq`、编辑器、git 仓库都能直接用。
- **位置字段。** 每条带 `workspace`（绝对路径）和 `sessionPath`（会话原始 `.jsonl(.zstd)` 文件，真实存在才写）；**改动的文件仍是相对路径**，不写绝对路径。
- **脱敏记录。** 一条记录只有：时间戳、本地日期、主机名、agent preset、会话 id、会话标题（`sessionTitle`：先看 `session/title` 事件，再用 `sessionTitle.get()` 补读，最后用该会话第一句提问兜底）、**工作区**（`workspace`）、**会话日志的真实路径**（`sessionPath`，按 JSONL 持久化的真实目录结构算出来并 `readdir` 核实过才写）、最多 `maxSummaryChars` 字的摘要、本轮用过的工具名、`git status` 得到的相对路径、标签。不存对话正文，不存绝对路径。
- **四个工具。** `worklog_today`、`worklog_search`、`worklog_append`、`worklog_status`，agent 不用再手写 shell。
- **右侧栏面板。** 今天的时间线**按会话分组**（标题 · 时间跨度 · 条数）、今日条数、记录开关、存放路径。
- **Pocket 移动页。** Worklog 会出现在 DSH Pocket 的「插件」面板，路由为 `/dsh-worklog/mobile`。页面由服务端直出当天记录，按系统语言显示界面，并支持分类筛选和展开 DeepSeek / 本地模型摘要对比；记录暂停时会显示状态提示。它只校验 App 统一签发的 token 格式，不自行签发或保存插件私有 token。移动页不会发送原始回答，并会去掉 `workspace` 和 `sessionPath` 绝对路径。
- **文件不按会话拆。** 一天一个 append-only 文件仍是唯一事实源（好 grep、好回放、顺序就是发生顺序）；「分开」发生在视图层：每条记录带 `sessionId` + `sessionTitle`，面板和 `worklog_today` 按会话归组。

全程不联网：没有外部服务器，不上传，默认不开 git 同步。子会话（`origin: subagent`）不记录，避免子任务刷屏。

## 记录格式

```json
{"ts":"2026-11-26T01:34:12.000Z","date":"2026-11-26","node":"host","agent":"","sessionId":"session-…","kind":"turn","summary":"…","summaryBy":"deepseek","summaries":{"deepseek":"…","ollama":"…"},"answer":"…","tools":["bash"],"files":["lib/index.js"],"tags":["turn","human","tools","ai"]}
```

## 配置

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `storePath` | `~/.dsh/worklog` | 放每日 `.jsonl` 的目录 |
| `captureEnabled` | `true` | 关掉就完全不写 |
| `includeToolCalls` | `true` | 关掉则 `tools` 留空 |
| `maxSummaryChars` | `200` | 摘要长度上限 |
| `aiDeepseek` | `true` | 用 DeepSeek 生成摘要（走 Host 的 `llm`，不写密钥） |
| `aiProvider` / `aiModel` | `deepseek-account` / `deepseek-flash`（显示名 DeepSeek-V4.1-Flash） | DeepSeek 侧的路由 |
| `aiOllama` | `true` | 用本地 ollama 生成摘要 |
| `aiOllamaUrl` / `aiOllamaModel` | `http://127.0.0.1:11434` / `qwen3.5:9b-q4_K_M` | 本地侧地址与模型 |
| `aiOllamaStrictPrompt` | `true` | 本地模型用严格提示词（保留具体名词、禁空泛动词、禁推断），关掉可做 A/B 对比 |
| `aiTimeoutMs` | `20000` | 每个摘要器的超时（毫秒） |
| `contextTurns` | `3` | 同会话最近几条摘要作为背景一起发送；填 `0` 关掉窗口 |
| `contextTopics` | `true` | 每轮判一次「主题」，沿用已有 id 或新建，作为分组维度 |
| `contextOllama` | `false` | 也给本地模型发背景；实测 9B 上会变短、丢具体名词、慢一倍 |
| `gitSync` | 关闭 | 可选的 `pull --ff-only` / `push`，不合并、不提交 |

`storePath`、`captureEnabled`、`includeToolCalls`、`maxSummaryChars` 是 volatile 字段，会出现在插件设置表单里，改完即时生效、不用重启。`gitSync` 在 profile 的 patch 里改。

## 限制

- 记录的是**一整轮**：问题（本轮的人类输入）加**最终回答**（本轮最后一条助手文本）。两个摘要器都拿到这两段；不开模型时，零成本摘要会写成 `问：…；答：…`，并额外把最终回答的摘录存进 `answer`。
- 每轮会**并行**问两个摘要器：DeepSeek（走 Host 的 `llm` 服务，用你 profile 里已登录的路由）和本地 ollama（qwen）。两个都成功时，`summary` 取 DeepSeek 那条，两条原文都存进 `summaries`，面板里并排显示以便对比。
- 隐私边界要清楚：**用户输入与助手回复各最多 1200 字会被发给所选模型**。本地 ollama 不出这台机器；DeepSeek 那条会走你账户的模型服务。不想外发就把 `aiDeepseek` 关掉，只留本地或纯截断。
- 任何一侧失败（超时、模型不存在、ollama 没起）都不会影响写入：那一侧跳过，另一侧照用；两侧都失败则回落到零成本的本地截断，`summaryBy` 记为 `digest`，`worklog_status` 的 `ai.*.last.error` 会写清原因。
- **主题维度。** 每轮摘要多输出一行 `主题：`，模型只做一件事：判断这一轮属于哪个已有主题（写 id，如 `t2`），还是新主题（写 `新 <标签>`）。它拿到的背景是**该会话已有主题的 id、标签、轮数与一句 gist**，加上最近 `contextTurns` 条摘要（默认 3 条）。id 由插件分配（`t1`、`t2`…），不允许模型自己命名 id；标签会做去空格去标点归一，同一个标签不会被拆成两个主题；模型答「不确定」时保留上一轮主题，不会凭空造一条。主题 id 只在会话内唯一，所以**分组按主题标签归一后的结果**，同一主题在两个会话里会合并成一组并列出会话数；没有主题的旧记录按会话分开留在「未归主题」，不会糊成一条。记录里存 `topicId` 与 `topic`，`worklog_topics` 按主题给出轮次、时间跨度和样本摘要，面板可在「按会话 / 按主题」之间切换，移动页每张卡片带主题标签。
- **背景的边界。** 背景按 `sessionId` 过滤，会话之间不会串；带 `reason:aborted` / `reason:error` 的轮次被排除，因为做了一半的事不是可靠背景。它常驻内存，某个会话第一次出现时从最近三天的日文件补齐，插件重载或会话恢复后不会从空白开始。
- **本地模型默认不吃背景**（`contextOllama: false`）。同一批 12 轮真实会话实测，给 qwen3.5:9b 加「主线 + 3 条」后摘要从平均 158 字掉到 103 字、可核查名词从 6.6 个降到 3.9 个、耗时从 5.7 秒涨到 12.2 秒，还会出现主线卡在上一条不更新。DeepSeek 侧没有这个退化证据（脚本够不到 Host 的 `llm` 服务，未实测），所以默认只给它。
- 两个模型用不同的提示词：DeepSeek 用简短版（它本来就够密），本地 qwen 用严格版——同批真实输入实测，严格版把可核查名词（`dsh.mobile`、`registerMobile`、`sessionId`/`workspace`/`sessionPath`）从 0–1 个提到 3–5 个，与 DeepSeek 的 2–4 个同档；代价是慢 1–2 秒、长度指令遵循不严。
- 本地 ollama 走原生 `/api/chat` 且带 `think: false`：qwen3.5 走 OpenAI 兼容接口时会把 token 全花在思考上、约 20 秒返回空内容，关掉思考后约 2 秒出结果。
- `files` 来自会话工作目录下的 `git status`；不在 git 仓库里就是空，且最多 30 条。
- 只在轮次边界记录；一轮里完全没有文字则跳过。
- `gitSync` 不提交也不合并：只做快进和推送，工作区脏就一直失败，需要你自己提交。
