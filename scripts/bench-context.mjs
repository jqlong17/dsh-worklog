#!/usr/bin/env node
/**
 * Replay real turns through the summariser to compare prompt variants.
 *
 * Turns are recovered from a DSH session log (concatenated zstd frames), so the
 * inputs are exactly what the recorder saw — not rewritten samples. Each variant
 * runs the whole sequence in order and keeps its own rolling state, which is the
 * only way to measure whether context reduces repetition.
 *
 *   node scripts/bench-context.mjs --session <session.v4.jsonl.zstd> --turns 10
 *   node scripts/bench-context.mjs --variant context0 --variant thread3
 *
 * DeepSeek cannot be reached from a standalone script (its credentials live in
 * the host's `llm` service), so this measures the local Ollama model.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { aiSystemPrompt, aiUserPrompt, parseSummaryOutput, summarizeWithOllama } from '../lib/index.js'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const MAX_TEXT = 1200

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

function args(name) {
  const out = []
  process.argv.forEach((value, index) => {
    if (value === `--${name}` && process.argv[index + 1] !== undefined) out.push(process.argv[index + 1])
  })
  return out
}

/** A DSH session file is one zstd frame per append, so the whole file needs splitting. */
function decodeSession(path) {
  const buffer = readFileSync(path)
  const starts = []
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (buffer[index] === ZSTD_MAGIC[0] && buffer[index + 1] === ZSTD_MAGIC[1]
      && buffer[index + 2] === ZSTD_MAGIC[2] && buffer[index + 3] === ZSTD_MAGIC[3]) starts.push(index)
  }
  let text = ''
  for (const [position, start] of starts.entries()) {
    const end = position + 1 < starts.length ? starts[position + 1] : buffer.length
    try {
      text += zstdDecompressSync(buffer.subarray(start, end)).toString('utf8')
    } catch {
      // A truncated trailing frame is not a reason to lose the rest.
    }
  }
  return text
}

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
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

/** Rebuild `{ human, assistant, reason }` per turn in log order. */
function recoverTurns(text) {
  const turns = []
  let current
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let record
    try {
      record = JSON.parse(line)
    } catch {
      continue
    }
    if (record.type === 'turn/start') {
      current = { index: record.data?.turn, human: '', assistant: '', reason: '' }
    } else if (record.type === 'user/message' && current !== undefined) {
      if (record.data?.source?.kind !== 'user') continue
      const value = blocksText(record.data.content)
      if (value && !current.human) current.human = value
    } else if (record.type === 'assistant/message' && current !== undefined) {
      const value = blocksText(record.data?.message?.content)
      if (value) current.assistant = value
    } else if (record.type === 'turn/end' && current !== undefined) {
      current.reason = String(record.data?.reason?.kind ?? '')
      turns.push(current)
      current = undefined
    }
  }
  return turns
}

/** Wrappers, leftover system reminders and tool echoes are not usable samples. */
function usable(turn) {
  if (!turn.human || !turn.assistant) return false
  if (turn.reason !== '' && turn.reason !== 'completed') return false
  if (turn.human.length < 8) return false
  if (turn.human.startsWith('<') || turn.human.startsWith('【系统')) return false
  if (/^(?:Time sampled|This is an automatically generated checkpoint)/.test(turn.human)) return false
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(turn.human)) return false
  return true
}

function grams(text, size = 3) {
  const flat = text.replace(/[\s\p{P}]/gu, '')
  const out = new Set()
  for (let index = 0; index + size <= flat.length; index += 1) out.add(flat.slice(index, index + size))
  return out
}

/** Share of 3-grams already present in the earlier lines; high means restating. */
function overlap(text, earlier) {
  const mine = grams(text)
  if (mine.size === 0) return 0
  const theirs = new Set()
  for (const line of earlier) for (const gram of grams(line)) theirs.add(gram)
  let shared = 0
  for (const gram of mine) if (theirs.has(gram)) shared += 1
  return shared / mine.size
}

/** Checkable nouns: identifiers, paths, numbers — what makes a log line verifiable. */
function nouns(text) {
  const matches = text.match(/[A-Za-z][A-Za-z0-9_./:-]{2,}|\d+(?:\.\d+)?/g) ?? []
  return new Set(matches.map((value) => value.toLowerCase())).size
}

const VARIANTS = {
  plain: { label: '单轮（现状）', context: false, thread: false },
  window3: { label: '最近 3 条摘要', context: true, thread: false },
  thread3: { label: '主线 + 3 条摘要', context: true, thread: true },
}

async function runVariant(variant, samples, options) {
  const specification = VARIANTS[variant]
  const lines = []
  const recent = []
  let thread = ''
  for (const [index, sample] of samples.entries()) {
    const context = specification.context
      ? { thread: specification.thread ? thread : '', recent: [...recent] }
      : undefined
    const input = aiUserPrompt(sample.human, sample.assistant, context)
    const system = aiSystemPrompt(options.maxChars, true, specification.thread)
    const started = Date.now()
    let summary = ''
    let nextThread = ''
    let error = ''
    try {
      const raw = await summarizeWithOllama({
        baseUrl: options.baseUrl,
        model: options.model,
        system,
        input,
        timeoutMs: options.timeoutMs,
      })
      const parsed = parseSummaryOutput(raw, options.maxChars)
      summary = parsed.summary
      nextThread = parsed.thread
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    const ms = Date.now() - started
    if (summary) recent.push({ summary })
    if (nextThread) thread = nextThread
    lines.push({ index, summary, thread, ms, error, input })
    process.stderr.write(`  ${variant} ${index + 1}/${samples.length} ${ms}ms\n`)
  }
  return lines
}

const baseUrl = arg('base-url', 'http://127.0.0.1:11434')
const model = arg('model', 'qwen3.5:9b-q4_K_M')
const maxChars = Number(arg('max-chars', 200))
const timeoutMs = Number(arg('timeout-ms', 60000))
const limit = Number(arg('turns', 10))
const sessionArg = arg('session', '')
const requested = args('variant')
const variants = requested.length > 0 ? requested : ['plain', 'thread3']
const outDir = resolve(arg('out', 'bench'))

for (const variant of variants) {
  if (VARIANTS[variant] === undefined) {
    console.error(`unknown variant ${variant}; known: ${Object.keys(VARIANTS).join(', ')}`)
    process.exit(1)
  }
}
if (!sessionArg || !existsSync(sessionArg)) {
  console.error('pass --session <path to session.v4.jsonl.zstd>')
  process.exit(1)
}

const turns = recoverTurns(decodeSession(sessionArg))
const samples = turns.filter(usable).slice(0, limit)
if (samples.length === 0) {
  console.error('no usable turns in that session')
  process.exit(1)
}
console.log(`session: ${sessionArg}`)
console.log(`turns: ${turns.length} total, ${samples.length} used, model: ${model}`)

const results = {}
for (const variant of variants) {
  console.log(`\n[variant ${variant}] ${VARIANTS[variant].label}`)
  results[variant] = await runVariant(variant, samples, { baseUrl, model, maxChars, timeoutMs })
}

// ---- report ---------------------------------------------------------------
const score = (lines) => {
  const written = []
  let ms = 0
  let overlaps = 0
  let nounsTotal = 0
  let chars = 0
  let empty = 0
  for (const [index, line] of lines.entries()) {
    ms += line.ms
    if (!line.summary) {
      empty += 1
      continue
    }
    overlaps += overlap(line.summary, written.slice(-3))
    nounsTotal += nouns(line.summary)
    chars += [...line.summary].length
    written.push(line.summary)
  }
  const answered = Math.max(1, written.length)
  return {
    empty,
    chars: Math.round(chars / answered),
    overlap: Math.round((overlaps / answered) * 1000) / 10,
    nouns: Math.round((nounsTotal / answered) * 10) / 10,
    ms: Math.round(ms / lines.length),
  }
}

const rows = variants.map((variant) => ({ variant, ...score(results[variant]) }))
const report = []
report.push('# 工作日志摘要：上下文对比')
report.push('')
report.push(`- 会话：\`${sessionArg}\``)
report.push(`- 样本：${samples.length} 轮（跳过中止/报错与无文本轮次）`)
report.push(`- 模型：\`${model}\`（本地 Ollama；DeepSeek 走 Host 的 \`llm\` 服务，脚本无法直连）`)
report.push(`- 摘要上限：${maxChars} 字`)
report.push('')
report.push('| 方案 | 平均字数 | 与前 3 条重复度 | 可核查名词 | 平均耗时 | 空输出 |')
report.push('| --- | --- | --- | --- | --- | --- |')
for (const row of rows) {
  report.push(`| ${VARIANTS[row.variant].label} | ${row.chars} | ${row.overlap}% | ${row.nouns} | ${row.ms} ms | ${row.empty} |`)
}
report.push('')
report.push('重复度 = 与前 3 条已生成摘要的字符 3-gram 重合比例，越低说明越少复述。')
report.push('')
for (const [index, sample] of samples.entries()) {
  report.push(`## 第 ${index + 1} 轮`)
  report.push('')
  report.push(`**用户**：${sample.human.slice(0, 160)}`)
  report.push('')
  report.push(`**助手**：${sample.assistant.slice(0, 160)}`)
  report.push('')
  for (const variant of variants) {
    const line = results[variant][index]
    report.push(`- **${VARIANTS[variant].label}**（${line.ms} ms）：${line.summary === '' ? `（${line.error || '空输出'}）` : line.summary}`)
    if (VARIANTS[variant].thread === true && line.thread) report.push(`  - 主线：${line.thread}`)
  }
  report.push('')
}

mkdirSync(outDir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '')
const file = join(outDir, `bench-context-${stamp}.md`)
writeFileSync(file, `${report.join('\n')}\n`, 'utf8')
console.log(`\n${report.slice(0, 14).join('\n')}`)
console.log(`\nwritten: ${file}`)
