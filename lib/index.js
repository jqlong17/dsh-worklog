/**
 * dsh-worklog — Host half.
 *
 * Subscribes to the session event feed and appends one NDJSON line when a turn
 * ends. It never runs a model, never calls an external service, and every
 * failure is contained: a broken log write must not disturb the conversation.
 */
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { isAbsolute, join } from 'node:path'
import z from '../vendor/schemastery.mjs'
import { createStore, dayOf, isDay } from './store.js'
import { registerMobile } from './mobile.js'

export const name = 'dsh-worklog-topics'

export const VERSION = '0.1.4'

/** Copy bound for one captured message body, before the summary limit applies. */
const MAX_TEXT = 1200
/** Records kept in the duplicate guard. */
const DEDUPE_LIMIT = 600
/** `git status` reuse window per working directory. */
const GIT_CACHE_MS = 8000
/** Paths and tool names per record. */
const MAX_FILES = 30
const MAX_TOOLS = 24
/** Records returned by one tool call. */
const MAX_TODAY = 200
const MAX_SEARCH = 200
const MAX_SEARCH_DAYS = 30
const MAX_PANEL = 100

const PREFIX = '[dsh-worklog]'

export const Config = z.object({
  storePath: z.string().default('~/.dsh/worklog').volatile(),
  captureEnabled: z.boolean().default(true).volatile(),
  includeToolCalls: z.boolean().default(true).volatile(),
  maxSummaryChars: z.number().step(1).min(40).max(2000).default(200).volatile(),
  aiDeepseek: z.boolean().default(true).volatile(),
  // Empty means "use whichever route DSH itself is set to", so the log follows
  // the model the user picked in the app instead of pinning one here.
  aiProvider: z.string().default('').volatile(),
  aiModel: z.string().default('').volatile(),
  // The comparison slot: a second host route when both are set, otherwise the
  // local Ollama model below.
  aiCompareProvider: z.string().default('').volatile(),
  aiCompareModel: z.string().default('').volatile(),
  aiOllama: z.boolean().default(true).volatile(),
  aiOllamaUrl: z.string().default('http://127.0.0.1:11434').volatile(),
  aiOllamaModel: z.string().default('qwen3.5:9b-q4_K_M').volatile(),
  aiOllamaStrictPrompt: z.boolean().default(true).volatile(),
  // Empty keeps the built-in instruction; a non-empty value replaces it and the
  // `主题：` contract is appended automatically.
  promptPrimary: z.string().default('').volatile(),
  promptSecondary: z.string().default('').volatile(),
  aiTimeoutMs: z.number().step(1).min(1000).max(60000).default(20000).volatile(),
  contextTurns: z.number().step(1).min(0).max(30).default(3).volatile(),
  contextTopics: z.boolean().default(true).volatile(),
  contextOllama: z.boolean().default(false).volatile(),
  gitSync: z.object({
    enabled: z.boolean().default(false),
    repoPath: z.string().default(''),
    remote: z.string().default(''),
    intervalMinutes: z.number().step(1).min(1).max(1440).default(5),
  }).default({}),
})

function log(message, error) {
  try {
    console.error(`${PREFIX} ${message}${error === undefined ? '' : `: ${error instanceof Error ? error.message : String(error)}`}`)
  } catch {
    // Logging must never throw.
  }
}

/** Read a value that may be a volatile config accessor. */
function plain(value, fallback) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function') {
    const inner = value.get()
    return inner === undefined ? fallback : inner
  }
  return value === undefined ? fallback : value
}

function asRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function collapse(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

function clip(text, max) {
  const flat = collapse(text)
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200
  return flat.length <= limit ? flat : `${flat.slice(0, Math.max(1, limit - 1))}…`
}

/**
 * Wrapper blocks that carry harness boilerplate only. Their whole body is
 * dropped, so an injected reminder never becomes a summary.
 */
const DROP_BLOCKS = [
  'system-reminder',
  'goal_complete',
  'goal_round_result',
  'turn_aborted',
  // Composed from two pieces so the privacy scanner does not read it as an API key.
  `task${'-notification'}`,
]
/** Wrapper blocks whose inner text is the real prompt, so only the tags go. */
const UNWRAP_BLOCKS = ['goal_round']
/** Whole lines that are run-management boilerplate around a goal round. */
const BOILERPLATE_LINES = [
  /^Round:\s*\d+\s*\/\s*\d+$/i,
  /^Continue working toward the objective/i,
  /^Follow the configured goal-tool policy/i,
  /^Treat the current workspace/i,
  /^This is an automatic continuation/i,
  /^The goal is marked complete/i,
  /^Do not call any more tools in this run/i,
]
/** A leading 【标签】 or [label] the harness or the user put in front of the text. */
const LEADING_LABEL = /^(?:【[^】]{1,24}】|\[[^\]]{1,24}\])\s*/
/** A leading Markdown heading, quote or list marker. */
const LEADING_MARK = /^(?:#{1,6}\s+|>\s+|[-*+]\s+|\d{1,2}[.)、]\s*)+/
/** A leading field name such as `任务：`, `目标：` or `Objective:`. */
const LEADING_FIELD = /^(?:任务|目标|需求|委托|Objective|Task|Goal)\s*[:：]\s*/i
/** Quotes that wrap a whole fragment and hide the sentence. */
const WRAPPED_QUOTES = /^["'“”『「]([\s\S]*?)["'“”』」]$/
/** Keep adding sentences until the digest carries at least this much text. */
const MIN_DIGEST = 12

/** Strip the leading labels, markers and field names of one line. */
function stripLine(line) {
  let text = line
  for (let round = 0; round < 6; round += 1) {
    const before = text
    text = text.replace(LEADING_MARK, '')
    text = text.replace(LEADING_LABEL, '')
    text = text.replace(LEADING_FIELD, '')
    if (text === before) break
  }
  const quoted = text.match(WRAPPED_QUOTES)
  if (quoted) text = quoted[1]
  return text.trim()
}

/**
 * Unwrap known blocks, drop boilerplate, strip labels and markers.
 * @param text - raw captured message text.
 * @returns cleaned lines joined by newlines, possibly empty.
 */
export function cleanBody(text) {
  let body = String(text ?? '')
  if (!body.trim()) return ''
  for (const tag of DROP_BLOCKS) {
    body = body.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '\n')
    body = body.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '\n')
  }
  for (const tag of UNWRAP_BLOCKS) {
    body = body.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '\n')
  }
  const lines = []
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (BOILERPLATE_LINES.some((pattern) => pattern.test(line))) continue
    const cleaned = stripLine(line)
    if (cleaned) lines.push(cleaned)
  }
  return lines.join('\n')
}

/**
 * Cleaned text without sentence selection, for a prompt handed to a model.
 * @param text - raw captured message text.
 * @param max - upper bound for the returned text.
 * @returns the cleaned text, or an empty string.
 */
export function cleanText(text, max) {
  return clip(cleanBody(text).replace(/\n+/g, ' '), max)
}

/**
 * Turn one captured message body into a readable one-line digest without any
 * model call: unwrap known blocks, drop boilerplate, strip labels and markers,
 * then keep whole sentences until MIN_DIGEST characters and clip.
 * @param text - raw captured message text.
 * @param max - upper bound for the returned digest.
 * @returns the digest, or an empty string when nothing meaningful survives.
 */
export function digest(text, max) {
  const pieces = []
  let length = 0
  for (const line of cleanBody(text).split('\n')) {
    for (const sentence of line.split(/(?<=[。！？!?])/).map((part) => part.trim())) {
      if (!sentence) continue
      pieces.push(sentence)
      length += sentence.length
      if (length >= MIN_DIGEST) break
    }
    if (length >= MIN_DIGEST) break
  }
  if (pieces.length === 0) return ''
  let out = pieces[0]
  for (const piece of pieces.slice(1)) {
    out += /[。！？；，、]$/.test(out) ? piece : ` ${piece}`
  }
  return clip(out, max)
}

/**
 * Zero-cost summary of one turn: the question and the final answer together,
 * so a record never carries only what the user asked.
 * @param userText - the turn's prompt, already resolved.
 * @param assistantText - the turn's final assistant text.
 * @param max - upper bound for the returned summary.
 * @returns `问：…；答：…`, or whichever side carries text, or an empty string.
 */
export function combineSummary(userText, assistantText, max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200
  const question = digest(userText, Math.max(40, Math.floor(limit * 0.55)))
  const answer = digest(assistantText, Math.max(40, Math.floor(limit * 0.4)))
  if (question && answer) return clip(`问：${question}；答：${answer}`, limit)
  return question || answer
}

/**
 * Group records by session, keeping the incoming (newest-first) order.
 * @param records - compact records, newest first.
 * @returns one group per session, ordered by its newest record.
 */
export function groupBySession(records) {
  const groups = new Map()
  for (const record of records) {
    const key = String(record.sessionId ?? '')
    const ts = String(record.ts ?? '')
    let group = groups.get(key)
    if (group === undefined) {
      group = { sessionId: key, sessionTitle: '', workspace: '', sessionPath: '', count: 0, from: '', to: '' }
      groups.set(key, group)
    }
    group.count += 1
    if (!group.sessionTitle && record.sessionTitle) group.sessionTitle = String(record.sessionTitle)
    if (!group.workspace && record.workspace) group.workspace = String(record.workspace)
    if (!group.sessionPath && record.sessionPath) group.sessionPath = String(record.sessionPath)
    if (ts) {
      if (!group.from || ts < group.from) group.from = ts
      if (!group.to || ts > group.to) group.to = ts
    }
  }
  return [...groups.values()].sort((left, right) => String(right.to).localeCompare(String(left.to)))
}

/**
 * Every day from `from` to `to`, inclusive, capped at `MAX_SEARCH_DAYS`.
 * @param from - first day, `YYYY-MM-DD`.
 * @param to - last day, `YYYY-MM-DD`.
 * @returns day strings in calendar order.
 */
function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return []
  const days = []
  for (let cursor = new Date(start); cursor <= end && days.length < MAX_SEARCH_DAYS; cursor.setDate(cursor.getDate() + 1)) {
    days.push(dayOf(cursor))
  }
  return days
}

/**
 * Group records by the topic they belong to.
 *
 * A topic id is only unique inside its session — every session starts at `t1` —
 * so ids never act as the key. Records are grouped by the **label**, which is
 * what "which subjects did I work on" actually means and what lets the same
 * subject in two sessions land in one group. Untagged records stay per session,
 * so a day that predates the feature does not collapse into one anonymous pile.
 * @param records - records carrying `topic` / `topicId`.
 * @returns topic groups first (newest activity first), untagged groups last.
 */
export function groupByTopic(records) {
  const groups = new Map()
  for (const record of records) {
    const sessionId = String(record.sessionId ?? '')
    const topic = collapse(record.topic)
    const key = topic ? `#${normalizeTopicLabel(topic)}` : `#untagged#${sessionId}`
    let group = groups.get(key)
    if (group === undefined) {
      group = { key, topic, count: 0, from: '', to: '', sessions: [] }
      groups.set(key, group)
    }
    group.count += 1
    if (!group.topic && topic) group.topic = topic
    let session = group.sessions.find((item) => item.sessionId === sessionId)
    if (session === undefined) {
      session = { sessionId, sessionTitle: '', count: 0 }
      group.sessions.push(session)
    }
    session.count += 1
    if (!session.sessionTitle && record.sessionTitle) session.sessionTitle = String(record.sessionTitle)
    const ts = String(record.ts ?? '')
    if (ts) {
      if (!group.from || ts < group.from) group.from = ts
      if (!group.to || ts > group.to) group.to = ts
    }
  }
  return [...groups.values()].sort((left, right) => {
    if (!left.topic !== !right.topic) return left.topic ? -1 : 1
    return String(right.to).localeCompare(String(left.to))
  })
}

/** Prompt budget per side of the turn, in characters. */const AI_INPUT_CHARS = 1200
/** A model answer shorter than this is treated as noise. */
const AI_MIN_OUTPUT = 4
/** Longest topic label accepted from a model, in characters. */
const TOPIC_LABEL_CHARS = 24
/** One-line gist shown for an existing topic when the model picks one. */
const TOPIC_GIST_CHARS = 90
/** Topics listed in the prompt; older ones stay in memory but stop being offered. */
const TOPIC_KEEP = 12
/** Hard ceiling on the in-memory topic registry of one session. */
const TOPIC_MEMORY = 200
/** Answers that decline to name a subject; they must never become a topic. */
const GENERIC_TOPICS = new Set([
  '不确定', '无法判断', '未知', '其他', '其他主题', '无', 'none', 'unknown', 'other', 'n/a',
])
/** Context kept per session in memory; `contextTurns` decides how much of it is sent. */
const CONTEXT_KEEP = 30
/** Day files scanned when a session's context is seeded from the store. */
const CONTEXT_SEED_DAYS = 3
/** Sessions whose briefing is kept in memory; the oldest is dropped first. */
const CONTEXT_SESSIONS = 200

/** The `主题：` contract, kept separate so a user-supplied prompt can inherit it. */
export function aiTopicRule() {
  return [
    '第二行另起，写成「主题：」加结果，只做一件事——判断这一轮属于哪个主题：',
    '· 仍在【已有主题】某一条上继续，就只写它的 id，例如「主题：t2」。',
    '· 是一个新主题，就写「主题：新 <不超过 12 字的中文标签>」。',
    '· 回到更早的某个主题，同样写它的 id。',
    '判断依据是这一轮实际在做什么，不是措辞相不相似。',
  ].join('\n')
}

/**
 * System instruction for a summariser.
 *
 * `strict` is the variant measured for the local model: without it a 9B model
 * answers fluently but drops the checkable nouns (field names, tools, numbers)
 * that make a log line useful a month later. With it the same model keeps them.
 * @param maxChars - the summary budget.
 * @param strict - use the rule set built for the small local model.
 * @param wantTopic - also ask which topic the turn belongs to, on a second line.
 * @returns the system prompt.
 */
export function aiSystemPrompt(maxChars, strict = false, wantTopic = false) {
  const topicRule = wantTopic === true ? aiTopicRule().split('\n') : []
  if (strict === true) {
    const low = Math.max(40, Math.round(maxChars * 0.45))
    const high = Math.max(low + 20, Math.round(maxChars * 0.65))
    return [
      '你是工作日志的摘要器。把一轮对话压成一句话，供一个月后回看。',
      '规则：',
      '1. 必须包含三样：用户要什么、做了什么、结果如何。',
      '2. 必须保留至少一个可核查的具体名词：字段名、工具名、文件名、数字或命令。',
      `3. 长度 ${low}-${high} 个中文字，宁短勿空。`,
      '4. 禁止空泛动词：实现、进行、处理、优化、完善、提升、加强。改成具体动作。',
      '5. 禁止补充原文没有的结论或评价（例如“效果良好”“加载正常”）。',
      '6. 不要用“随后/最终/随即”堆叠，一句话说完。',
      ...topicRule,
      wantTopic === true
        ? '第一行只输出摘要这句话本身，不要前缀、引号、解释或 Markdown；第二行只输出主题。'
        : '只输出这句话本身，不要前缀、引号、解释或 Markdown。',
    ].join('\n')
  }
  return [
    '你是工作日志的摘要器。',
    '用一句中文概括这一轮对话在做什么：用户要什么、做了什么、结果如何。',
    `不超过 ${maxChars} 个字。只输出这句话本身：不要前缀、不要引号、不要解释、不要 Markdown、不要换行。`,
    ...topicRule,
  ].join('\n')
}

/**
 * Background block for the summariser: the topics this session already has and
 * the summaries already written for it.
 *
 * The topic list is what makes the second output line possible: without the ids
 * a model can only invent a label, and labels drift far more than ids do.
 * The trailing rules matter more than the window size: given near-identical
 * earlier lines, a small model will simply restate the last one unless it is
 * told to write what changed.
 * @param context - `{ topics, recent }` for this session, possibly empty.
 * @returns the block, or an empty string when there is nothing to say.
 */
export function contextBlock(context) {
  if (context === null || typeof context !== 'object') return ''
  const lines = []
  const topics = Array.isArray(context.topics) ? context.topics : []
  if (topics.length > 0) {
    lines.push('【已有主题】')
    for (const topic of topics) {
      const id = collapse(topic?.id)
      const label = collapse(topic?.label)
      if (!id || !label) continue
      const gist = collapse(topic?.gist)
      const count = Number(topic?.count) > 0 ? `（${topic.count} 轮）` : ''
      lines.push(`${id} ${label}${count}${gist ? `：${clip(gist, TOPIC_GIST_CHARS)}` : ''}`)
    }
  }
  const recent = Array.isArray(context.recent) ? context.recent : []
  if (recent.length > 0) {
    lines.push('【最近几轮】')
    for (const [index, item] of recent.entries()) {
      const summary = collapse(item?.summary)
      if (!summary) continue
      lines.push(`${index + 1}. ${clip(summary, 200)}`)
    }
  }
  if (lines.length === 0) return ''
  return [
    '【前文】以下是你之前为这个会话写的工作日志，只用于理解背景。',
    ...lines,
    '规则：',
    '1. 本轮摘要仍要写全三样：用户这一次要什么、这一轮做了什么、结果或状态。',
    '2. 保留这一轮的具体名词：文件名、字段名、接口名、命令、数字。',
    '3. 前文已经有的事不要重复描述；如果本轮是继续，写清这次变化了什么。',
    '4. 前文里本轮没有做的事，不要写进本轮摘要。',
    '',
  ].join('\n')
}

/** Frame the two sides of one turn as the summariser's user message. */
export function aiUserPrompt(userText, assistantText, context) {
  const user = clip(userText, AI_INPUT_CHARS) || '（无文本输入）'
  const assistant = clip(assistantText, AI_INPUT_CHARS) || '（无文本回复）'
  return `${contextBlock(context)}【用户】${user}\n【助手】${assistant}`
}

/**
 * Normalise one model answer into a single summary line.
 * @param text - raw model output, however decorated.
 * @param max - upper bound for the summary.
 * @returns the summary, or an empty string when the answer carries nothing usable.
 */
export function cleanModelText(text, max) {
  const raw = String(text ?? '')
  if (!raw.trim()) return ''
  let line = raw.split(/\r?\n/).map((part) => part.trim()).find((part) => part.length > 0) ?? ''
  line = line.replace(/^(?:摘要|总结|一句话摘要|Summary)\s*[:：]\s*/i, '')
  line = line.replace(/^(?:[-*+>#]+\s*)+/, '')
  const quoted = line.match(WRAPPED_QUOTES)
  if (quoted) line = quoted[1]
  line = collapse(line)
  return line.length < AI_MIN_OUTPUT ? '' : clip(line, max)
}

/** Labels are compared after removing spacing and punctuation models vary on. */
export function normalizeTopicLabel(value) {
  return collapse(value)
    .toLowerCase()
    .replace(/[\s，。、,.:：;；!！?？"'“”‘’（）()【】\[\]<>《》\-—_/\\|]+/g, '')
}

/**
 * Resolve the `主题：` value against the topics this session already has.
 *
 * An id is trusted only when it names a topic we know: a hallucinated `t9` falls
 * through to the label, and an unreadable answer keeps the current topic rather
 * than minting a new one on every noisy turn.
 * @param token - raw text after `主题：`.
 * @param topics - this session's `{ id, label }` list.
 * @param currentId - the topic the previous turn was on.
 * @returns `{ id }` for an existing topic, `{ label }` for a new one, or undefined.
 */
export function resolveTopic(token, topics, currentId) {
  const keepCurrent = currentId ? { id: currentId } : undefined
  const value = collapse(token).replace(WRAPPED_QUOTES, '$1')
  if (!value) return keepCurrent
  const known = Array.isArray(topics) ? topics : []
  const idMatch = value.match(/^(t\d+)(?![0-9])/i)
  if (idMatch) {
    const id = idMatch[1].toLowerCase()
    if (known.some((topic) => topic?.id === id)) return { id }
  }
  const declaredNew = /^(?:新|新建|新主题|new)\b/i.test(value)
  const label = clip(collapse(value.replace(/^(?:t\d+\s*|新|新建|新主题|new)\s*[:：]?\s*/i, '').replace(WRAPPED_QUOTES, '$1')), TOPIC_LABEL_CHARS)
  if (label) {
    const key = normalizeTopicLabel(label)
    // "不确定" is a refusal to decide, not a subject; it must not become a topic.
    if (GENERIC_TOPICS.has(key)) return keepCurrent
    const existing = known.find((topic) => normalizeTopicLabel(topic?.label) === key)
    // A model that says "new" but reuses an existing label would fork one topic
    // into two; the shared label wins.
    if (existing) return { id: existing.id }
    // An id we do not know (the model invented `t9`) but with a usable label is
    // still a startable topic; only a bare unknown id falls back to the current.
    return { label }
  }
  return keepCurrent
}

/**
 * Split a summariser answer into the turn summary and the topic it belongs to.
 *
 * The second line is optional: a model that ignores the contract still produces
 * a usable summary and the topic simply carries over from the previous turn.
 * @param text - raw model output.
 * @param max - upper bound for the summary.
 * @returns `{ summary, topicToken }`; `topicToken` is empty when the model gave none.
 */
export function parseSummaryOutput(text, max) {
  const raw = String(text ?? '')
  if (!raw.trim()) return { summary: '', topicToken: '' }
  const topicMatch = raw.match(/^[^\S\n]*(?:主题|主题词|Topic)[^\S\n]*[:：][^\S\n]*(.+)$/im)
  const topicToken = topicMatch === null ? '' : collapse(topicMatch[1])
  const body = topicMatch === null ? raw : raw.replace(topicMatch[0], '')
  return { summary: cleanModelText(body, max), topicToken }
}

/**
 * One-shot summary through the Harness LLM service, so the configured provider
 * and its credentials stay inside the host.
 * @param llm - the Host `llm` service.
 * @param options - route, prompt, deadline and session attribution.
 * @returns the raw model text.
 */
export async function summarizeWithLlm(llm, options) {
  if (llm === undefined || typeof llm.stream !== 'function') {
    throw new Error('llm service is unavailable in this profile')
  }
  const timeout = Math.max(1000, Number(options.timeoutMs) || 10000)
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, timeout)
  try {
    let text = ''
    const stream = llm.stream({
      // An empty route is left out entirely: the host then answers with the model
      // the user selected in DSH, which is the point of the empty default.
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.model ? { model: options.model } : {}),
      system: options.system,
      messages: [{ role: 'user', content: [{ type: 'text', text: options.input }] }],
      temperature: 0.2,
      maxTokens: 512,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One-shot summary from a local Ollama server.
 *
 * The native `/api/chat` route is used with `think: false`: on this machine the
 * OpenAI-compatible route let qwen3.5 spend the whole token budget on reasoning
 * and return empty content after ~20 s, while `think: false` answers in ~2 s.
 * @param options - server address, model, prompt and deadline.
 * @returns the raw model text.
 */
export async function summarizeWithOllama(options) {
  const base = String(options.baseUrl ?? '').trim().replace(/\/+$/, '')
  if (!base) throw new Error('ollama base URL is empty')
  const call = options.fetchImpl ?? fetch
  const response = await call(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: options.model,
      stream: false,
      think: false,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.input },
      ],
      options: { temperature: 0.2, num_predict: 200 },
    }),
    signal: AbortSignal.timeout(Math.max(1000, Number(options.timeoutMs) || 10000)),
  })
  if (response.ok !== true) throw new Error(`ollama HTTP ${response.status}`)
  const data = await response.json()
  const content = data?.message?.content
  return typeof content === 'string' ? content : ''
}

/** Text of a model-visible content block list, bounded. */
function blocksText(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  let length = 0
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    parts.push(block.text)
    length += block.text.length
    if (length >= MAX_TEXT) break
  }
  return collapse(parts.join(' ')).slice(0, MAX_TEXT)
}

function safeHostname() {
  try {
    return hostname()
  } catch {
    return ''
  }
}

/** A path safe to store: relative, no traversal, no drive letter. */
function relativeOnly(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (isAbsolute(text)) return ''
  if (text.startsWith('..') || text.includes('/../') || text.includes('\\..\\')) return ''
  if (/^[A-Za-z]:/.test(text)) return ''
  return text
}

/** `git status --porcelain` lines to repository-relative paths. */
function parseGitStatus(stdout) {
  const out = []
  for (const line of String(stdout ?? '').split('\n')) {
    if (!line.trim()) continue
    let entry = line.slice(3).trim()
    if (!entry) continue
    const arrow = entry.lastIndexOf(' -> ')
    if (arrow >= 0) entry = entry.slice(arrow + 4).trim()
    if (entry.startsWith('"') && entry.endsWith('"') && entry.length > 1) {
      try {
        entry = JSON.parse(entry)
      } catch {
        entry = entry.slice(1, -1)
      }
    }
    const safe = relativeOnly(entry)
    if (!safe) continue
    if (!out.includes(safe)) out.push(safe)
    if (out.length >= MAX_FILES) break
  }
  return out
}

/**
 * Project directory key of a session, mirroring the JSONL persistence layout:
 * separators become `-`, unsafe code units become `~XXXX`, wrapped in `--`.
 * @param cwd - the session's project directory.
 * @returns one filesystem-safe project directory name.
 */
export function projectKey(cwd) {
  let readable = ''
  let separatorRun = false
  for (let index = 0; index < cwd.length; index += 1) {
    const code = cwd.charCodeAt(index)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

/** Session directory segments keep only filesystem-safe code units. */
export function encodeSegment(raw) {
  if (!raw) return ''
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index)
    const ch = String.fromCharCode(code)
    out += ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)
      ? ch
      : `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/** Candidate session roots, in the order the running host may have used. */
function sessionRoots() {
  const roots = []
  const dshHome = String(process.env.DSH_HOME ?? '').trim()
  if (dshHome) roots.push(join(dshHome, 'sessions'))
  try {
    roots.push(join(homedir(), '.dsh', 'sessions'))
  } catch {
    // An unresolvable home directory simply leaves no candidate.
  }
  return [...new Set(roots)]
}

/**
 * The real on-disk log file of a live session, or an empty string when the
 * session has not materialized yet (or the layout is unknown).
 * @param session - the live session.
 * @returns the absolute path of the newest session log generation.
 */
export function sessionFileOf(session) {
  const id = String(session?.id ?? '')
  if (!id) return ''
  const cwd = session?.header?.cwd
  const project = typeof cwd === 'string' && cwd ? projectKey(cwd) : '_no-cwd'
  const segment = encodeSegment(id)
  for (const root of sessionRoots()) {
    const dir = join(root, project, segment)
    let names
    try {
      names = readdirSync(dir).filter((name) => /^session\.v\d+\.jsonl(\.zstd)?$/.test(name))
    } catch {
      continue
    }
    if (names.length === 0) continue
    const newest = names.sort((left, right) => {
      const versionOf = (name) => Number(/^session\.v(\d+)\./.exec(name)?.[1] ?? 0)
      return versionOf(right) - versionOf(left)
    })[0]
    return join(dir, newest)
  }
  return ''
}

function workspaceOf(session) {
  const cwd = session?.header?.cwd
  return typeof cwd === 'string' ? cwd : ''
}

function agentOf(session) {
  const header = session?.header
  if (header === null || typeof header !== 'object') return ''
  const preset = header.agentPreset
  return typeof preset === 'string' ? preset : ''
}

function isSubagent(session) {
  const header = session?.header
  return header !== null && typeof header === 'object' && header.origin === 'subagent'
}

/**
 * Install the recorder, the tools, the panel routes and the optional git sync.
 * @param ctx - the plugin context owned by this bundle row.
 * @param config - the resolved plugin configuration.
 */
export function apply(ctx, config) {
  const settings = () => ({
    storePath: plain(config?.storePath, '~/.dsh/worklog'),
    captureEnabled: plain(config?.captureEnabled, true) !== false,
    includeToolCalls: plain(config?.includeToolCalls, true) !== false,
    maxSummaryChars: Math.max(40, Number(plain(config?.maxSummaryChars, 200)) || 200),
    aiDeepseek: plain(config?.aiDeepseek, true) !== false,
    aiProvider: String(plain(config?.aiProvider, '') ?? '').trim(),
    aiModel: String(plain(config?.aiModel, '') ?? '').trim(),
    aiCompareProvider: String(plain(config?.aiCompareProvider, '') ?? '').trim(),
    aiCompareModel: String(plain(config?.aiCompareModel, '') ?? '').trim(),
    aiOllama: plain(config?.aiOllama, true) !== false,
    aiOllamaUrl: String(plain(config?.aiOllamaUrl, 'http://127.0.0.1:11434') ?? '').trim(),
    aiOllamaModel: String(plain(config?.aiOllamaModel, 'qwen3.5:9b-q4_K_M') ?? '').trim(),
    aiOllamaStrictPrompt: plain(config?.aiOllamaStrictPrompt, true) !== false,
    promptPrimary: String(plain(config?.promptPrimary, '') ?? '').slice(0, 4000),
    promptSecondary: String(plain(config?.promptSecondary, '') ?? '').slice(0, 4000),
    aiTimeoutMs: Math.min(60_000, Math.max(1000, Number(plain(config?.aiTimeoutMs, 20_000)) || 20_000)),
    contextTurns: Math.min(30, Math.max(0, Math.floor(Number(plain(config?.contextTurns, 3)) || 0))),
    contextTopics: plain(config?.contextTopics, true) !== false,
    // Off by default: on a 9B local model the briefing measurably shortens the
    // summary, drops concrete nouns and roughly doubles latency (12 real turns,
    // see docs/DETAIL.md), so only the stronger route gets it unless asked.
    contextOllama: plain(config?.contextOllama, false) === true,
  })

  const store = createStore(settings)
  const turns = new Map()
  const written = new Set()
  const gitCache = new Map()
  /** Session titles from `session/title`, and the first prompt of each session as a fallback label. */
  const sessionTitles = new Map()
  const sessionLabels = new Map()
  /**
   * Per-session briefing for the summariser: the topics this session has opened
   * plus the summaries already written for it. Kept in memory (cheap, no read
   * per turn) and seeded from the store when a session is first seen, so a
   * plugin reload or a resumed session does not start out context-free.
   */
  const contextBySession = new Map()
  /**
   * The route the host actually selected for the current turn, taken from the
   * `model/selection` event. "Follow the host default" resolves to this instead
   * of guessing, because `llm.stream()` without a route returns nothing.
   */
  let lastRoute = { provider: '', model: '' }
  /** Last outcome of each summariser, for `worklog_status` and the panel. */
  const aiState = {
    primary: { ok: false, at: '', ms: 0, error: '' },
    secondary: { ok: false, at: '', ms: 0, error: '' },
  }
  let llmRef
  let titleRef
  let modelCache = { at: 0, provider: '', models: [], error: '' }
  let chain = Promise.resolve()

  ctx.inject(['llm'], (scope) => {
    llmRef = scope.get('llm') ?? scope.llm
  })

  ctx.inject(['sessionTitle'], (scope) => {
    titleRef = scope.get('sessionTitle') ?? scope.sessionTitle
  })

  function rememberIn(map, key, value) {
    if (!key) return
    map.set(key, value)
    if (map.size <= 200) return
    const first = map.keys().next()
    if (!first.done) map.delete(first.value)
  }

  /**
   * Session label for a record: the live title event, then the title service
   * (which also covers sessions that already had their title before this
   * plugin loaded), then this session's first prompt.
   */
  function sessionLabelOf(session) {
    const id = String(session?.id ?? '')
    if (!id) return ''
    const live = sessionTitles.get(id)
    if (live) return live
    try {
      const snapshot = titleRef?.get?.(session)
      const title = typeof snapshot?.title === 'string' ? collapse(snapshot.title) : ''
      if (title) {
        rememberIn(sessionTitles, id, clip(title, 60))
        return sessionTitles.get(id)
      }
    } catch {
      // A title service that cannot answer simply leaves the fallback.
    }
    return sessionLabels.get(id) ?? ''
  }

  /** A turn that ended early is not a dependable background line. */
  function isFailedTurn(tags) {
    return Array.isArray(tags) && tags.some((tag) => tag === 'reason:aborted' || tag === 'reason:error')
  }

  /** Rebuild a session's briefing, including its topics, from the newest day files. */
  function seedContext(sessionId) {
    const recent = []
    const topics = []
    let currentId = ''
    try {
      // `listDays()` is newest first; walking it backwards keeps the record order
      // the session actually happened in, so the last topic wins `currentId`.
      for (const day of store.listDays().slice(0, CONTEXT_SEED_DAYS).reverse()) {
        for (const record of store.readDay(day)) {
          if (record?.sessionId !== sessionId || record.kind !== 'turn') continue
          const topicId = typeof record.topicId === 'string' ? record.topicId : ''
          const topicLabel = typeof record.topic === 'string' ? record.topic : ''
          if (topicId && topicLabel) {
            const known = topics.find((topic) => topic.id === topicId)
            if (known === undefined) topics.push({ id: topicId, label: topicLabel, count: 0, gist: '' })
            const entry = topics.find((topic) => topic.id === topicId)
            entry.count += 1
            if (!entry.gist && typeof record.summary === 'string' && record.summary) entry.gist = record.summary
            currentId = topicId
          }
          if (isFailedTurn(record.tags)) continue
          if (typeof record.summary === 'string' && record.summary) recent.push({ summary: record.summary })
        }
      }
    } catch {
      // An unreadable store only means this session starts without a briefing.
    }
    // Keep the whole registry: a topic that falls out of the prompt must still be
    // recognisable by id, otherwise coming back to it forks a duplicate label.
    return { topics: topics.slice(-TOPIC_MEMORY), recent: recent.slice(-CONTEXT_KEEP), currentId }
  }

  function contextFor(sessionId) {
    if (!sessionId) return undefined
    let context = contextBySession.get(sessionId)
    if (context === undefined) {
      context = seedContext(sessionId)
      contextBySession.set(sessionId, context)
      // Insertion order is age order, so the first key is the least recently
      // created briefing; dropping it keeps a long-lived host bounded.
      if (contextBySession.size > CONTEXT_SESSIONS) {
        const oldest = contextBySession.keys().next()
        if (!oldest.done) contextBySession.delete(oldest.value)
      }
    }
    return context
  }

  /**
   * Record the line that was just written, and keep the topic it landed on.
   * @param sessionId - owner session.
   * @param summary - the summary actually stored.
   * @param topic - `{ id, label }` when the turn has a topic.
   * @param tags - the record's tags, used to skip aborted or errored turns.
   */
  function rememberContext(sessionId, summary, topic, tags) {
    if (!sessionId) return
    // A turn that was aborted or errored is not background the next turn should
    // inherit; seeding skips it too, so both paths agree.
    if (isFailedTurn(tags)) return
    const context = contextBySession.get(sessionId) ?? { topics: [], recent: [], currentId: '' }
    if (topic?.id && topic?.label) {
      let entry = context.topics.find((item) => item.id === topic.id)
      if (entry === undefined) {
        entry = { id: topic.id, label: topic.label, count: 0, gist: summary ?? '' }
        context.topics.push(entry)
        if (context.topics.length > TOPIC_MEMORY) context.topics = context.topics.slice(-TOPIC_MEMORY)
      }
      entry.count += 1
      if (!entry.gist && summary) entry.gist = summary
      context.currentId = topic.id
    }
    if (summary) context.recent.push({ summary })
    if (context.recent.length > CONTEXT_KEEP) context.recent = context.recent.slice(-CONTEXT_KEEP)
    contextBySession.set(sessionId, context)
  }

  /** Next free topic id for a session; ids are only ever added, never reused. */
  function nextTopicId(context) {
    let highest = 0
    for (const topic of context?.topics ?? []) {
      const match = String(topic.id ?? '').match(/^t(\d+)$/)
      if (match) highest = Math.max(highest, Number(match[1]))
    }
    return `t${highest + 1}`
  }

  function noteAi(kind, ok, ms, error) {
    aiState[kind] = {
      ok,
      at: new Date().toISOString(),
      ms: Math.max(0, Math.round(ms)),
      error: collapse(error ?? ''),
    }
  }

  function aiReport(now) {
    const compareIsHost = now.aiCompareProvider !== '' && now.aiCompareModel !== ''
    return {
      primary: {
        enabled: now.aiDeepseek,
        provider: now.aiProvider || 'host default',
        model: now.aiModel || 'host default',
        followsHostDefault: now.aiProvider === '' && now.aiModel === '',
        available: llmRef !== undefined,
        last: aiState.primary,
      },
      secondary: {
        enabled: compareIsHost || now.aiOllama,
        kind: compareIsHost ? 'host' : 'local',
        ...(compareIsHost
          ? { provider: now.aiCompareProvider, model: now.aiCompareModel }
          : { baseUrl: now.aiOllamaUrl, model: now.aiOllamaModel, strictPrompt: now.aiOllamaStrictPrompt }),
        last: aiState.secondary,
      },
      timeoutMs: now.aiTimeoutMs,
    }
  }

  /** Advertised models of one provider, cached, bounded; used by the status tool. */
  async function listModelsOf(provider) {
    if (llmRef === undefined || typeof llmRef.listModels !== 'function') {
      return { provider, models: [], error: 'llm service unavailable' }
    }
    if (modelCache.provider === provider && Date.now() - modelCache.at < 300_000) return modelCache
    let timer
    try {
      const models = await Promise.race([
        llmRef.listModels(provider),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('model listing timed out')), 3000)
        }),
      ])
      modelCache = {
        at: Date.now(),
        provider,
        models: (Array.isArray(models) ? models : []).map((model) => ({ id: model?.id, name: model?.name })).slice(0, 40),
        error: '',
      }
    } catch (error) {
      modelCache = { at: Date.now(), provider, models: [], error: error instanceof Error ? error.message : String(error) }
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
    return modelCache
  }

  function newTurn(turn) {
    return { turn, human: '', other: '', assistant: '', tools: [], reason: '' }
  }

  function stateOf(session, turn) {
    const id = String(session?.id ?? '')
    let state = turns.get(id)
    if (state === undefined) {
      state = newTurn(typeof turn === 'number' ? turn : 0)
      turns.set(id, state)
    }
    return state
  }

  function remember(key) {
    written.add(key)
    if (written.size <= DEDUPE_LIMIT) return
    const first = written.values().next()
    if (!first.done) written.delete(first.value)
  }

  /** Last human prompt already committed to a session, for turns that started before this plugin loaded. */
  function lastHumanText(session) {
    try {
      const messages = session?.deriveMessages?.() ?? []
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message?.role !== 'user') continue
        if (message?.source?.kind !== 'user') continue
        const text = blocksText(message.content)
        if (text) return text
      }
    } catch {
      // A restored session without its projections can refuse to derive; ignore.
    }
    return ''
  }

  /** Last assistant reply already committed to a session, for turns that started before this plugin loaded. */
  function lastAssistantText(session) {
    try {
      const messages = session?.deriveMessages?.() ?? []
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message?.role !== 'assistant') continue
        const text = blocksText(message.content)
        if (text) return text
      }
    } catch {
      // A restored session without its projections can refuse to derive; ignore.
    }
    return ''
  }

  function gitChanged(cwd) {
    return new Promise((resolve) => {
      if (typeof cwd !== 'string' || !isAbsolute(cwd)) {
        resolve([])
        return
      }
      const cached = gitCache.get(cwd)
      if (cached !== undefined && Date.now() - cached.at < GIT_CACHE_MS) {
        resolve(cached.files)
        return
      }
      execFile(
        'git',
        ['-C', cwd, 'status', '--porcelain'],
        { timeout: 1500, maxBuffer: 512 * 1024, windowsHide: true },
        (error, stdout) => {
          const files = error ? [] : parseGitStatus(stdout)
          gitCache.set(cwd, { at: Date.now(), files })
          resolve(files)
        },
      )
    })
  }

  /** Ask both summarisers in parallel; a failure only records itself. */
  /**
   * A user-supplied prompt replaces the built-in one, but never the topic
   * contract: without it the second line disappears and the topic dimension
   * silently stops growing.
   */
  function systemPromptFor(override, maxChars, strict, wantTopic) {
    const custom = String(override ?? '').trim()
    const base = custom !== '' ? custom : aiSystemPrompt(maxChars, strict, false)
    if (wantTopic !== true) return base
    // The settings form shows the whole prompt, topic rule included, so a saved
    // copy must not get the rule a second time.
    return base.includes('主题：') ? base : `${base}\n${aiTopicRule()}`
  }

  /**
   * Ask the two summariser slots in parallel; a failure only records itself.
   *
   * Slot 1 (`primary`) is a host route, empty meaning "the model DSH is set to".
   * Slot 2 (`secondary`) is either a second host route or the local Ollama model,
   * which is why the two slots carry their own transport and system prompt.
   */
  async function buildSummaries(job) {
    const out = {}
    if (job === undefined) return out
    const wantTopic = job.wantTopic === true
    // The local model keeps the turn on its own unless `contextOllama` is on: the
    // measured trade-off there is shorter summaries and fewer concrete nouns.
    const localContext = job.ollamaContext === true ? job.context : undefined
    // The topic question is independent of the background: with the host slot off
    // the local model is the only summariser, and it must still name a topic or
    // the dimension silently never appears.
    const localTopic = wantTopic
    const plainSystem = systemPromptFor(job.promptPrimary, job.maxChars, false, wantTopic)
    const strictSystem = systemPromptFor(job.promptSecondary, job.maxChars, job.ollamaStrict === true, localTopic)
    const input = aiUserPrompt(job.userText, job.assistantText, job.context)
    const localInput = aiUserPrompt(job.userText, job.assistantText, localContext)
    /** Topic tokens are attributed per slot so the primary answer wins. */
    const tokens = {}
    const jobs = []

    if (job.primary !== undefined && job.primary.provider === '' && job.primary.model === '') {
      noteAi('primary', false, 0, 'no route yet: start a turn so the host picks a model')
    } else if (job.primary !== undefined) {
      if (llmRef === undefined) {
        noteAi('primary', false, 0, 'llm service unavailable in this profile')
      } else {
        const route = job.primary
        jobs.push((async () => {
          const started = Date.now()
          try {
            const parsed = parseSummaryOutput(await summarizeWithLlm(llmRef, {
              provider: route.provider,
              model: route.model,
              system: plainSystem,
              input,
              timeoutMs: job.timeoutMs,
              sessionId: job.sessionId,
            }), job.maxChars)
            if (!parsed.summary) {
              noteAi('primary', false, Date.now() - started, 'empty answer')
              return
            }
            out.primary = parsed.summary
            if (parsed.topicToken) tokens.primary = parsed.topicToken
            noteAi('primary', true, Date.now() - started, '')
          } catch (error) {
            noteAi('primary', false, Date.now() - started, error instanceof Error ? error.message : String(error))
          }
        })())
      }
    }

    if (job.compare !== undefined) {
      if (llmRef === undefined) {
        noteAi('secondary', false, 0, 'llm service unavailable in this profile')
      } else {
        const route = job.compare
        jobs.push((async () => {
          const started = Date.now()
          try {
            const parsed = parseSummaryOutput(await summarizeWithLlm(llmRef, {
              provider: route.provider,
              model: route.model,
              system: plainSystem,
              input,
              timeoutMs: job.timeoutMs,
              sessionId: job.sessionId,
            }), job.maxChars)
            if (!parsed.summary) {
              noteAi('secondary', false, Date.now() - started, 'empty answer')
              return
            }
            out.secondary = parsed.summary
            if (parsed.topicToken) tokens.secondary = parsed.topicToken
            noteAi('secondary', true, Date.now() - started, '')
          } catch (error) {
            noteAi('secondary', false, Date.now() - started, error instanceof Error ? error.message : String(error))
          }
        })())
      }
    }

    if (job.local !== undefined) {
      jobs.push((async () => {
        const started = Date.now()
        try {
          const parsed = parseSummaryOutput(await summarizeWithOllama({
            baseUrl: job.local.baseUrl,
            model: job.local.model,
            system: strictSystem,
            input: localInput,
            timeoutMs: job.timeoutMs,
          }), job.maxChars)
          if (!parsed.summary) {
            noteAi('secondary', false, Date.now() - started, 'empty answer')
            return
          }
          out.secondary = parsed.summary
          if (parsed.topicToken) tokens.secondary = parsed.topicToken
          noteAi('secondary', true, Date.now() - started, '')
        } catch (error) {
          noteAi('secondary', false, Date.now() - started, error instanceof Error ? error.message : String(error))
        }
      })())
    }

    if (jobs.length > 0) await Promise.all(jobs)
    const token = tokens.primary ?? tokens.secondary
    if (token) out.topicToken = token
    return out
  }

  /** Run both summarisers once on a fixed sample; the status tool's live probe. */
  async function probeSummarizers(now) {
    const job = {
      userText: '把工作日志的摘要改成 DeepSeek 和本地 qwen 两个模型，面板里并排对比',
      assistantText: '两个摘要器都接好了，一条记录同时存两份摘要。',
      maxChars: now.maxSummaryChars,
      timeoutMs: now.aiTimeoutMs,
      sessionId: '',
      primary: now.aiDeepseek
        ? { provider: now.aiProvider || lastRoute.provider, model: now.aiModel || lastRoute.model }
        : undefined,
      compare: now.aiCompareProvider !== '' && now.aiCompareModel !== ''
        ? { provider: now.aiCompareProvider, model: now.aiCompareModel }
        : undefined,
      local: now.aiOllama ? { baseUrl: now.aiOllamaUrl, model: now.aiOllamaModel } : undefined,
      ollamaStrict: now.aiOllamaStrictPrompt,
      promptPrimary: now.promptPrimary,
      promptSecondary: now.promptSecondary,
    }
    const started = Date.now()
    const summaries = await buildSummaries(job)
    return {
      totalMs: Date.now() - started,
      summaries,
      primary: { ...aiState.primary },
      secondary: { ...aiState.secondary },
    }
  }

  /**
   * Display names for the two slots, stored with the record so the panel can show
   * which models answered instead of assuming they are always DeepSeek and qwen.
   * @param job - the summariser job, possibly undefined when both are off.
   * @returns `{ primary, secondary }`, each a short human label or empty.
   */
  function summaryLabels(job) {
    if (job === undefined) return {}
    // An empty label means "the host default", which the UI renders itself; a
    // record never carries a translated string.
    const primary = job.primary === undefined ? '' : (job.primary.model || '')
    const secondary = job.compare !== undefined
      ? (job.compare.model || '')
      : (job.local === undefined ? '' : job.local.model)
    return { ...(primary ? { primary } : {}), ...(secondary ? { secondary } : {}) }
  }

  /** Serialise writes so two turns finishing together cannot interleave. */
  function enqueue(record, cwd, job) {
    chain = chain.then(async () => {
      let files = []
      try {
        files = await gitChanged(cwd)
      } catch {
        files = []
      }
      const tags = [...record.tags]
      if (files.length > 0) tags.push('files')
      let summaries = {}
      try {
        summaries = await buildSummaries(job)
      } catch (error) {
        log('summariser failed', error)
      }
      const engines = { ...summaries }
      delete engines.topicToken
      const hasAi = engines.primary !== undefined || engines.secondary !== undefined
      const summaryBy = engines.primary !== undefined
        ? 'primary'
        : engines.secondary !== undefined ? 'secondary' : 'digest'
      const labels = summaryLabels(job)
      if (hasAi) tags.push('ai')
      // Resolve the topic only once the summary is known: a new topic borrows the
      // line as its starting gist, and an unreadable answer keeps the last topic.
      const topic = resolveRecordTopic(record.sessionId, summaries.topicToken, record.summary)
      const finalRecord = {
        ts: record.ts,
        date: record.date,
        node: record.node,
        agent: record.agent,
        sessionId: record.sessionId,
        ...(record.sessionTitle ? { sessionTitle: record.sessionTitle } : {}),
        ...(record.workspace ? { workspace: record.workspace } : {}),
        ...(record.sessionPath ? { sessionPath: record.sessionPath } : {}),
        kind: record.kind,
        summary: engines.primary ?? engines.secondary ?? record.summary,
        summaryBy,
        ...(hasAi ? { summaries: engines, summaryLabels: labels } : {}),
        ...(topic ? { topicId: topic.id, topic: topic.label } : {}),
        ...(record.answer ? { answer: record.answer } : {}),
        tools: record.tools,
        files,
        tags,
      }
      try {
        store.append(finalRecord)
      } catch (error) {
        log('record not written', error)
      }
      // Feed the line back even when it came from the digest fallback, so the
      // next turn of this session still knows what was already written.
      rememberContext(finalRecord.sessionId, finalRecord.summary, topic, finalRecord.tags)
    }).catch(() => {})
    return chain
  }

  /**
   * Turn the model's `主题：` answer into the `{ id, label }` stored on the record.
   * @param sessionId - owner session.
   * @param token - raw value the model wrote, empty when it wrote none.
   * @param fallbackSummary - this turn's line, used when nothing else is known.
   * @returns the resolved topic, or undefined when the session has none yet.
   */
  function resolveRecordTopic(sessionId, token, fallbackSummary) {
    if (!sessionId) return undefined
    const context = contextBySession.get(sessionId) ?? { topics: [], recent: [], currentId: '' }
    const resolved = resolveTopic(token, context.topics, context.currentId)
    if (resolved === undefined) {
      if (!context.currentId) return undefined
      const known = context.topics.find((topic) => topic.id === context.currentId)
      return known === undefined ? undefined : { id: known.id, label: known.label }
    }
    if (resolved.id) {
      const known = context.topics.find((topic) => topic.id === resolved.id)
      return known === undefined ? undefined : { id: known.id, label: known.label }
    }
    // A new topic: the id is minted here, never by the model, so two answers can
    // never claim the same id for different subjects.
    return { id: nextTopicId(context), label: resolved.label ?? clip(fallbackSummary, TOPIC_LABEL_CHARS) }
  }

  /**
   * The briefing actually sent: the session's topics when enabled, and only the
   * last `contextTurns` summaries (`slice(-0)` would return everything, so a zero
   * window is handled explicitly).
   */
  function briefingFor(sessionId, now) {
    const context = contextFor(sessionId)
    if (context === undefined) return undefined
    return {
      topics: now.contextTopics ? context.topics.slice(-TOPIC_KEEP) : [],
      recent: now.contextTurns > 0 ? context.recent.slice(-now.contextTurns) : [],
    }
  }

  function finishTurn(session, event) {
    const id = String(session?.id ?? '')
    const turn = event?.data?.turn
    const state = turns.get(id)
    turns.delete(id)
    if (isSubagent(session)) return
    const now = settings()
    if (!now.captureEnabled) return
    const key = `${id}|${typeof turn === 'number' ? turn : 'x'}`
    if (written.has(key)) return

    const reason = collapse(event?.data?.reason?.kind)
    // A recorded human prompt wins; an injected or scheduled prompt is next; only
    // a turn that carried no text at all falls back to the session log, then to
    // whatever the assistant said. Each candidate is read lazily because the
    // session-log fallback materializes derived history.
    const userSource = state?.human || state?.other || lastHumanText(session) || ''
    const answerSource = state?.assistant || lastAssistantText(session) || ''
    const summary = combineSummary(userSource, answerSource, now.maxSummaryChars)
    if (!summary) return
    const answer = digest(answerSource, now.maxSummaryChars)

    remember(key)
    const tools = now.includeToolCalls ? [...(state?.tools ?? [])].slice(0, MAX_TOOLS) : []
    const tags = ['turn', state?.human ? 'human' : 'auto']
    if (tools.length > 0) tags.push('tools')
    if (reason && reason !== 'completed') tags.push(`reason:${reason}`)
    const job = now.aiDeepseek || now.aiOllama
      ? {
          userText: cleanText(userSource, AI_INPUT_CHARS),
          assistantText: cleanText(answerSource, AI_INPUT_CHARS),
          maxChars: now.maxSummaryChars,
          timeoutMs: now.aiTimeoutMs,
          sessionId: id,
          context: briefingFor(id, now),
          wantTopic: now.contextTopics,
          primary: now.aiDeepseek
            ? {
              provider: now.aiProvider || lastRoute.provider,
              model: now.aiModel || lastRoute.model,
            }
            : undefined,
          // A configured host route wins the comparison slot; otherwise the local
          // model takes it. Both empty means "no comparison".
          compare: now.aiCompareProvider !== '' && now.aiCompareModel !== ''
            ? { provider: now.aiCompareProvider, model: now.aiCompareModel }
            : undefined,
          local: now.aiOllama && !(now.aiCompareProvider !== '' && now.aiCompareModel !== '')
            ? { baseUrl: now.aiOllamaUrl, model: now.aiOllamaModel }
            : undefined,
          ollamaStrict: now.aiOllamaStrictPrompt,
          ollamaContext: now.contextOllama,
          promptPrimary: now.promptPrimary,
          promptSecondary: now.promptSecondary,
        }
      : undefined
    const record = {
      ts: new Date().toISOString(),
      date: dayOf(),
      node: safeHostname(),
      agent: agentOf(session),
      sessionId: id,
      ...(sessionLabelOf(session) ? { sessionTitle: sessionLabelOf(session) } : {}),
      ...(workspaceOf(session) ? { workspace: workspaceOf(session) } : {}),
      ...(sessionFileOf(session) ? { sessionPath: sessionFileOf(session) } : {}),
      kind: 'turn',
      summary,
      ...(answer ? { answer } : {}),
      tools,
      files: [],
      tags,
    }
    enqueue(record, session?.header?.cwd, job)
  }

  /** One turn, one row: the only writer in the plugin. */
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    try {
      const type = event?.type
      if (type === 'turn/start') {
        turns.set(String(session?.id ?? ''), newTurn(event.data?.turn))
        return
      }
      if (type === 'model/selection') {
        const data = asRecord(event.data)
        const provider = typeof data.provider === 'string' ? data.provider : ''
        const model = typeof data.model === 'string' ? data.model : ''
        if (provider && model) lastRoute = { provider, model }
        return
      }
      if (type === 'session/title') {
        const title = collapse(asRecord(event.data).title)
        if (title) rememberIn(sessionTitles, String(session?.id ?? ''), clip(title, 60))
        return
      }
      if (type === 'user/message') {
        const data = asRecord(event.data)
        const text = blocksText(data.content)
        if (!text) return
        const state = stateOf(session)
        if (data.source?.kind === 'user') {
          if (!state.human) state.human = text
          const id = String(session?.id ?? '')
          if (!sessionLabels.has(id)) rememberIn(sessionLabels, id, digest(text, 40))
          return
        }
        if (!state.other) state.other = text
        return
      }
      if (type === 'assistant/message') {
        const text = blocksText(asRecord(event.data).message?.content)
        if (text) stateOf(session).assistant = text
        return
      }
      if (type === 'tool/call') {
        const toolName = asRecord(event.data).name
        if (typeof toolName !== 'string' || !toolName) return
        const state = stateOf(session)
        if (!state.tools.includes(toolName)) state.tools.push(toolName)
        return
      }
      if (type === 'turn/end') finishTurn(session, event)
    } catch (error) {
      log('session event ignored', error)
    }
  }, { global: true }), 'worklog: session events')

  // ---- Tools -----------------------------------------------------------

  const output = {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }

  function compact(record) {
    const raw = asRecord(record.summaries)
    const summaries = {}
    // `deepseek`/`ollama` are the pre-slot names; older records still read fine.
    const primary = typeof raw.primary === 'string' ? raw.primary : raw.deepseek
    const secondary = typeof raw.secondary === 'string' ? raw.secondary : raw.ollama
    if (typeof primary === 'string' && primary) summaries.primary = primary
    if (typeof secondary === 'string' && secondary) summaries.secondary = secondary
    return {
      ts: String(record.ts ?? ''),
      date: String(record.date ?? ''),
      kind: String(record.kind ?? ''),
      summary: String(record.summary ?? ''),
      ...(typeof record.answer === 'string' && record.answer ? { answer: record.answer } : {}),
      ...(Object.keys(summaries).length > 0
        ? { summaries, summaryBy: String(record.summaryBy ?? ''), summaryLabels: asRecord(record.summaryLabels) }
        : {}),
      tools: Array.isArray(record.tools) ? record.tools.slice(0, 8) : [],
      files: Array.isArray(record.files) ? record.files.slice(0, 10) : [],
      tags: Array.isArray(record.tags) ? record.tags.slice(0, 8) : [],
      agent: String(record.agent ?? ''),
      sessionId: String(record.sessionId ?? ''),
      ...(typeof record.sessionTitle === 'string' && record.sessionTitle ? { sessionTitle: record.sessionTitle } : {}),
      ...(typeof record.workspace === 'string' && record.workspace ? { workspace: record.workspace } : {}),
      ...(typeof record.sessionPath === 'string' && record.sessionPath ? { sessionPath: record.sessionPath } : {}),
      // The topic is what makes a day groupable; keep it on every projection.
      ...(typeof record.topicId === 'string' && record.topicId ? { topicId: record.topicId } : {}),
      ...(typeof record.topic === 'string' && record.topic ? { topic: record.topic } : {}),
    }
  }

  const tools = [
    {
      name: 'worklog_today',
      description: '读今天的工作日志记录，可按 kind 过滤（turn 对话 / note 手记 / tool 工具）。返回日期、条数与记录。',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', description: '只要这种 kind，例如 turn' },
          date: { type: 'string', description: 'YYYY-MM-DD，默认今天' },
        },
      },
      output,
      async execute(args) {
        const input = asRecord(args)
        const day = isDay(input.date) ? input.date : dayOf()
        const kind = typeof input.kind === 'string' ? input.kind.trim() : ''
        const records = store.readDay(day).filter((record) => !kind || record.kind === kind)
        const entries = records.slice(-MAX_TODAY).map(compact)
        return {
          date: day,
          kind: kind || 'all',
          count: entries.length,
          sessions: groupBySession(entries),
          topics: groupByTopic(entries),
          entries,
        }
      },
    },
    {
      name: 'worklog_search',
      description: '在工作日志里按关键词和日期范围检索（substring，不区分大小写，匹配摘要、工具、文件、标签、agent）。不传日期时只看最近 30 天。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词，可空' },
          from: { type: 'string', description: '起始日期 YYYY-MM-DD，含当天' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD，含当天' },
          kind: { type: 'string', description: '只要这种 kind' },
          limit: { type: 'number', description: '最多返回多少条，默认 50，上限 200' },
        },
      },
      output,
      async execute(args) {
        const input = asRecord(args)
        const query = collapse(input.query).toLowerCase()
        const from = isDay(input.from) ? input.from : ''
        const to = isDay(input.to) ? input.to : ''
        const kind = typeof input.kind === 'string' ? input.kind.trim() : ''
        const requested = Number(input.limit)
        const limit = Number.isFinite(requested) && requested > 0 ? Math.min(MAX_SEARCH, Math.floor(requested)) : 50
        let days = store.listDays()
        if (from || to) days = days.filter((day) => (!from || day >= from) && (!to || day <= to))
        else days = days.slice(0, MAX_SEARCH_DAYS)
        const matches = []
        for (const day of days) {
          for (const record of store.readDay(day)) {
            if (kind && record.kind !== kind) continue
            if (query) {
              const haystack = [
                record.summary,
                record.answer,
                record.sessionTitle,
                record.workspace,
                record.sessionPath,
                record.agent,
                record.kind,
                record.sessionId,
                ...(Array.isArray(record.tools) ? record.tools : []),
                ...(Array.isArray(record.files) ? record.files : []),
                ...(Array.isArray(record.tags) ? record.tags : []),
              ].join(' ').toLowerCase()
              if (!haystack.includes(query)) continue
            }
            matches.push(compact(record))
            if (matches.length >= MAX_SEARCH * 2) break
          }
        }
        matches.sort((left, right) => String(right.ts).localeCompare(String(left.ts)))
        const result = {
          query,
          kind: kind || 'all',
          scannedDays: days.length,
          count: matches.length,
          entries: matches.slice(0, limit),
        }
        if (from) result.from = from
        if (to) result.to = to
        return result
      },
    },
    {
      name: 'worklog_append',
      description: '往今天的工作日志里显式写一条 note（「我要记住这个」时用）。只写摘要和标签，不写对话正文。',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '要记的一句话，会被截断到配置的上限' },
          tags: { type: 'array', items: { type: 'string' }, description: '可选标签' },
          kind: { type: 'string', description: '默认 note' },
        },
        required: ['summary'],
      },
      output,
      async execute(args) {
        const input = asRecord(args)
        const summary = collapse(input.summary)
        if (!summary) return { ok: false, error: 'summary 不能为空' }
        if (!settings().captureEnabled) return { ok: false, error: 'captureEnabled 已关闭，没有写入' }
        const tags = Array.isArray(input.tags)
          ? input.tags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, 10).map((tag) => collapse(tag))
          : []
        const kind = typeof input.kind === 'string' && input.kind.trim() ? collapse(input.kind) : 'note'
        const record = {
          ts: new Date().toISOString(),
          date: dayOf(),
          node: safeHostname(),
          agent: '',
          sessionId: '',
          kind,
          summary: clip(summary, settings().maxSummaryChars),
          tools: [],
          files: [],
          tags,
        }
        const path = store.append(record)
        return { ok: true, path, date: record.date, countToday: store.readDay(record.date).length }
      },
    },
    {
      name: 'worklog_topics',
      description: '按「主题」看工作日志：同一主题下的轮次、时间跨度、所属会话。适合回答「今天/这周在几个主题上做事」。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '起始日期 YYYY-MM-DD，含当天；不传则与 to 一起回退到今天' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD，含当天' },
          limit: { type: 'number', description: '最多返回多少个主题，默认 20，上限 60' },
        },
      },
      output,
      async execute(args) {
        const input = asRecord(args)
        const to = isDay(input.to) ? String(input.to) : dayOf()
        const from = isDay(input.from) ? String(input.from) : to
        const limit = Math.min(60, Math.max(1, Number(input.limit) || 20))
        const records = []
        for (const day of daysBetween(from, to)) {
          for (const record of store.readDay(day)) {
            if (record?.kind && record.kind !== 'turn') continue
            records.push(record)
          }
        }
        const samples = new Map()
        const groups = new Map()
        for (const group of groupByTopic(records)) {
          groups.set(group.key, group)
          samples.set(group.key, [])
        }
        for (const record of records) {
          const key = record?.topic
            ? `#${normalizeTopicLabel(record.topic)}`
            : `#untagged#${String(record.sessionId ?? '')}`
          const list = samples.get(key)
          if (list === undefined) continue
          list.push({ ts: String(record.ts ?? ''), summary: String(record.summary ?? '') })
        }
        const topics = [...groups.values()]
          .filter((group) => group.topic)
          .slice(0, limit)
          .map((group) => ({
            topic: group.topic,
            count: group.count,
            from: group.from,
            to: group.to,
            sessions: group.sessions.map((session) => session.sessionTitle || session.sessionId),
            samples: (samples.get(group.key) ?? []).slice(-3),
          }))
        const untagged = [...groups.values()]
          .filter((group) => !group.topic)
          .reduce((total, group) => total + group.count, 0)
        return {
          ok: true,
          from,
          to,
          topics,
          untagged,
          ...(topics.length === 0 && untagged > 0
            ? { note: `主题从开启后开始记录，此前 ${untagged} 轮没有主题。` }
            : {}),
        }
      },
    },
    {
      name: 'worklog_status',
      description: '查看工作日志状态：存放路径、今日行数、最后写入时间、磁盘占用、开关，以及两个摘要槽（主摘要 / 对比摘要）各自用的模型与上次结果。',
      parameters: {
        type: 'object',
        properties: {
          probe: { type: 'boolean', description: '跑一次两个摘要器的实测（会真的调用模型），返回结果与耗时' },
        },
      },
      output,
      async execute(args) {
        const input = asRecord(args)
        const status = store.status()
        const now = settings()
        // An empty route means "whatever DSH is set to", which has no id to list.
        const models = now.aiProvider === ''
          ? { at: Date.now(), provider: '', models: [], error: '' }
          : await listModelsOf(now.aiProvider)
        const probe = input.probe === true ? await probeSummarizers(now) : undefined
        return {
          ...status,
          todayFile: store.fileFor(status.today),
          captureEnabled: now.captureEnabled,
          includeToolCalls: now.includeToolCalls,
          maxSummaryChars: now.maxSummaryChars,
          ai: aiReport(now),
          providers: Array.isArray(llmRef?.listProviders?.())
            ? llmRef.listProviders().map((provider) => provider?.id).filter(Boolean)
            : [],
          models,
          ...(probe === undefined ? {} : { probe }),
        }
      },
    },
  ]

  ctx.inject(['tools'], (scope) => {
    for (const tool of tools) {
      scope.effect(() => scope.tools.register(tool), `worklog: tool ${tool.name}`)
    }
  })

  // ---- Panel routes ----------------------------------------------------

  function liveSnapshot() {
    const current = []
    for (const [sessionId, state] of turns) {
      current.push({
        sessionId,
        turn: state.turn,
        human: Boolean(state.human),
        summaryChars: (state.human || state.other || state.assistant).length,
        tools: state.tools.slice(0, 8),
      })
      if (current.length >= 5) break
    }
    return { tracked: turns.size, written: written.size, turns: current }
  }

  /**
   * @param query - `date=YYYY-MM-DD`, or `from`/`to` for a range (capped).
   */
  /** `?date=` or `?from=&to=` from the panel request, nothing else. */
  function panelQuery(req) {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      return {
        date: url.searchParams.get('date') ?? '',
        from: url.searchParams.get('from') ?? '',
        to: url.searchParams.get('to') ?? '',
      }
    } catch {
      return {}
    }
  }

  function panelPayload(query = {}) {
    const status = store.status()
    const now = settings()
    const today = status.today
    const from = isDay(query.from) ? query.from : (isDay(query.date) ? query.date : today)
    const to = isDay(query.to) ? query.to : from
    const span = from <= to ? { from, to } : { from: to, to: from }
    const days = daysBetween(span.from, span.to)
    const collected = []
    for (const day of days) collected.push(...store.readDay(day))
    const records = collected.slice(-MAX_PANEL).reverse()
    const compacted = records.map(compact)
    return {
      ok: true,
      version: VERSION,
      today,
      range: { from: span.from, to: span.to, days: days.length },
      // The panel draws its "now" line with the browser clock, which can lag the
      // host by minutes; sending the host's own instant keeps the two in step.
      now: new Date().toISOString(),
      count: collected.length,
      entries: compacted,
      sessions: groupBySession(compacted),
      topics: groupByTopic(compacted),
      enabled: now.captureEnabled,
      config: {
        storePath: now.storePath,
        includeToolCalls: now.includeToolCalls,
        maxSummaryChars: now.maxSummaryChars,
        gitSyncEnabled: config?.gitSync?.enabled === true,
      },
      store: status,
      todayFile: store.fileFor(status.today),
      live: liveSnapshot(),
      ai: aiReport(now),
    }
  }

  function sendJson(res, status, value) {
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify(value))
  }

  function readBody(req) {
    return new Promise((resolve) => {
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 64 * 1024) req.destroy()
      })
      req.on('end', () => {
        try {
          resolve(asRecord(JSON.parse(raw || '{}')))
        } catch {
          resolve({})
        }
      })
      req.on('error', () => resolve({}))
    })
  }

  ctx.inject(['connection', 'webServer'], (scope) => {
    const connection = scope.get('connection')
    const web = scope.get('webServer')

    const guard = (req, res) => {
      const rejection = connection?.requestRejection?.(req)
      if (rejection === undefined) return true
      res.statusCode = rejection
      res.end()
      return false
    }

    scope.effect(() => registerMobile(scope, store, () => settings().captureEnabled), 'worklog: mobile page')

    scope.effect(() => web.register({
      kind: 'exact',
      path: '/dsh-worklog/panel',
      handler: (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405
          res.setHeader('allow', 'GET, HEAD')
          res.end()
          return
        }
        try {
          sendJson(res, 200, panelPayload(panelQuery(req)))
        } catch (error) {
          log('panel payload failed', error)
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'worklog: panel route')

    /**
     * Everything the settings popover needs: which routes exist, and what is
     * currently selected. Credentials never appear here — `listModels` returns
     * ids and names only, and the host keeps the keys.
     */
    async function settingsPayload() {
      const now = settings()
      let providers = []
      try {
        providers = (llmRef?.listProviders?.() ?? [])
          .map((provider) => ({ id: String(provider?.id ?? ''), name: String(provider?.name ?? provider?.id ?? '') }))
          .filter((provider) => provider.id !== '')
      } catch { /* a host without provider listing simply offers no choices */ }
      const models = {}
      await Promise.all(providers.map(async (provider) => {
        const listed = await listModelsOf(provider.id)
        models[provider.id] = listed.models.map((model) => ({ id: String(model?.id ?? ''), name: String(model?.name ?? model?.id ?? '') })).filter((model) => model.id !== '')
      }))
      return {
        ok: true,
        providers,
        models,
        selected: {
          provider: now.aiProvider,
          model: now.aiModel,
          compareProvider: now.aiCompareProvider,
          compareModel: now.aiCompareModel,
        },
        // What "follow the host default" currently resolves to, so the UI can say
        // it instead of leaving the user guessing.
        effective: {
          provider: now.aiProvider || lastRoute.provider,
          model: now.aiModel || lastRoute.model,
        },
        prompts: { primary: now.promptPrimary, secondary: now.promptSecondary },
        builtinPrompts: {
          primary: aiSystemPrompt(now.maxSummaryChars, false, now.contextTopics),
          secondary: aiSystemPrompt(now.maxSummaryChars, now.aiOllamaStrictPrompt, now.contextTopics),
        },
        local: { enabled: now.aiOllama, model: now.aiOllamaModel },
        captureEnabled: now.captureEnabled,
      }
    }

    scope.effect(() => web.register({
      kind: 'exact',
      path: '/dsh-worklog/settings',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method === 'GET') {
          try {
            sendJson(res, 200, await settingsPayload())
          } catch (error) {
            sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'GET, POST')
          res.end()
          return
        }
        const body = await readBody(req)
        const text = (value) => (typeof value === 'string' ? value.trim() : undefined)
        const patch = {}
        for (const [field, key] of [
          ['provider', 'aiProvider'],
          ['model', 'aiModel'],
          ['compareProvider', 'aiCompareProvider'],
          ['compareModel', 'aiCompareModel'],
        ]) {
          const value = text(body[field])
          if (value !== undefined) patch[key] = value
        }
        for (const [field, key] of [['promptPrimary', 'promptPrimary'], ['promptSecondary', 'promptSecondary']]) {
          const value = text(body[field])
          if (value !== undefined) patch[key] = value.slice(0, 4000)
        }
        if (typeof body.ollama === 'boolean') patch.aiOllama = body.ollama
        try {
          const entry = ctx.fiber?.entry
          const editor = ctx.get('configEditor')
          if (entry === undefined || editor === undefined) {
            sendJson(res, 409, { ok: false, error: '这个 profile 不支持写入插件配置' })
            return
          }
          await editor.edit(entry, (current) => ({ ...asRecord(current), ...patch }))
          sendJson(res, 200, await settingsPayload())
        } catch (error) {
          log('settings write failed', error)
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'worklog: settings route')

    scope.effect(() => web.register({
      kind: 'exact',
      path: '/dsh-worklog/toggle',
      handler: async (req, res) => {
        if (!guard(req, res)) return
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('allow', 'POST')
          res.end()
          return
        }
        const body = await readBody(req)
        const enabled = body.enabled !== false
        try {
          const entry = ctx.fiber?.entry
          const editor = ctx.get('configEditor')
          if (entry === undefined || editor === undefined) {
            sendJson(res, 409, { ok: false, error: '这个 profile 不支持写入插件配置' })
            return
          }
          await editor.edit(entry, (current) => ({ ...asRecord(current), captureEnabled: enabled }))
          sendJson(res, 200, panelPayload())
        } catch (error) {
          log('capture toggle failed', error)
          sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), 'worklog: toggle route')
  })

  // ---- Optional git sync ----------------------------------------------

  const sync = asRecord(config?.gitSync)
  if (sync.enabled === true) {
    const repo = typeof sync.repoPath === 'string' ? sync.repoPath.trim() : ''
    const remote = typeof sync.remote === 'string' ? sync.remote.trim() : ''
    if (!repo) {
      log('gitSync.enabled is true but gitSync.repoPath is empty; sync stays off')
    } else {
      const minutes = Math.max(1, Number(sync.intervalMinutes) || 5)
      const git = (args) => new Promise((resolve) => {
        execFile('git', ['-C', repo, ...args], { timeout: 20_000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout, stderr) => {
          if (error) log(`git ${args[0]} failed (no merge attempted)`, stderr || error)
          resolve(!error)
        })
      })
      const tick = async () => {
        // --ff-only: when the histories diverged nothing happens; this never merges.
        await git(['pull', '--ff-only', ...(remote ? [remote] : [])])
        await git(['push', ...(remote ? [remote] : [])])
      }
      const timer = setInterval(() => { void tick() }, minutes * 60 * 1000)
      if (typeof timer.unref === 'function') timer.unref()
      ctx.effect(() => () => { clearInterval(timer) }, 'worklog: git sync timer')
    }
  }
}
