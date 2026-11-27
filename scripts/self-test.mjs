#!/usr/bin/env node
/**
 * Deterministic self-test for the Worklog recorder.
 *
 * Drives `apply()` with a fake context, feeds synthetic session events, and
 * asserts the files on disk. No DSH process and no model call involved.
 *
 *   node scripts/self-test.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderGantt } from '../mobile.js'
import { createStore } from '../lib/store.js'
import { Config, cleanDailyText, coverageGap, dayDigest, aiSystemPrompt, aiUserPrompt, apply, cleanModelText, combineSummary, contextBlock, digest, groupBySession, groupByTopic, normalizeTopicLabel, parseSummaryOutput, projectKey, resolveTopic, sessionFileOf, similarTopicLabel, summarizeWithLlm, summarizeWithOllama } from '../lib/index.js'
import { mobileInternals, registerMobile } from '../lib/mobile.js'

let failures = 0
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'worklog-repo-'))
  execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' })
  writeFileSync(join(dir, 'a.txt'), 'hello\n')
  return dir
}

function makeSession(id, cwd, extra) {
  return {
    id,
    header: { id, cwd, ...extra },
    deriveMessages() {
      return []
    },
  }
}

function fakeContext(options = {}) {
  const listeners = new Map()
  const registrations = { tools: [], routes: [], effects: [], edits: [] }
  const scopeOf = () => ({
    effect(fn) {
      const disposer = fn()
      registrations.effects.push(disposer)
      return () => {}
    },
    on() {
      return () => {}
    },
    llm: options.llm,
    sessionTitle: options.sessionTitle,
    get(name) {
      if (name === 'llm') return options.llm
      if (name === 'sessionTitle') return options.sessionTitle
      if (name === 'connection') return { requestRejection: () => undefined }
      if (name === 'webServer') {
        return {
          register(route) {
            registrations.routes.push(route)
            return () => {}
          },
        }
      }
      return undefined
    },
    tools: {
      register(definition) {
        registrations.tools.push(definition)
        return () => {}
      },
    },
  })
  const ctx = {
    fiber: { entry: { id: 'dsh-worklog' } },
    effect(fn) {
      const disposer = fn()
      registrations.effects.push(disposer)
      return () => {}
    },
    on(event, callback) {
      listeners.set(event, callback)
      return () => {}
    },
    inject(_deps, callback) {
      callback(scopeOf())
    },
    get(name) {
      if (name === 'configEditor') {
        return {
          // The real editor merges into the profile; here we only need to see what
          // the plugin asked to write.
          async edit(_entry, change) {
            const next = change({})
            registrations.edits.push(next)
            return next
          },
        }
      }
      return undefined
    },
  }
  const emit = (event, ...args) => {
    const callback = listeners.get('session/event')
    if (typeof callback === 'function') callback(...args)
  }
  return { ctx, emit, registrations }
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

function readLines(path) {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))
}

function resolveConfig(overrides) {
  const raw = {}
  const keys = ['storePath', 'captureEnabled', 'includeToolCalls', 'maxSummaryChars',
    'aiDeepseek', 'aiProvider', 'aiModel', 'aiCompareProvider', 'aiCompareModel',
    'aiOllama', 'aiOllamaUrl', 'aiOllamaModel', 'aiTimeoutMs',
    'aiOllamaStrictPrompt', 'contextTurns', 'contextTopics', 'contextOllama',
    'promptPrimary', 'promptSecondary']
  for (const key of keys) {
    if (overrides[key] !== undefined) raw[key] = overrides[key]
  }
  return Config(raw)
}

const repo = makeRepo()
const day = (() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})()

function turn(index, text, tools = []) {
  const session = makeSession('session-a', repo)
  const { ctx, emit } = ctxHolder
  emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  emit('turn/start', session, { type: 'turn/start', data: { turn: index } })
  emit('user/message', session, {
    type: 'user/message',
    data: { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } },
  })
  for (const tool of tools) emit('tool/call', session, { type: 'tool/call', data: { name: tool } })
  emit('assistant/message', session, {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: '收到，正在处理。' }] } },
  })
  emit('turn/end', session, { type: 'turn/end', data: { turn: index, reason: { kind: 'completed' } } })
}

// ---- captureEnabled = true ------------------------------------------------
const storeA = mkdtempSync(join(tmpdir(), 'worklog-store-'))
const contextA = fakeContext()
const ctxHolder = { ctx: contextA.ctx, emit: contextA.emit }
apply(contextA.ctx, resolveConfig({ storePath: storeA, captureEnabled: true, includeToolCalls: true, maxSummaryChars: 200, aiDeepseek: false, aiOllama: false }))

console.log('[turn recording]')
{
  turn(1, '帮我看一下构建为什么失败', ['bash'])
  await sleep(500)
  let lines = readLines(join(storeA, `${day}.jsonl`))
  check('turn 1 writes exactly one line', lines.length === 1, `got ${lines.length}`)
  const record = lines[0] ?? {}
  check('kind is turn', record.kind === 'turn', record.kind)
  check('summary pairs the prompt with the reply', record.summary === '问：帮我看一下构建为什么失败；答：收到，正在处理。', record.summary)
  check('tools captured', Array.isArray(record.tools) && record.tools[0] === 'bash', JSON.stringify(record.tools))
  check('files are repository-relative', Array.isArray(record.files) && record.files[0] === 'a.txt', JSON.stringify(record.files))
  check('changed files stay repository-relative', record.files.every((file) => !file.startsWith('/')) && record.files.includes('a.txt'), JSON.stringify(record.files))
  check('only the location fields are absolute', Object.entries(record).every(([key, value]) => key === 'workspace' || key === 'sessionPath' || !JSON.stringify(value).includes(repo)), JSON.stringify(Object.keys(record)))
  check('session id recorded', record.sessionId === 'session-a', record.sessionId)
  check('date matches the day file', record.date === day, record.date)
  check('tags mark a human turn', Array.isArray(record.tags) && record.tags.includes('human'), JSON.stringify(record.tags))

  turn(2, '再把测试跑一遍')
  await sleep(500)
  lines = readLines(join(storeA, `${day}.jsonl`))
  check('turn 2 appends a second line', lines.length === 2, `got ${lines.length}`)
  check('turn 2 summary differs', lines[1]?.summary === '问：再把测试跑一遍；答：收到，正在处理。', lines[1]?.summary)
}

console.log('[duplicate guard]')
{
  const session = makeSession('session-b', repo)
  const { emit } = ctxHolder
  emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  emit('turn/start', session, { type: 'turn/start', data: { turn: 1 } })
  emit('user/message', session, {
    type: 'user/message',
    data: { role: 'user', content: [{ type: 'text', text: '重复的轮次' }], source: { kind: 'user' } },
  })
  emit('turn/end', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  emit('turn/end', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(500)
  const lines = readLines(join(storeA, `${day}.jsonl`))
  check('repeated turn/end writes one line only', lines.length === 3, `got ${lines.length}`)
}

console.log('[subagent sessions are skipped]')
{
  const session = makeSession('session-child', repo, { origin: 'subagent' })
  const { emit } = ctxHolder
  emit('turn/start', session, { type: 'turn/start', data: { turn: 1 } })
  emit('user/message', session, {
    type: 'user/message',
    data: { role: 'user', content: [{ type: 'text', text: '子任务' }], source: { kind: 'user' } },
  })
  emit('turn/end', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(400)
  const lines = readLines(join(storeA, `${day}.jsonl`))
  check('subagent turn is not recorded', lines.length === 3, `got ${lines.length}`)
}

console.log('[turn that started before the plugin loaded]')
{
  const session = makeSession('session-late', repo)
  session.deriveMessages = () => ([
    { role: 'assistant', content: [{ type: 'text', text: '已经修好了。' }], source: { kind: 'model' } },
    { role: 'user', content: [{ type: 'text', text: '插件装好之前的那个问题' }], source: { kind: 'user' } },
  ])
  const { emit } = ctxHolder
  emit('turn/end', session, { type: 'turn/end', data: { turn: 7, reason: { kind: 'completed' } } })
  await sleep(500)
  const lines = readLines(join(storeA, `${day}.jsonl`))
  check('fallback derives the last human prompt', lines.length === 4, `got ${lines.length}`)
  check('fallback pairs the last prompt with the last reply', lines[3]?.summary === '问：插件装好之前的那个问题；答：已经修好了。', lines[3]?.summary)
}

console.log('[captureEnabled = false]')
{
  const storeB = mkdtempSync(join(tmpdir(), 'worklog-store-off-'))
  const contextB = fakeContext()
  apply(contextB.ctx, resolveConfig({ storePath: storeB, captureEnabled: false, includeToolCalls: true, maxSummaryChars: 200, aiDeepseek: false, aiOllama: false }))
  const session = makeSession('session-off', repo)
  contextB.emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextB.emit('turn/start', session, { type: 'turn/start', data: { turn: 1 } })
  contextB.emit('user/message', session, {
    type: 'user/message',
    data: { role: 'user', content: [{ type: 'text', text: '关掉之后不该写' }], source: { kind: 'user' } },
  })
  contextB.emit('turn/end', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(500)
  check('nothing written while capture is off', readLines(join(storeB, `${day}.jsonl`)).length === 0)
}

console.log('[summary truncation]')
{
  const storeC = mkdtempSync(join(tmpdir(), 'worklog-store-clip-'))
  const contextC = fakeContext()
  apply(contextC.ctx, resolveConfig({ storePath: storeC, captureEnabled: true, includeToolCalls: false, maxSummaryChars: 40, aiDeepseek: false, aiOllama: false }))
  const session = makeSession('session-clip', repo)
  const long = '这是一段非常长的输入'.repeat(40)
  contextC.emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextC.emit('turn/start', session, { type: 'turn/start', data: { turn: 1 } })
  contextC.emit('user/message', session, {
    type: 'user/message',
    data: { role: 'user', content: [{ type: 'text', text: long }], source: { kind: 'user' } },
  })
  contextC.emit('tool/call', session, { type: 'tool/call', data: { name: 'bash' } })
  contextC.emit('turn/end', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(500)
  const record = readLines(join(storeC, `${day}.jsonl`))[0] ?? {}
  check('summary length respects maxSummaryChars', typeof record.summary === 'string' && [...record.summary].length <= 40, String(record.summary?.length))
  check('includeToolCalls=false leaves tools empty', Array.isArray(record.tools) && record.tools.length === 0, JSON.stringify(record.tools))
}

console.log('[zero-cost digest]')
{
  const goalRound = `<goal_round>
Objective: "为 DSH 交付并逐条实测「工作日志」插件 dsh-worklog 0.1.0：已装到 desktop profile（applied/active）。接下来利用目标轮次跨真实对话边界取证，然后输出交付报告。"
Round: 2/3

Continue working toward the objective in this same session. Treat the current workspace, tool results, and durable session state as authoritative.

Follow the configured goal-tool policy before reporting a blocker.
</goal_round>`
  const goal = digest(goalRound, 200)
  check('goal wrapper is unwrapped', !goal.includes('<goal_round') && !goal.includes('Objective:'), goal)
  check('goal digest starts with the objective', goal.startsWith('为 DSH 交付并逐条实测'), goal)
  check('goal digest is one sentence', goal.endsWith('。'), goal)
  check('Round/Continue boilerplate is dropped', !/Round:|Continue working/.test(goal), goal)

  const reminder = '<system-reminder>\nThe following information describes your current session: cwd=/x\n</system-reminder>'
  check('system-reminder digest is empty', digest(reminder, 200) === '', digest(reminder, 200))

  const banner = '【工作日志】# 任务：为 DSH 做一个「工作日志」插件（自动记忆，不需要人工确认）'
  check('banner label and field are stripped', digest(banner, 200) === '为 DSH 做一个「工作日志」插件（自动记忆，不需要人工确认）', digest(banner, 200))

  check('markdown heading and number are stripped', digest('## 0. 先读事实，不要凭记忆写代码', 200) === '先读事实，不要凭记忆写代码', digest('## 0. 先读事实，不要凭记忆写代码', 200))
  check('field + quotes are unwrapped', digest('Objective: "短目标"', 200) === '短目标', digest('Objective: "短目标"', 200))
  check('first sentence wins over the rest', digest('这一轮把插件装好并跑通了自检。第二句不该出现。', 200) === '这一轮把插件装好并跑通了自检。', digest('这一轮把插件装好并跑通了自检。第二句不该出现。', 200))
  check('short lead-in accumulates the next sentence', digest('好的。把测试跑一遍再交付。', 32) === '好的。把测试跑一遍再交付。', digest('好的。把测试跑一遍再交付。', 32))
  check('digest respects the cap', digest('这是一段很长的输入'.repeat(30), 40).length <= 40, String(digest('这是一段很长的输入'.repeat(30), 40).length))
  check('blank input yields nothing', digest('   \n\n  ', 200) === '', digest('   \n\n  ', 200))

  const both = combineSummary(banner, '插件已经装好，两个摘要器都在跑。', 200)
  check('summary carries the question and the answer', both.startsWith('问：为 DSH 做一个') && both.includes('；答：插件已经装好'), both)
  check('question-only summary keeps no empty 答 part', combineSummary(banner, '', 200) === '为 DSH 做一个「工作日志」插件（自动记忆，不需要人工确认）', combineSummary(banner, '', 200))
  check('answer-only summary keeps no empty 问 part', combineSummary(reminder, '这轮只回了话，没有用户文本。', 200) === '这轮只回了话，没有用户文本。', combineSummary(reminder, '这轮只回了话，没有用户文本。', 200))
  check('combined summary respects the cap', [...both].length <= 200, String(both.length))
  check('boilerplate-only turn yields nothing', combineSummary(reminder, reminder, 200) === '', combineSummary(reminder, reminder, 200))
}

console.log('[ai summaries]')
{
  check('model answer is trimmed to one line', cleanModelText('  "修好了构建失败的问题。"  \n（解释…）', 200) === '修好了构建失败的问题。', cleanModelText('  "修好了构建失败的问题。"  \n（解释…）', 200))
  check('model prefix is stripped', cleanModelText('摘要：装好了工作日志插件', 200) === '装好了工作日志插件', cleanModelText('摘要：装好了工作日志插件', 200))
  check('empty model answer is noise', cleanModelText('   ', 200) === '')
  check('too-short model answer is noise', cleanModelText('好', 200) === '')

  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => ({ message: { content: '这一轮把工作日志插件改成本地模型摘要。' } }) }
  }
  const ollamaText = await summarizeWithOllama({
    baseUrl: 'http://127.0.0.1:11434/', model: 'qwen3.5:9b-q4_K_M',
    system: 'sys', input: 'in', timeoutMs: 5000, fetchImpl: fakeFetch,
  })
  check('ollama returns the message content', ollamaText.includes('本地模型摘要'), ollamaText)
  check('ollama posts to /api/chat', calls[0]?.url === 'http://127.0.0.1:11434/api/chat', calls[0]?.url)
  check('ollama disables thinking', calls[0]?.body.think === false, JSON.stringify(calls[0]?.body.think))
  check('ollama sends system + user messages', calls[0]?.body.messages?.length === 2, JSON.stringify(calls[0]?.body.messages?.length))

  let ollamaError = ''
  try {
    await summarizeWithOllama({ baseUrl: 'http://127.0.0.1:11434', model: 'm', system: 's', input: 'i', timeoutMs: 1000, fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) })
  } catch (error) { ollamaError = error.message }
  check('ollama failure surfaces', ollamaError.includes('503'), ollamaError)

  let llmSeen
  const llmStub = {
    stream(options) {
      llmSeen = options
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '这一轮把' }
        yield { type: 'text-delta', index: 0, text: '两个摘要器接上了。' }
        yield { type: 'finish', reason: 'stop' }
      })()
    },
  }
  const llmText = await summarizeWithLlm(llmStub, { provider: 'deepseek-account', model: 'deepseek-flash', system: 'sys', input: 'in', timeoutMs: 5000, sessionId: 'session-x' })
  check('llm text deltas are concatenated', llmText === '这一轮把两个摘要器接上了。', llmText)
  check('llm route is forwarded', llmSeen?.provider === 'deepseek-account' && llmSeen?.model === 'deepseek-flash', JSON.stringify({ provider: llmSeen?.provider, model: llmSeen?.model }))

  let llmError = ''
  try {
    await summarizeWithLlm(undefined, { provider: 'p', model: 'm', system: 's', input: 'i', timeoutMs: 1000 })
  } catch (error) { llmError = error.message }
  check('missing llm service is reported', llmError.includes('unavailable'), llmError)

  const strict = aiSystemPrompt(200, true)
  check('strict prompt demands a concrete noun', strict.includes('可核查的具体名词'), strict.slice(0, 40))
  check('strict prompt bans vague verbs', strict.includes('禁止空泛动词'), '')
  check('strict prompt sizes to the budget', strict.includes('90-130'), strict.split('\n')[3])
  check('plain prompt stays short', aiSystemPrompt(200, false).split('\n').length === 3)
}

console.log('[summariser context]')
{
  check('no context yields no background block', contextBlock(undefined) === '' && contextBlock({ topics: [], recent: [] }) === '')
  const block = contextBlock({
    topics: [
      { id: 't1', label: '中航信客户调研', count: 3, gist: '问卷与公开资料交叉验证' },
      { id: 't2', label: '客座率口径治理', count: 2, gist: '拆成业务A/业务B动态属性' },
    ],
    recent: [{ summary: '第一轮接上了双模型' }, { summary: '第二轮修好了面板' }],
  })
  check('background block lists the topics with ids', block.includes('t1 中航信客户调研（3 轮）：问卷与公开资料交叉验证') && block.includes('t2 客座率口径治理（2 轮）'), block.split('\n').slice(1, 4).join(' | '))
  check('background block numbers the earlier summaries', block.includes('【最近几轮】') && block.includes('1. 第一轮接上了双模型') && block.includes('2. 第二轮修好了面板'), '')
  check('background block keeps the three-part requirement', block.includes('用户这一次要什么、这一轮做了什么、结果或状态'), '')
  check('background block asks for concrete nouns', block.includes('文件名、字段名、接口名、命令、数字'), '')
  check('background block forbids restating the earlier lines', block.includes('前文已经有的事不要重复描述'), '')
  check('background block forbids importing earlier work', block.includes('前文里本轮没有做的事，不要写进本轮摘要'), '')
  check('prompt without context keeps the two-line shape', aiUserPrompt('问题', '回答') === '【用户】问题\n【助手】回答', aiUserPrompt('问题', '回答'))
  check('prompt with context opens with the background', aiUserPrompt('问题', '回答', { topics: [], recent: [{ summary: '前一轮' }] }).startsWith('【前文】'), '')

  const two = parseSummaryOutput('把客座率拆成两个动态属性。\n主题：t2', 200)
  check('two-line answer splits into summary and topic', two.summary === '把客座率拆成两个动态属性。' && two.topicToken === 't2', JSON.stringify(two))
  const one = parseSummaryOutput('只写了一行摘要。', 200)
  check('single-line answer leaves the topic empty', one.summary === '只写了一行摘要。' && one.topicToken === '', JSON.stringify(one))
  const labelled = parseSummaryOutput('摘要：这一轮改了提示词。\n主题：新 提示词改造', 200)
  check('labelled summary is accepted', labelled.summary === '这一轮改了提示词。' && labelled.topicToken === '新 提示词改造', JSON.stringify(labelled))
  const english = parseSummaryOutput('Reworked the prompt.\nTopic: t1', 200)
  check('English topic label is accepted', english.topicToken === 't1', JSON.stringify(english))

  const topics = [{ id: 't1', label: '中航信客户调研' }, { id: 't2', label: '客座率口径治理' }]
  check('a known id is kept', resolveTopic('t2', topics, 't1')?.id === 't2', JSON.stringify(resolveTopic('t2', topics, 't1')))
  check('an id with trailing text still resolves', resolveTopic('t2 客座率口径治理', topics, 't1')?.id === 't2', '')
  check('a raw label is not a new id', resolveTopic('t1', [{ id: 't1', label: 'X' }], '')?.id === 't1', '')
  check('a matching label reuses the existing topic', resolveTopic('客座率口径治理', topics, '')?.id === 't2', JSON.stringify(resolveTopic('客座率口径治理', topics, '')))
  check('the same label with different spacing still matches', resolveTopic('客座率 口径-治理', topics, '')?.id === 't2', JSON.stringify(resolveTopic('客座率 口径-治理', topics, '')))
  check('an explicit new topic gets a label', resolveTopic('新 中航信POC问答搭建', topics, 't2')?.label === '中航信POC问答搭建', JSON.stringify(resolveTopic('新 中航信POC问答搭建', topics, 't2')))
  check('an unknown id falls through to a new label', resolveTopic('t9 客户走访', topics, 't2')?.label === '客户走访', JSON.stringify(resolveTopic('t9 客户走访', topics, 't2')))
  check('a hallucinated id alone keeps the current topic', resolveTopic('t9', topics, 't2')?.id === 't2', JSON.stringify(resolveTopic('t9', topics, 't2')))
  check('a refusal keeps the current topic', resolveTopic('不确定', topics, 't1')?.id === 't1', JSON.stringify(resolveTopic('不确定', topics, 't1')))
  check('an empty answer keeps the current topic', resolveTopic('', topics, 't1')?.id === 't1', '')
  check('quoted subject is unwrapped', resolveTopic('新“客户走访”', topics, '')?.label === '客户走访', JSON.stringify(resolveTopic('新“客户走访”', topics, '')))
  check('topic labels normalise punctuation away', normalizeTopicLabel('客座率，口径-治理 Ab') === '客座率口径治理ab' || normalizeTopicLabel('客座率，口径-治理 Ab') === '客座率口径治理ab', normalizeTopicLabel('客座率，口径-治理 Ab'))
  check('topic request is opt-in', !aiSystemPrompt(200, false).includes('主题：') && aiSystemPrompt(200, false, true).includes('主题：'))
  check('strict prompt also carries the topic rule', aiSystemPrompt(200, true, true).includes('主题：'), '')
  check('topic prompt explains reuse and creation', aiSystemPrompt(200, false, true).includes('只写它的 id') && aiSystemPrompt(200, false, true).includes('新 <不超过 12 字的中文标签>'), '')
}

console.log('[topic grouping]')
{
  const grouped = groupByTopic([
    { ts: '2026-11-26T09:00:00Z', sessionId: 's-a', topicId: 't1', topic: '客座率口径治理', sessionTitle: '会话A' },
    { ts: '2026-11-26T10:00:00Z', sessionId: 's-b', topicId: 't3', topic: '客座率 口径-治理', sessionTitle: '会话B' },
    { ts: '2026-11-26T11:00:00Z', sessionId: 's-a', topicId: 't2', topic: '插件移动端', sessionTitle: '会话A' },
    { ts: '2026-11-26T08:00:00Z', sessionId: 's-a', sessionTitle: '会话A' },
    { ts: '2026-11-26T07:00:00Z', sessionId: 's-c', sessionTitle: '会话C' },
  ])
  const byTopic = grouped.filter((group) => group.topic)
  check('the same topic in two sessions lands in one group', byTopic.length === 2, JSON.stringify(grouped.map((group) => group.topic)))
  const merged = byTopic.find((group) => group.topic.startsWith('客座率'))
  check('a merged topic counts every turn', merged?.count === 2, JSON.stringify(merged?.count))
  check('a merged topic lists both sessions', merged?.sessions.length === 2, JSON.stringify(merged?.sessions))
  check('untagged records stay split per session', grouped.filter((group) => !group.topic).length === 2, JSON.stringify(grouped.filter((group) => !group.topic).length))
  check('untagged groups sort last', grouped[0]?.topic !== '' && grouped.at(-1)?.topic === '', JSON.stringify(grouped.map((group) => group.topic || '(none)')))

  const untaggedOnly = groupByTopic([{ ts: '2026-11-26T08:00:00Z', sessionId: 's-a', sessionTitle: '会话A' }])
  check('a day without topics keeps its session name', untaggedOnly.length === 1 && untaggedOnly[0].sessions[0].sessionTitle === '会话A', JSON.stringify(untaggedOnly))
}

console.log('[ai capture end to end]')
{
  const originalFetch = globalThis.fetch
  const storeD = mkdtempSync(join(tmpdir(), 'worklog-store-ai-'))
  const llmStub = {
    stream() {
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: '把工作日志插件接上了两个摘要器。' }
      })()
    },
  }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ message: { content: '本地模型认为这一轮在改插件。' } }) })
  const contextD = fakeContext({ llm: llmStub })
  apply(contextD.ctx, resolveConfig({ storePath: storeD, captureEnabled: true, aiDeepseek: true, aiOllama: true, maxSummaryChars: 200 }))
  const sessionD = makeSession('session-ai', repo)
  contextD.emit('model/selection', sessionD, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextD.emit('turn/start', sessionD, { type: 'turn/start', data: { turn: 1 } })
  contextD.emit('user/message', sessionD, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '把摘要改成两个模型都跑一遍' }], source: { kind: 'user' } } })
  contextD.emit('assistant/message', sessionD, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '两个都接上了。' }] } } })
  contextD.emit('turn/end', sessionD, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(700)
  const record = readLines(join(storeD, `${day}.jsonl`))[0] ?? {}
  check('both slots are stored', record.summaries?.primary === '把工作日志插件接上了两个摘要器。' && record.summaries?.secondary === '本地模型认为这一轮在改插件。', JSON.stringify(record.summaries))
  check('the primary slot is the stored summary', record.summary === '把工作日志插件接上了两个摘要器。', record.summary)
  check('summaryBy names the slot', record.summaryBy === 'primary', record.summaryBy)
  check('models are labelled on the record', record.summaryLabels?.secondary === 'qwen3.5:9b-q4_K_M', JSON.stringify(record.summaryLabels))
  check('ai tag is added', Array.isArray(record.tags) && record.tags.includes('ai'), JSON.stringify(record.tags))
  check('final answer is recorded next to the question', record.answer === '两个都接上了。', record.answer)

  const storeE = mkdtempSync(join(tmpdir(), 'worklog-store-aifail-'))
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  const contextE = fakeContext({ llm: { stream() { throw new Error('boom') } } })
  apply(contextE.ctx, resolveConfig({ storePath: storeE, captureEnabled: true, aiDeepseek: true, aiOllama: true, maxSummaryChars: 200 }))
  const sessionE = makeSession('session-ai-fail', repo)
  contextE.emit('model/selection', sessionE, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextE.emit('turn/start', sessionE, { type: 'turn/start', data: { turn: 1 } })
  contextE.emit('user/message', sessionE, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '两个模型都挂掉时要有兜底' }], source: { kind: 'user' } } })
  contextE.emit('turn/end', sessionE, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(700)
  const failed = readLines(join(storeE, `${day}.jsonl`))[0] ?? {}
  check('failed models fall back to the digest', failed.summaryBy === 'digest' && failed.summary === '两个模型都挂掉时要有兜底', JSON.stringify({ by: failed.summaryBy, summary: failed.summary }))
  check('failed run stores no summaries', failed.summaries === undefined, JSON.stringify(failed.summaries))
  globalThis.fetch = originalFetch
}

console.log('[topics across turns]')
{
  const originalFetch = globalThis.fetch
  const storeF = mkdtempSync(join(tmpdir(), 'worklog-store-ctx-'))
  const calls = []
  /** Each call answers with the next scripted topic so the sequence is asserted, not guessed. */
  const script = ['新 插件A改造', 't1', 't1', '新 插件B改造', 't1', '新 别的项目', 't1', 't1']
  const llmStub = {
    stream(request) {
      calls.push(request.messages[0].content[0].text)
      const topic = script[calls.length - 1] ?? 't1'
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: `第${calls.length}轮改了点东西。` }
        yield { type: 'text-delta', index: 0, text: `\n主题：${topic}` }
      })()
    },
  }
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  const contextF = fakeContext({ llm: llmStub })
  apply(contextF.ctx, resolveConfig({
    storePath: storeF, captureEnabled: true, aiDeepseek: true, aiOllama: false,
    maxSummaryChars: 200, contextTurns: 3, contextTopics: true,
  }))
  const run = async (session, index, text, reason = 'completed') => {
    contextF.emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
    contextF.emit('turn/start', session, { type: 'turn/start', data: { turn: index } })
    contextF.emit('user/message', session, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } } })
    contextF.emit('assistant/message', session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '好。' }] } } })
    contextF.emit('turn/end', session, { type: 'turn/end', data: { turn: index, reason: { kind: reason } } })
    await sleep(400)
  }
  const sessionF = makeSession('session-ctx', repo)
  for (const index of [1, 2, 3, 4, 5]) await run(sessionF, index, `第${index}轮`)

  check('the first turn of a session carries no background', !calls[0]?.includes('【前文】'), (calls[0] ?? '').slice(0, 40))
  const rowsF = readLines(join(storeF, `${day}.jsonl`))
  check('a new topic mints t1 and stores its label', rowsF[0]?.topicId === 't1' && rowsF[0]?.topic === '插件A改造', JSON.stringify({ id: rowsF[0]?.topicId, topic: rowsF[0]?.topic }))
  check('reusing an id keeps the topic', rowsF[1]?.topicId === 't1' && rowsF[2]?.topicId === 't1', `${rowsF[1]?.topicId}/${rowsF[2]?.topicId}`)
  check('a second new topic mints t2', rowsF[3]?.topicId === 't2' && rowsF[3]?.topic === '插件B改造', JSON.stringify({ id: rowsF[3]?.topicId, topic: rowsF[3]?.topic }))
  check('switching back to an earlier topic keeps its id', rowsF[4]?.topicId === 't1' && rowsF[4]?.topic === '插件A改造', JSON.stringify({ id: rowsF[4]?.topicId, topic: rowsF[4]?.topic }))
  check('the topic list reaches the next prompt', calls[1]?.includes('t1 插件A改造'), '')
  check('both topics are offered once they exist', calls[4]?.includes('t1 插件A改造') && calls[4]?.includes('t2 插件B改造'), (calls[4] ?? '').split('\n').slice(0, 4).join(' | '))
  const recentSection = (calls[4] ?? '').split('【最近几轮】')[1] ?? ''
  check('the window keeps only the last three summaries', recentSection.includes('第2轮改了点东西。') && recentSection.includes('第4轮改了点东西。') && !recentSection.includes('第1轮改了点东西。'), recentSection.split('\n').slice(0, 5).join(' | '))

  const sessionOther = makeSession('session-other-ctx', repo)
  await run(sessionOther, 1, '另一个会话')
  check('another session starts without the first session topics', !calls[5]?.includes('插件A改造'), (calls[5] ?? '').slice(0, 40))
  const otherRows = readLines(join(storeF, `${day}.jsonl`)).filter((row) => row.sessionId === 'session-other-ctx')
  check('topic ids are per session, both start at t1', otherRows[0]?.topicId === 't1', String(otherRows[0]?.topicId))

  await run(sessionF, 6, '第六轮', 'error')
  await run(sessionF, 7, '第七轮')
  check('a failed turn is not used as background', !calls[7]?.includes('第6轮改了点东西。'), (calls[7] ?? '').split('\n').slice(0, 6).join(' | '))
  globalThis.fetch = originalFetch
}

console.log('[local model context switch]')
{
  const originalFetch = globalThis.fetch
  const bodies = []
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    return { ok: true, status: 200, json: async () => ({ message: { content: '本地模型摘要。' } }) }
  }
  const llmStub = {
    stream() {
      return (async function* () {
        yield { type: 'text-delta', index: 0, text: 'DeepSeek 摘要。' }
        yield { type: 'text-delta', index: 0, text: '\n主线：会话主线。' }
      })()
    },
  }
  const drive = async (storePath, extra) => {
    const holder = fakeContext({ llm: llmStub })
    apply(holder.ctx, resolveConfig({ storePath, captureEnabled: true, aiDeepseek: true, aiOllama: true, maxSummaryChars: 200, contextTurns: 3, contextThread: true, ...extra }))
    const session = makeSession(`session-${storePath.slice(-6)}`, repo)
    for (const index of [1, 2]) {
      holder.emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
      holder.emit('turn/start', session, { type: 'turn/start', data: { turn: index } })
      holder.emit('user/message', session, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: `第${index}轮问` }], source: { kind: 'user' } } })
      holder.emit('assistant/message', session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '答' }] } } })
      holder.emit('turn/end', session, { type: 'turn/end', data: { turn: index, reason: { kind: 'completed' } } })
      await sleep(400)
    }
  }

  bodies.length = 0
  await drive(mkdtempSync(join(tmpdir(), 'worklog-store-lctx-off-')), { contextOllama: false })
  const offUser = bodies.at(-1)?.messages?.at(-1)?.content ?? ''
  check('the local model gets no background by default', !offUser.includes('【前文】'), offUser.slice(0, 30))
  const offSystem = JSON.stringify(bodies.at(-1)?.messages?.[0] ?? {})
  check('the local model is still asked for a topic without the background', offSystem.includes('主题：') && !offUser.includes('【前文】'), offSystem.slice(0, 60))

  bodies.length = 0
  await drive(mkdtempSync(join(tmpdir(), 'worklog-store-lctx-on-')), { contextOllama: true })
  const onUser = bodies.at(-1)?.messages?.at(-1)?.content ?? ''
  check('contextOllama opts the local model in', onUser.includes('【前文】') && onUser.includes('DeepSeek 摘要。'), onUser.slice(0, 60))
  globalThis.fetch = originalFetch
}

console.log('[session context]')
{
  const groups = groupBySession([
    { ts: '2026-11-26T10:00:05.000Z', sessionId: 's-a', sessionTitle: '工作日志改造' },
    { ts: '2026-11-26T09:59:00.000Z', sessionId: 's-b', sessionTitle: '另一个会话' },
    { ts: '2026-11-26T09:58:00.000Z', sessionId: 's-a' },
    { ts: '2026-11-26T09:57:00.000Z', sessionId: '', sessionTitle: '' },
  ])
  check('records split into one group per session', groups.length === 3, JSON.stringify(groups.map((group) => group.sessionId)))
  const first = groups[0] ?? {}
  check('newest session comes first', first.sessionId === 's-a', first.sessionId)
  check('group counts its records', first.count === 2, String(first.count))
  check('group keeps the time range', first.from === '2026-11-26T09:58:00.000Z' && first.to === '2026-11-26T10:00:05.000Z', `${first.from} -> ${first.to}`)
  check('group carries the session title', first.sessionTitle === '工作日志改造', first.sessionTitle)

  const located = groupBySession([
    { ts: '2026-11-26T10:00:00.000Z', sessionId: 's-a', sessionTitle: '标题', workspace: '/srv/example/proj', sessionPath: '/srv/example/.dsh/sessions/--srv-example-proj--/s-a/session.v4.jsonl.zstd' },
    { ts: '2026-11-26T09:00:00.000Z', sessionId: 's-a' },
  ])[0]
  check('group keeps the workspace', located.workspace === '/srv/example/proj', located.workspace)
  check('group keeps the real session file', located.sessionPath.endsWith('session.v4.jsonl.zstd'), located.sessionPath)
  check('project key matches the persistence layout', projectKey('/srv/example/repo') === '--srv-example-repo--', projectKey('/srv/example/repo'))
  check('project key keeps tmp readable', projectKey('/tmp') === '--tmp--', projectKey('/tmp'))

  const fakeHome = mkdtempSync(join(tmpdir(), 'worklog-dsh-'))
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = fakeHome
  const locatedCwd = '/srv/example/proj'
  const locatedDir = join(fakeHome, 'sessions', projectKey(locatedCwd), 'session-fake')
  mkdirSync(locatedDir, { recursive: true })
  writeFileSync(join(locatedDir, 'session.v4.jsonl.zstd'), 'x')
  check('session file is resolved on disk', sessionFileOf({ id: 'session-fake', header: { cwd: locatedCwd } }) === join(locatedDir, 'session.v4.jsonl.zstd'), sessionFileOf({ id: 'session-fake', header: { cwd: locatedCwd } }))
  check('a missing session file is not invented', sessionFileOf({ id: 'session-other', header: { cwd: locatedCwd } }) === '', sessionFileOf({ id: 'session-other', header: { cwd: locatedCwd } }))
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome

  const storeF = mkdtempSync(join(tmpdir(), 'worklog-store-session-'))
  const contextF = fakeContext()
  apply(contextF.ctx, resolveConfig({ storePath: storeF, captureEnabled: true, aiDeepseek: false, aiOllama: false }))
  const named = makeSession('session-named', repo)
  contextF.emit('session/title', named, { type: 'session/title', data: { title: '修摘要与分组' } })
  contextF.emit('model/selection', named, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextF.emit('turn/start', named, { type: 'turn/start', data: { turn: 1 } })
  contextF.emit('user/message', named, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '把工作日志按会话分开' }], source: { kind: 'user' } } })
  contextF.emit('turn/end', named, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })

  const untitled = makeSession('session-untitled', repo)
  contextF.emit('model/selection', untitled, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextF.emit('turn/start', untitled, { type: 'turn/start', data: { turn: 1 } })
  contextF.emit('user/message', untitled, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '没标题的会话也要有上下文' }], source: { kind: 'user' } } })
  contextF.emit('turn/end', untitled, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(600)

  const rows = readLines(join(storeF, `${day}.jsonl`))
  check('record carries the session title', rows[0]?.sessionTitle === '修摘要与分组', rows[0]?.sessionTitle)
  check('untitled session falls back to its first prompt', rows[1]?.sessionTitle === '没标题的会话也要有上下文', rows[1]?.sessionTitle)
  check('record carries the workspace', rows[0]?.workspace === repo, rows[0]?.workspace)

  const storeG = mkdtempSync(join(tmpdir(), 'worklog-store-titled-'))
  const contextG = fakeContext({ sessionTitle: { get: () => ({ title: '标题来自服务' }) } })
  apply(contextG.ctx, resolveConfig({ storePath: storeG, captureEnabled: true, aiDeepseek: false, aiOllama: false }))
  const titled = makeSession('session-svc', repo)
  contextG.emit('model/selection', titled, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  contextG.emit('turn/start', titled, { type: 'turn/start', data: { turn: 1 } })
  contextG.emit('user/message', titled, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '这一轮开始时插件已经加载' }], source: { kind: 'user' } } })
  contextG.emit('turn/end', titled, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(500)
  const svcRow = readLines(join(storeG, `${day}.jsonl`))[0] ?? {}
  check('title service covers sessions titled before load', svcRow.sessionTitle === '标题来自服务', svcRow.sessionTitle)
  check('unmaterialized session leaves sessionPath empty', rows[0]?.sessionPath === undefined, String(rows[0]?.sessionPath))
  check('each record still carries its session id', rows[0]?.sessionId === 'session-named' && rows[1]?.sessionId === 'session-untitled', `${rows[0]?.sessionId} / ${rows[1]?.sessionId}`)
}

console.log('[tools]')
{
  const { registrations } = contextA
  const names = registrations.tools.map((tool) => tool.name).sort()
  check('seven tools registered', names.length === 7, names.join(','))
  check('tool names', names.join(',') === 'worklog_append,worklog_daily,worklog_search,worklog_status,worklog_today,worklog_topic_edit,worklog_topics', names.join(','))
  const byName = Object.fromEntries(registrations.tools.map((tool) => [tool.name, tool]))
  for (const tool of registrations.tools) {
    check(`${tool.name} declares object parameters`, tool.parameters?.type === 'object')
    check(`${tool.name} declares an output renderer`, typeof tool.output?.render === 'function')
  }

  const today = await byName.worklog_today.execute({ kind: 'turn' })
  check('worklog_today counts today', today.count === 4, JSON.stringify(today.count))
  check('worklog_today filters note out', today.entries.every((entry) => entry.kind === 'turn'))
  check('worklog_today summarises sessions', Array.isArray(today.sessions) && today.sessions.length === 3, JSON.stringify(today.sessions?.map((group) => group.sessionId)))

  const appended = await byName.worklog_append.execute({ summary: '手动记一条：验证 append', tags: ['test'] })
  check('worklog_append writes', appended.ok === true && appended.countToday === 5, JSON.stringify(appended))

  const note = await byName.worklog_today.execute({ kind: 'note' })
  check('appended note is readable', note.count === 1 && note.entries[0].summary.includes('验证 append'), JSON.stringify(note.count))

  const found = await byName.worklog_search.execute({ query: '构建' })
  check('worklog_search matches Chinese substring', found.count >= 1, JSON.stringify(found.count))
  const empty = await byName.worklog_search.execute({ query: '不存在的关键词xyz' })
  check('worklog_search returns nothing for a miss', empty.count === 0, JSON.stringify(empty.count))

  const topics = await byName.worklog_topics.execute({})
  check('worklog_topics answers with a topic list', topics.ok === true && Array.isArray(topics.topics), JSON.stringify(topics.topics?.length))
  check('worklog_topics reports the untagged turns', topics.untagged > 0, JSON.stringify(topics.untagged))
  check('worklog_topics explains why the list is empty', topics.topics.length === 0 && typeof topics.note === 'string' && topics.note.includes('没有主题'), JSON.stringify(topics.note))

  const status = await byName.worklog_status.execute({})
  check('worklog_status reports the store path', status.storePath === storeA, status.storePath)
  check('worklog_status counts today', status.todayLines === 5, JSON.stringify(status.todayLines))
  check('worklog_status reports bytes', status.totalBytes > 0, JSON.stringify(status.totalBytes))
  check('worklog_status exposes the switch', status.captureEnabled === true, String(status.captureEnabled))
}

console.log('[custom prompt]')
{
  const originalFetch = globalThis.fetch
  const systems = []
  const llmStub = {
    stream(request) {
      systems.push(request.system || '')
      return (async function* () { yield { type: 'text-delta', index: 0, text: '自定义提示词跑出来了。' } })()
    },
  }
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  const storeP = mkdtempSync(join(tmpdir(), 'worklog-store-prompt-'))
  const ctxP = fakeContext({ llm: llmStub })
  apply(ctxP.ctx, resolveConfig({
    storePath: storeP, captureEnabled: true, aiDeepseek: true, aiOllama: false,
    maxSummaries: 200, maxSummaryChars: 200, contextTopics: true,
    promptPrimary: '你只用一句话写清这一轮改了什么。',
  }))
  const session = makeSession('session-prompt', repo)
  ctxP.emit('model/selection', session, { type: 'model/selection', data: { provider: 'deepseek-account', model: 'deepseek-flash' } })
  ctxP.emit('turn/start', session, { type: 'turn/start', data: { turn: 1 } })
  ctxP.emit('user/message', session, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: '试试自定义提示词' }], source: { kind: 'user' } } })
  ctxP.emit('turn/end', session, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } })
  await sleep(600)
  const system = systems.at(-1) ?? ''
  check('a custom prompt replaces the built-in one', system.startsWith('你只用一句话写清这一轮改了什么。'), system.slice(0, 40))
  check('a custom prompt keeps the topic contract', system.includes('主题：'), system.slice(-60))
  check('the custom prompt turn is recorded', readLines(join(storeP, `${day}.jsonl`)).length === 1)
  globalThis.fetch = originalFetch
}

console.log('[archived sessions]')
{
  // The filter reads DSH's workspace store; a missing or broken file must not hide
  // anything, and an archived id must disappear from every read path.
  const home = mkdtempSync(join(tmpdir(), 'worklog-dsh-home-'))
  const storeDir = join(home, 'storages')
  mkdirSync(storeDir, { recursive: true })
  const savedHome = process.env.DSH_HOME
  process.env.DSH_HOME = home

  const storeA2 = mkdtempSync(join(tmpdir(), 'worklog-store-arch-'))
  const ctxA2 = fakeContext()
  apply(ctxA2.ctx, resolveConfig({ storePath: storeA2, captureEnabled: true, aiDeepseek: false, aiOllama: false }))
  const keep = makeSession('session-keep', repo)
  const drop = makeSession('session-drop', repo)
  for (const [session, index] of [[keep, 1], [drop, 2]]) {
    ctxA2.emit('turn/start', session, { type: 'turn/start', data: { turn: index } })
    ctxA2.emit('user/message', session, { type: 'user/message', data: { role: 'user', content: [{ type: 'text', text: `第${index}轮` }], source: { kind: 'user' } } })
    ctxA2.emit('turn/end', session, { type: 'turn/end', data: { turn: index, reason: { kind: 'completed' } } })
    await sleep(400)
  }
  const route = ctxA2.registrations.routes.find((item) => item.path === '/dsh-worklog/panel')
  const call = () => {
    const response = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
    route.handler({ method: 'GET', url: '/dsh-worklog/panel' }, response)
    return JSON.parse(response.body)
  }
  const before = call()
  check('both sessions show before archiving', before.entries.length === 2, JSON.stringify(before.entries?.length))

  writeFileSync(join(storeDir, 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: ['session-drop'] } }))
  const after = call()
  check('an archived session disappears from the panel', after.entries.length === 1 && after.entries[0].sessionId === 'session-keep', JSON.stringify(after.entries?.map((entry) => entry.sessionId)))

  const tools = Object.fromEntries(ctxA2.registrations.tools.map((tool) => [tool.name, tool]))

  // --- topic overlay: merge / rename / split without touching the records ----
  const overlayDir = mkdtempSync(join(tmpdir(), 'worklog-overlay-'))
  const store3 = createStore(() => ({ storePath: overlayDir, captureEnabled: true, includeToolCalls: true }))
  store3.append({ ts: '2026-11-26T01:00:00.000Z', date: '2026-11-26', kind: 'turn', sessionId: 's1', summary: 'a', topicId: 't1', topic: '旧主题甲' })
  store3.append({ ts: '2026-11-26T02:00:00.000Z', date: '2026-11-26', kind: 'turn', sessionId: 's1', summary: 'b', topicId: 't1', topic: '旧主题甲' })
  store3.append({ ts: '2026-11-26T03:00:00.000Z', date: '2026-11-26', kind: 'turn', sessionId: 's1', summary: 'c', topicId: 't2', topic: '旧主题乙' })
  const ctxB = fakeContext()
  apply(ctxB.ctx, resolveConfig({ storePath: overlayDir, captureEnabled: true, aiDeepseek: false, aiOllama: false }))
  await sleep(300)
  const toolsB = Object.fromEntries(ctxB.registrations.tools.map((tool) => [tool.name, tool]))
  const topicsOf = async () => (await toolsB.worklog_topics.execute({ from: '2026-11-26', to: '2026-11-26' })).topics.map((topic) => topic.topic)

  const merged = await toolsB.worklog_topic_edit.execute({ action: 'merge', list: ['旧主题甲', '旧主题乙'], into: '合并后的主题' })
  check('merge writes the overlay', merged.ok === true && Object.keys(merged.aliases).length === 2, JSON.stringify(merged.aliases))
  const mergedTopics = await topicsOf()
  check('merge collapses both topics into one', mergedTopics.length === 1 && mergedTopics[0] === '合并后的主题', JSON.stringify(mergedTopics))

  const split = await toolsB.worklog_topic_edit.execute({ action: 'split', from: '2026-11-26T01:30:00.000Z', to: '2026-11-26T02:30:00.000Z', into: '拆出来的主题' })
  check('split records a time-range move', split.ok === true && split.moves.length === 1, JSON.stringify(split.moves))
  const splitTopics = await topicsOf()
  check('split separates one turn into its own topic', splitTopics.includes('拆出来的主题') && splitTopics.includes('合并后的主题'), JSON.stringify(splitTopics))

  const renamed = await toolsB.worklog_topic_edit.execute({ action: 'rename', from: '拆出来的主题', into: '改名后的主题' })
  check('rename applies to an already split topic', renamed.ok === true && (await topicsOf()).includes('改名后的主题'), JSON.stringify(await topicsOf()))

  check('records on disk keep their original labels', store3.readDay('2026-11-26').every((record) => record.topic === '旧主题甲' || record.topic === '旧主题乙'), '')
  await toolsB.worklog_topic_edit.execute({ action: 'reset', confirm: true })
  check('reset brings the original labels back', JSON.stringify([...(await topicsOf())].sort()) === JSON.stringify(['旧主题乙', '旧主题甲']), JSON.stringify(await topicsOf()))

  writeFileSync(join(storeDir, 'workspace.json'), '{ not json')
  const broken = call()
  check('a broken workspace store hides nothing', broken.entries.length === 2, JSON.stringify(broken.entries?.length))
  if (savedHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = savedHome
}

console.log('[topic similarity]')
{
  const topics = [
    { id: 't1', label: '打招呼寒暄' },
    { id: 't2', label: 'archify 扫描器' },
    { id: 't3', label: '模型双路对比扫描功能' },
  ]
  check('a longer version of the same label reuses the topic', resolveTopic('archify 扫描器自动化封装', topics, '')?.id === 't2', JSON.stringify(resolveTopic('archify 扫描器自动化封装', topics, '')))
  check('a shorter version of the same label also reuses', resolveTopic('archify 扫描器', [{ id: 't9', label: 'archify 扫描器自动化封装' }], '')?.id === 't9', '')
  check('a reworded label with most bigrams shared reuses', resolveTopic('模型双路对比扫描', topics, '')?.id === 't3', JSON.stringify(resolveTopic('模型双路对比扫描', topics, '')))
  check('a genuinely different subject still opens a topic', resolveTopic('内网模型接入排查', topics, '')?.label === '内网模型接入排查', JSON.stringify(resolveTopic('内网模型接入排查', topics, '')))
  check('a one-character label keeps the current topic', resolveTopic('新 图', topics, 't1')?.id === 't1', JSON.stringify(resolveTopic('新 图', topics, 't1')))
  check('similarity ignores spacing and punctuation', similarTopicLabel('架构 图-渲染', '架构图渲染与复制'), '')
  check('unrelated labels are not similar', similarTopicLabel('打招呼寒暄', '插件发布可行性评估') === false, '')
  const topicPrompt = aiSystemPrompt(200, false, true)
  check('the prompt groups a topic by module, not by turn action', topicPrompt.includes('主题按「这件事」划分') && topicPrompt.includes('同一个模块'), '')
  check('the prompt keeps separate modules apart', topicPrompt.includes('把「查内网模型」和「改甘特图」算成一个主题——它们不是'), '')
  check('the prompt forbids one-off topic names', topicPrompt.includes('不要用「修复 X」「调整 Y」「优化 Z」'), '')
}

console.log('[mobile gantt]')
{
  const entries = [
    { ts: '2026-11-26T01:00:00.000Z', sessionId: 's1', sessionTitle: '工作日志', topic: '甘特图优化' },
    { ts: '2026-11-26T01:10:00.000Z', sessionId: 's1', sessionTitle: '工作日志', topic: '甘特图优化' },
    { ts: '2026-11-26T01:40:00.000Z', sessionId: 's1', sessionTitle: '工作日志', topic: '内网模型排查' },
    // Same topic after a long pause: one row, two bars.
    { ts: '2026-11-26T05:00:00.000Z', sessionId: 's1', sessionTitle: '工作日志', topic: '甘特图优化' },
    { ts: '2026-11-26T02:00:00.000Z', sessionId: 's2', sessionTitle: '另一个会话', topic: '插件发布' },
  ]
  const html = renderGantt(entries, '2026-11-26', 10 * 60000)
  check('labels and tracks are separate columns', html.includes('class="g-labels"') && html.includes('class="g-scroll"'), '')
  const labels = (html.match(/class="g-label/g) ?? []).length
  const lines = (html.match(/class="g-line/g) ?? []).length
  // The label column carries one extra spacer that aligns with the hour axis.
  check('one track line per label row', labels === lines + 1 && lines === 5, `${labels}/${lines}`)
  check('the strip is wide enough to scroll', /width:(\d+)px/.test(html) && Number(html.match(/width:(\d+)px/)[1]) > 1000, html.match(/width:(\d+)px/)?.[1] ?? '')
  const bars = [...html.matchAll(/left:([\d.]+)px;width:([\d.]+)px/g)].map((match) => [Number(match[1]), Number(match[2])])
  const trackWidth = Number(html.match(/width:(\d+)px/)[1])
  check('every bar sits inside the track', bars.length > 0 && bars.every(([left, width]) => left >= 0 && left + width <= trackWidth + 0.5), JSON.stringify(bars.slice(0, 3)))
  check('a topic split by a long pause draws two bars', bars.length === 4, String(bars.length))
  check('the strip opens at the first bar, not at midnight', /data-focus="(\d+)"/.test(html) && Number(html.match(/data-focus="(\d+)"/)[1]) > 0, html.match(/data-focus="(\d+)"/)?.[1] ?? '')
  check('entries without a topic are skipped', renderGantt([{ ts: '2026-11-26T01:00:00.000Z', sessionId: 's', summary: 'x' }], '2026-11-26', 600000) === '', '')

  // A tapped bar has to explain itself, so it must carry the turn data.
  const tapHtml = renderGantt([{ ts: '2026-11-26T10:00:00.000Z', sessionId: 's1', sessionTitle: '工作日志', topic: '工作日志插件', summary: '修了移动端甘特的滚动' }], '2026-11-26', 600000)
  const bar = tapHtml.match(/<i [^>]*>/)?.[0] ?? ''
  check('a bar carries its summary and clock', bar.includes('data-summary="修了移动端甘特的滚动"') && /data-clock="\d\d:\d\d"/.test(bar), bar.slice(0, 120))
  check('a bar is a tap target', bar.includes('role="button"') && bar.includes('tabindex="0"'), '')

  const page = readFileSync(new URL('../mobile/page.html', import.meta.url).pathname, 'utf8')
  check('the page shows a summary sheet on tap', page.includes('g-sheet') && page.includes('closest(\'.g-line i[data-summary]\')'), '')
  const style = readFileSync(new URL('../mobile/style.css', import.meta.url).pathname, 'utf8')
  check('the sheet is styled as an overlay', style.includes('.g-sheet') && style.includes('.g-sheet[hidden]'), '')
}

console.log('[gantt render smoke]')
{
  // Unit tests never execute the component, so a ReferenceError there shipped
  // twice and blanked the whole panel. Rendering it here closes that gap.
  let output = ''
  let failed = ''
  try {
    output = execFileSync(process.execPath, [new URL('../scripts/smoke-gantt.mjs', import.meta.url).pathname], { encoding: 'utf8' })
  } catch (error) {
    failed = String(error.stderr ?? error.message).split('\n').slice(0, 3).join(' ')
  }
  check('the Gantt component renders without throwing', failed === '', failed)
  check('the smoke render produces topic rows', output.includes('主题行') || output.includes('no log for'), output.split('\n')[0] ?? '')

  // The panel itself has to render: three blank tabs came from a reference error
  // inside the component, which no unit test reached.
  let panelOut = ''
  let panelFail = ''
  try {
    panelOut = execFileSync(process.execPath, [new URL('./smoke-panel.mjs', import.meta.url).pathname], { encoding: 'utf8' })
  } catch (error) {
    panelFail = String(error.stderr ?? error.message).split('\n').slice(0, 3).join(' ')
  }
  check('the panel component renders without throwing', panelFail === '', panelFail)
  check('the panel renders its daily card and date list', panelOut.includes('panel render: ok') && !panelOut.includes('FAIL:'), panelOut.split('\n').filter((line) => line.startsWith('FAIL')).join(' '))
}

console.log('[daily summary]')
{
  const route = (ctxRef, path) => ctxRef.registrations.routes.find((item) => item.path === path)
  const callJson = async (routeRef, url, body) => {
    const response = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
    const request = {
      method: body === undefined ? 'GET' : 'POST',
      url,
      on(event, handler) {
        if (event === 'data') handler(Buffer.from(JSON.stringify(body ?? {})))
        if (event === 'end') handler()
        return this
      },
      destroy() {},
    }
    await routeRef.handler(request, response)
    return { status: response.statusCode, payload: JSON.parse(response.body || '{}') }
  }

  const dailyDir = mkdtempSync(join(tmpdir(), 'worklog-daily-'))
  const dailyStore = createStore(() => ({ storePath: dailyDir, captureEnabled: true, includeToolCalls: true }))
  for (const [index, topic] of ['甘特图优化', '甘特图优化', '内网模型排查'].entries()) {
    dailyStore.append({ ts: `2026-11-26T0${index + 1}:00:00.000Z`, date: '2026-11-26', kind: 'turn', sessionId: 's1', summary: `第${index + 1}轮：${topic}`, topicId: 't1', topic })
  }
  const ctxD = fakeContext()
  apply(ctxD.ctx, resolveConfig({ storePath: dailyDir, captureEnabled: true, aiDeepseek: false, aiOllama: false }))

  const daysRoute = route(ctxD, '/dsh-worklog/days')
  const dailyRoute = route(ctxD, '/dsh-worklog/daily')

  const days = (await callJson(daysRoute, '/dsh-worklog/days')).payload
  check('the days index lists days with turns', days.days.length === 1 && days.days[0].date === '2026-11-26' && days.days[0].turns === 3, JSON.stringify(days.days))
  check('the days index knows there is no summary yet', days.days[0].hasSummary === false && days.days[0].topics === 2, JSON.stringify(days.days[0]))

  const empty = await callJson(dailyRoute, '/dsh-worklog/daily?date=2026-11-26')
  check('GET returns the day without generating', empty.status === 200 && empty.payload.summary === null, JSON.stringify(empty.payload).slice(0, 120))
  const refused = await callJson(dailyRoute, '/dsh-worklog/daily?date=2026-11-26', { date: '2026-11-26' })
  check('POST without a model reports failure instead of inventing text', refused.status === 400 && refused.payload.ok === false, JSON.stringify(refused.payload).slice(0, 120))

  mkdirSync(join(dailyDir, 'daily'), { recursive: true })
  writeFileSync(join(dailyDir, 'daily', '2026-11-26.json'), JSON.stringify({
    date: '2026-11-26', generatedAt: '2026-11-26T12:00:00.000Z', fingerprint: '3|2026-11-26T03:00:00.000Z',
    slots: { primary: { text: '今天在改甘特图', model: 'deepseek-flash' }, secondary: { text: 'Gantt rework', model: 'qwen3.5' } },
  }))
  const stored = (await callJson(dailyRoute, '/dsh-worklog/daily?date=2026-11-26')).payload
  check('a stored summary comes back with both slots', stored.summary?.slots?.primary?.text === '今天在改甘特图' && stored.summary?.slots?.secondary?.model === 'qwen3.5', JSON.stringify(stored.summary).slice(0, 120))
  check('a matching fingerprint is not stale', stored.stale === false, String(stored.stale))
  dailyStore.append({ ts: '2026-11-26T04:00:00.000Z', date: '2026-11-26', kind: 'turn', sessionId: 's1', summary: '第4轮', topicId: 't1', topic: '甘特图优化' })
  check('a new turn marks the summary stale', (await callJson(dailyRoute, '/dsh-worklog/daily?date=2026-11-26')).payload.stale === true, '')
  check('the days index reports the stored summary', (await callJson(daysRoute, '/dsh-worklog/days')).payload.days[0].hasSummary === true, '')
}

console.log('[day digest]')
{
  // Topics weighted by turns, one sample each, and a hard line budget so a small
  // model cannot drown the big topics in small ones.
  const dailyDir2 = mkdtempSync(join(tmpdir(), 'worklog-digest-'))
  const storeD = createStore(() => ({ storePath: dailyDir2, captureEnabled: true, includeToolCalls: true }))
  const topics = [['大主题甲', 6], ['大主题乙', 5], ['大主题丙', 4], ['小主题丁', 1], ['小主题戊', 1]]
  let minute = 0
  for (const [topic, count] of topics) {
    for (let index = 0; index < count; index += 1) {
      minute += 1
      storeD.append({
        ts: `2026-11-26T${String(Math.floor(minute / 60) + 1).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00.000Z`,
        date: '2026-11-26', kind: 'turn', sessionId: 's1', summary: `${topic} 第${index + 1}轮`, topicId: 't1', topic,
      })
    }
  }
  const ctxE = fakeContext()
  apply(ctxE.ctx, resolveConfig({ storePath: dailyDir2, captureEnabled: true, aiDeepseek: false, aiOllama: false }))
  const digest = dayDigest(storeD.readDay('2026-11-26'))
  check('the digest states the day size', digest.includes('【当天共 17 轮，5 个主题】'), digest.split('\n')[0])
  check('the digest names the three busiest topics', digest.includes('【必须覆盖】大主题甲（6 轮）、大主题乙（5 轮）、大主题丙（4 轮）'), digest.split('\n')[1] ?? '')
  check('each topic keeps only one sample', (digest.match(/  · /g) ?? []).length === 5, String((digest.match(/  · /g) ?? []).length))

  // A summary that names the three big topics is fine; one that skips them is not.
  const full = '今天主要做大主题甲、大主题乙和大主题丙，另外顺手碰了小主题丁。'
  const thin = '今天主要在处理小主题丁和小主题戊，以及一些杂事。'
  check('a summary that covers the big topics passes', coverageGap(full, storeD.readDay('2026-11-26')).covered === 3, JSON.stringify(coverageGap(full, storeD.readDay('2026-11-26'))))
  const gap = coverageGap(thin, storeD.readDay('2026-11-26'))
  check('a summary that skips them is flagged', gap.covered === 0 && gap.missing.length === 3, JSON.stringify(gap))

  // The local model gets a hard length cap.
  const long = `${'这是很长的一段总结。'.repeat(40)}结尾。`
  check('the local summary is cut at 400 characters', cleanDailyText(long, 400).length <= 400, String(cleanDailyText(long, 400).length))
  check('the cut lands on a sentence end', /[。！？]$/.test(cleanDailyText(long, 400)), cleanDailyText(long, 400).slice(-6))
  check('without a cap the text is kept whole', cleanDailyText(long).length > 400, String(cleanDailyText(long).length))
}

console.log('[visual spec]')
{
  // The DSH visual spec is enforced here: tokens only, three type tiers, three
  // radius tiers, no dashed structure lines, no invented token names.
  const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url).pathname, 'utf8')
  const css = clientSource.slice(clientSource.indexOf('    const CSS = `'), clientSource.indexOf('    function Styles() {'))
  const allowed = new Set([
    '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-label-on-color',
    '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-border-l1', '--dsw-alias-border-l2',
    '--dsw-alias-state-business-primary', '--dsw-alias-state-business-tertiary',
    '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary', '--dsw-alias-state-warn-label',
    '--dsw-alias-state-error-primary', '--dsw-static-deepseek-450', '--dsw-static-deepseek-500',
    '--dsw-focus-ring-width', '--dsw-focus-ring-color',
  ])
  const usedTokens = [...new Set([...css.matchAll(/(--dsw-[a-z0-9-]+)/g)].map((match) => match[1]))]
  const unknown = usedTokens.filter((token) => !allowed.has(token))
  check('every dsw token exists in the spec', unknown.length === 0, unknown.join(', '))
  check('no literal colour values', (css.match(/#[0-9a-fA-F]{3,8}/g) ?? []).length === 0, (css.match(/#[0-9a-fA-F]{3,8}/g) ?? []).join(','))
  check('no literal font sizes', (css.match(/font-size:\s*[\d.]+px/g) ?? []).length === 0, (css.match(/font-size:\s*[\d.]+px/g) ?? []).join(','))
  check('no literal radii', (css.match(/border-radius:\s*[\d.]+px/g) ?? []).length === 0, (css.match(/border-radius:\s*[\d.]+px/g) ?? []).join(','))
  const fontTiers = new Set([...css.matchAll(/font-size:\s*var\((--wl-fs-[a-z]+)\)/g)].map((match) => match[1]))
  check('at most three font tiers', fontTiers.size <= 3, [...fontTiers].join(','))
  const radiusTiers = new Set([...css.matchAll(/border-radius:\s*var\((--wl-radius-[a-z]+)\)/g)].map((match) => match[1]))
  check('at most three radius tiers', radiusTiers.size <= 3, [...radiusTiers].join(','))
  check('no dashed structural borders', !/dashed/.test(css), '')
  check('brand-primary is not used as an accent', !/brand-primary/.test(css), '')
  check('focus rings cover the controls', (css.match(/:focus-visible/g) ?? []).length >= 5, String((css.match(/:focus-visible/g) ?? []).length))
  check('cards use the card border token', /wl-item[^\n]*border: 1px solid var\(--dsw-alias-border-l2\)/.test(css), '')
}

console.log('[panel geometry]')
{
  // The Gantt mixes a JS constant with CSS layout: the "now" line is placed at
  // LABEL_W + x, so the label column must really be that wide. Content-box made it
  // 201px and shifted every bar 21px right of the line.
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const labelWidth = source.match(/const LABEL_W = (\d+)/)?.[1]
  const cssWidth = source.match(/\.wl-gantt-label \{[^}]*width: (\d+)px/)?.[1]
  check('the Gantt label constant matches the CSS width', labelWidth !== undefined && labelWidth === cssWidth, `${labelWidth} vs ${cssWidth}`)
  check('the panel box model is border-box', source.includes('.wl-root, .wl-root *') && source.includes('box-sizing: border-box'))
  check('bars carry a hover handler', source.includes('onMouseEnter') && source.includes('wl-gantt-tip'))
  {
    // Every bar element must bind the card itself; a bare `title` never fires fast
    // enough to be seen, and one missing handler is invisible in a screenshot.
    // Count declarations rather than scanning a character window: the bars are
    // written in different shapes and a fixed window misses the long ones.
    const bars = source.split("className: 'wl-gantt-bar'").length - 1
    const handlers = source.split('onMouseEnter:').length - 1
    check('every bar binds a hover card', bars > 0 && handlers >= bars, `${handlers} handlers / ${bars} bars`)
  }

  // React hooks must not sit behind an early return: the first paint (no data)
  // would run fewer hooks than the second, which blanks the whole panel.
  const gantt = source.slice(source.indexOf('function Gantt(props)'), source.indexOf('const LABEL_W'))
  const earlyAt = gantt.indexOf('if (list.length === 0)')
  const lastHookAt = Math.max(gantt.lastIndexOf('React.useState'), gantt.lastIndexOf('React.useRef'), gantt.lastIndexOf('React.useEffect'))
  check('no hook sits behind the Gantt early return', earlyAt === -1 || earlyAt > lastHookAt, `${earlyAt} vs ${lastHookAt}`)
  check('the timeline re-parks after the first fetch', gantt.includes('parkedFor') && gantt.includes('flat.length === 0) return'))
}

console.log('[panel routes]')
{
  const { registrations } = contextA
  const panel = registrations.routes.find((route) => route.path === '/dsh-worklog/panel')
  const toggle = registrations.routes.find((route) => route.path === '/dsh-worklog/toggle')
  check('panel route registered', panel !== undefined)
  check('toggle route registered', toggle !== undefined)

  const response = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
  panel.handler({ method: 'GET', url: '/dsh-worklog/panel' }, response)
  const payload = JSON.parse(response.body)
  check('panel returns today count', payload.count === 5, JSON.stringify(payload.count))
  check('panel returns entries', Array.isArray(payload.entries) && payload.entries.length === 5, JSON.stringify(payload.entries?.length))
  check('panel exposes the switch state', payload.enabled === true, String(payload.enabled))
  check('panel exposes live tracking', typeof payload.live?.tracked === 'number', JSON.stringify(payload.live))
  check('panel carries a topic grouping', Array.isArray(payload.topics) && Array.isArray(payload.sessions), JSON.stringify(payload.topics))
  check('panel reports the day range it answered for', payload.range?.from === day && payload.range?.to === day, JSON.stringify(payload.range))
  check('panel sends the host clock for the now marker', typeof payload.now === 'string' && payload.now.endsWith('Z'), String(payload.now))

  const ranged = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
  panel.handler({ method: 'GET', url: `/dsh-worklog/panel?from=${day}&to=${day}` }, ranged)
  const rangedPayload = JSON.parse(ranged.body)
  check('panel accepts an explicit date range', rangedPayload.range?.days === 1 && rangedPayload.count === payload.count, JSON.stringify(rangedPayload.range))
  check('panel entries only expose location as absolute', payload.entries.every((entry) => Object.entries(entry).every(([key, value]) => key === 'workspace' || key === 'sessionPath' || !JSON.stringify(value).includes(repo))))

  const post = {
    method: 'POST',
    url: '/dsh-worklog/toggle',
    on(event, callback) {
      if (event === 'data') callback(JSON.stringify({ enabled: false }))
      if (event === 'end') callback()
    },
  }
  const toggleResponse = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
  await toggle.handler(post, toggleResponse)
  check('toggle route answers', toggleResponse.statusCode === 200, String(toggleResponse.statusCode))

  const settingsRoute = registrations.routes.find((route) => route.path === '/dsh-worklog/settings')
  check('settings route registered', settingsRoute !== undefined)
  const settingsResponse = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
  await settingsRoute.handler({ method: 'GET', url: '/dsh-worklog/settings' }, settingsResponse)
  const settingsPayload = JSON.parse(settingsResponse.body)
  check('settings lists routes and the current choice', settingsPayload.ok === true && Array.isArray(settingsPayload.providers) && settingsPayload.selected !== undefined, JSON.stringify(Object.keys(settingsPayload)))
  check('settings exposes the prompt fields', typeof settingsPayload.prompts?.primary === 'string', JSON.stringify(settingsPayload.prompts))
  check('settings shows the effective built-in prompts', typeof settingsPayload.builtinPrompts?.primary === 'string' && settingsPayload.builtinPrompts.primary.includes('摘要器'), String(settingsPayload.builtinPrompts?.primary || '').slice(0, 20))
  check('settings reports the route the host actually picked', settingsPayload.effective?.model === 'deepseek-flash', JSON.stringify(settingsPayload.effective))

  const saveResponse = { statusCode: 0, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value }, end(value) { this.body = value ?? '' } }
  const saveRequest = {
    method: 'POST',
    url: '/dsh-worklog/settings',
    on(event, callback) {
      if (event === 'data') callback(JSON.stringify({ provider: 'openai', model: 'gpt-6.2-sol', promptPrimary: '自定义' }))
      if (event === 'end') callback()
    },
  }
  await settingsRoute.handler(saveRequest, saveResponse)
  const saved = JSON.parse(saveResponse.body)
  check('settings answers after a save', saveResponse.statusCode === 200, String(saveResponse.statusCode))
  const lastEdit = registrations.edits.at(-1) ?? {}
  check('settings writes the chosen route', lastEdit.aiProvider === 'openai' && lastEdit.aiModel === 'gpt-6.2-sol', JSON.stringify(lastEdit))
  check('settings writes the prompt', lastEdit.promptPrimary === '自定义', JSON.stringify(lastEdit))
  check('an empty route reads as the host default', saved.selected?.provider === '' && saved.selected?.model === '', JSON.stringify(saved.selected))
}

console.log('[mobile page]')
{
  const rows = [{
    ts: '2026-11-26T08:00:00.000Z', kind: 'turn', sessionTitle: '插件标题',
    summary: '完成移动端接入', summaries: { deepseek: 'DeepSeek 摘要', ollama: 'Qwen 摘要' },
    answer: '原始回答含本地路径 /private/workspace/file.js',
    topicId: 't2', topic: '移动端收尾',
    tools: ['worklog_today'], workspace: '/private/workspace', sessionPath: '/private/session.jsonl',
  }]
  const routes = []
  const ctx = {
    webServer: { register(route) { routes.push(route); return () => {} } },
  }
  registerMobile(ctx, { readDay: () => rows }, () => false)
  const route = routes[0]
  const call = async (url, method = 'GET', headers = {}) => {
    const response = { statusCode: 0, headers: {}, body: '', writeHead(status, values) { this.statusCode = status; this.headers = values }, end(value) { this.body = value ?? '' } }
    await route.handler({ url, method, headers }, response)
    return response
  }
  const denied = await call('/dsh-worklog/mobile')
  check('mobile page rejects missing token', denied.statusCode === 401)
  const malformed = await call('/dsh-worklog/mobile?mt=short')
  check('mobile page rejects malformed token', malformed.statusCode === 401)
  const page = await call('/dsh-worklog/mobile?mt=' + 'a'.repeat(32), 'GET', { 'accept-language': 'zh-CN,zh;q=0.9' })
  check('mobile page serves server-rendered data', page.statusCode === 200 && page.body.includes('完成移动端接入'))
  check('mobile page uses locale metadata', page.body.includes('<h1>工作日志</h1>'))
  check('mobile page carries model summaries and comparison labels', page.body.includes('DeepSeek 摘要') && page.body.includes('Qwen 摘要') && page.body.includes('摘要对比'))
  check('mobile page names each slot from the record', page.body.includes('"summaryLabels"') || page.body.includes('summaryLabels'))
  check('mobile page explains filtered empty categories', page.body.includes('这个分类今天还没有记录'))
  check('mobile page reports paused capture', page.body.includes('"captureEnabled":false') && page.body.includes('记录已暂停，新的对话不会加入工作日志'))
  check('mobile page omits raw assistant answers', !page.body.includes('原始回答含本地路径'))
  check('mobile page no longer falls back to raw kind headings', !page.body.includes('entry.sessionTitle || entry.kind'))
  check('mobile page carries the topic of each entry', page.body.includes('"topic":"移动端收尾"') && page.body.includes('class="topic"'), '')
  check('mobile page reports how many topics today has', page.body.includes('个主题') || page.body.includes('topics'))
  const englishPage = await call('/dsh-worklog/mobile?mt=' + 'a'.repeat(32), 'GET', { 'accept-language': 'en-US,en;q=0.9' })
  check('mobile page localizes English metadata and empty-state copy', englishPage.body.includes('<h1>Worklog</h1>') && englishPage.body.includes('No entries in this category today'))
  check('mobile page carries token into stylesheet URL', page.body.includes('style.css?mt=' + 'a'.repeat(32)))
  check('mobile response omits absolute workspace paths', !page.body.includes('/private/workspace') && !page.body.includes('/private/session.jsonl'))
  check('mobile tabs render counts for empty categories', page.body.includes("'tool': 0") || page.body.includes('tool: 0'))
  const css = await call('/dsh-worklog/mobile/style.css?mt=' + 'a'.repeat(32))
  check('mobile stylesheet is available with token', css.statusCode === 200 && css.headers['content-type'].startsWith('text/css'))
  check('mobile tabs follow the measured header height', css.body.includes('top:var(--header-h,0px)') && !css.body.includes('top:75px') && page.body.includes("setProperty('--header-h'"))
  check('locale falls back from zh-CN to zh', mobileInternals.languageOf('zh-CN', ['en', 'zh']) === 'zh')
  const safe = mobileInternals.publicEntry(rows[0])
  check('mobile entry allowlist excludes private paths', !('workspace' in safe) && !('sessionPath' in safe))
  check('mobile entry allowlist keeps the topic', safe.topicId === 't2' && safe.topic === '移动端收尾', JSON.stringify(safe.topic))
}

console.log('')
if (failures > 0) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
