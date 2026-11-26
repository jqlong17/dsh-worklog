# Worklog

Worklog is an automatic memory for DeepSeek Harness. Every finished conversation turn appends exactly one line to a plain NDJSON file for that day, so you can look back later and see what you were actually doing — without writing notes by hand.

## What it does

- **Automatic capture.** A Host plugin subscribes to the session event feed (`session/event`) and writes one record when a turn ends. Nothing is written per token, and nothing is written per tool call: one turn, one line.
- **One file per day, readable per session.** Records go to `~/.dsh/worklog/YYYY-MM-DD.jsonl` (append-only, changeable via `storePath`). Plain text: `grep`, `jq`, an editor, or a git repo all work on it.
- **Location fields.** Every record carries `workspace` (absolute) and `sessionPath` (the session's own `.jsonl(.zstd)` file, only when it really exists); **changed files stay relative**.
- **Sanitised records.** A record holds a timestamp, the local date, the hostname, the agent preset, the session id, the session title (`sessionTitle`: the `session/title` event first, then `sessionTitle.get()`, then the session's first prompt), the workspace (absolute `workspace`), the real on-disk session log file (`sessionPath`, derived from the JSONL persistence layout and confirmed with a directory read before it is written), a summary of at most `maxSummaryChars` characters, the tool names used in the turn, relative paths that changed (from `git status`) and tags. The full conversation body is never stored, and absolute paths are never stored.
- **Four tools for the agent.** `worklog_today`, `worklog_search`, `worklog_append` and `worklog_status` replace hand-written shell commands.
- **Sidebar panel.** Today's timeline is grouped by session (title, time span, count) beside the count, the capture switch and the store path.
- **Pocket mobile page.** Worklog appears in DSH Pocket's Plugins panel at `/dsh-worklog/mobile`. It renders today's entries on the server, follows the requested language, and provides category filters plus an expandable comparison of available DeepSeek and local-model summaries. It reports when capture is paused, accepts the shared App-issued token by format, and does not issue or keep plugin-local tokens. Mobile records omit raw assistant answers and absolute `workspace` and `sessionPath` values.
- **The file is not split per session.** One append-only file per day stays the single source of truth (easy to grep, replay, and ordered as it happened); the split happens in the view: every record carries `sessionId` and `sessionTitle`, and the panel and `worklog_today` group by session.

Nothing leaves the machine: no external server, no upload, no default git remote. Subagent sessions (`origin: subagent`) are not recorded, so delegated work does not flood the log.

## Record shape

```json
{"ts":"2026-11-26T01:34:12.000Z","date":"2026-11-26","node":"host","agent":"","sessionId":"session-…","kind":"turn","summary":"…","summaryBy":"deepseek","summaries":{"deepseek":"…","ollama":"…"},"answer":"…","tools":["bash"],"files":["lib/index.js"],"tags":["turn","human","tools","ai"]}
```

## Configuration

| Field | Default | Notes |
| --- | --- | --- |
| `storePath` | `~/.dsh/worklog` | Directory holding one `.jsonl` per day |
| `captureEnabled` | `true` | Off means the recorder writes nothing at all |
| `includeToolCalls` | `true` | Off leaves `tools` empty |
| `maxSummaryChars` | `200` | Upper bound for `summary` |
| `aiDeepseek` | `true` | Summarise through the Host `llm` service (no key is stored) |
| `aiProvider` / `aiModel` | `deepseek-account` / `deepseek-flash` (shown as DeepSeek-V4.1-Flash) | DeepSeek route |
| `aiOllama` | `true` | Summarise with a local Ollama model |
| `aiOllamaUrl` / `aiOllamaModel` | `http://127.0.0.1:11434` / `qwen3.5:9b-q4_K_M` | Local route |
| `aiOllamaStrictPrompt` | `true` | Strict instruction set for the small model (keep concrete nouns, ban vague verbs and invented conclusions); turn it off to A/B the wording |
| `aiTimeoutMs` | `20000` | Per-summariser deadline in milliseconds |
| `contextTurns` | `3` | Earlier summaries of the same session sent as background; `0` disables the window |
| `contextTopics` | `true` | Ask every turn which topic it belongs to, and keep that as a grouping dimension |
| `contextOllama` | `false` | Send the background to the local model too; on a 9B model it shortens summaries, drops concrete nouns and roughly doubles latency |
| `gitSync` | disabled | Optional `pull --ff-only` / `push`; never merges, never commits |

`storePath`, `captureEnabled`, `includeToolCalls` and `maxSummaryChars` are volatile fields, so they appear in the plugin's settings form and take effect without a restart. `gitSync` is edited in the profile patch.

## Limitations

- A record covers the **whole turn**: the prompt plus the **final assistant reply**. Both summarisers receive both sides; with the models off, the zero-cost summary reads `问：…；答：…` and the final reply digest is kept separately in `answer`.
- Two summarisers run in parallel each turn: DeepSeek (through the Host `llm` service, using the route already signed in on this profile) and a local Ollama model. When both answer, `summary` is the DeepSeek line and both texts are kept in `summaries`; the panel shows them side by side.
- Privacy boundary: up to 1200 characters of the turn's prompt and of the assistant reply are sent to each selected model. Ollama stays on this machine; the DeepSeek call uses the model service your account already provides. Set `aiDeepseek` to false to keep everything local, or disable both for the zero-cost digest.
- A failing side never blocks the record: that side is skipped, the other is still used, and when both fail the record falls back to the zero-cost digest with `summaryBy: "digest"`; `worklog_status` reports the reason under `ai.*.last.error`.
- **The topic dimension.** Every summary carries a second line, `主题:`, and the model does one job: decide whether this turn continues an existing topic (answer with its id, e.g. `t2`) or starts a new one (`新 <label>`). It is briefed with this session's topic ids, labels, turn counts and a one-line gist, plus the last `contextTurns` summaries (3 by default). Ids are minted by the plugin (`t1`, `t2`, …) and never by the model; labels are compared with spacing and punctuation removed so one subject cannot fork into two; an answer of "不确定" keeps the previous topic instead of inventing one. A topic id is only unique inside its session, so grouping uses the normalised **label**: the same subject in two sessions becomes one group that lists its sessions, while untagged records stay split per session under "No topic" instead of collapsing into one pile. Records carry `topicId` and `topic`; `worklog_topics` reports turns, time span and sample summaries per topic, the panel switches between a session and a topic view, and the mobile page tags each card with its topic.
- **Background limits.** The briefing is filtered by `sessionId`, so sessions never leak into each other; turns tagged `reason:aborted` or `reason:error` are excluded, since half-finished work is not a dependable background. It lives in memory and is seeded from the newest three day files when a session is first seen, so a plugin reload or a resumed session does not start blank.
- **The local model gets no background by default** (`contextOllama: false`). Over the same 12 real turns, adding the thread plus 3 summaries to qwen3.5:9b dropped the average summary from 158 to 103 characters, cut checkable nouns from 6.6 to 3.9 and raised latency from 5.7 s to 12.2 s, with the thread sometimes freezing on an earlier turn. No such regression is established for DeepSeek (a standalone script cannot reach the Host `llm` service), so only that route gets the briefing.
- The two engines get different prompts: DeepSeek keeps the short one (it was already dense), the local model gets the strict one — on the same real inputs the strict set lifted checkable nouns (`dsh.mobile`, `registerMobile`, `sessionId`/`workspace`/`sessionPath`) from 0–1 to 3–5, the same band as DeepSeek's 2–4, at ~1–2 s extra and looser length compliance.
- The local call uses Ollama's native `/api/chat` with `think: false`: through the OpenAI-compatible route qwen3.5 spent the whole budget on reasoning and returned empty content after ~20 s, while disabling thinking answers in ~2 s.
- `files` comes from `git status` in the session's working directory; outside a git repository it stays empty, and it is capped at 30 entries.
- Only turn boundaries are recorded. A turn that produced no text at all is skipped.
- `gitSync` never commits and never merges: it only fast-forwards and pushes, so a dirty tree keeps failing until you commit yourself.
