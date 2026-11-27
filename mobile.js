import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dayOf } from './lib/store.js'

const CHANNEL = '/dsh-worklog/mobile'
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/
const ROOT = dirname(fileURLToPath(import.meta.url))
const PAGE_FILE = join(ROOT, 'mobile', 'page.html')
const STYLE_FILE = join(ROOT, 'mobile', 'style.css')
const MAX_MOBILE_ENTRIES = 100

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(body)
}

function languageOf(header, available) {
  const requested = String(header ?? '').split(',').map((part) => part.split(';')[0].trim().toLowerCase())
  for (const candidate of requested) {
    const exact = available.find((language) => language.toLowerCase() === candidate)
    if (exact) return exact
    const base = candidate.split('-')[0]
    const regional = available.find((language) => language.toLowerCase() === base)
    if (regional) return regional
  }
  return available.includes('zh') ? 'zh' : available[0] || 'en'
}

function localeMeta(header) {
  let available = []
  try {
    available = readdirSync(join(ROOT, 'locale')).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5))
  } catch { /* use package metadata fallback */ }
  if (!available.includes('en')) return { title: 'dsh-worklog', description: '', language: 'en' }
  const language = languageOf(header, available)
  const read = (id) => {
    try { return JSON.parse(readFileSync(join(ROOT, 'locale', `${id}.json`), 'utf8')).meta ?? {} } catch { return {} }
  }
  const chosen = read(language)
  const english = read('en')
  let pkg = {}
  try { pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) } catch { /* metadata remains optional */ }
  return {
    title: chosen.title || english.title || pkg.name || 'dsh-worklog',
    description: chosen.description || english.description || pkg.description || '',
    language,
  }
}

function mobileCopy(language) {
  if (language === 'en') {
    return {
      all: 'All', turn: 'Conversations', note: 'Notes', tool: 'Tools',
      tabsLabel: 'Entry categories',
      topics: '{n} topics',
      emptyAll: 'No worklog entries today', emptyFiltered: 'No entries in this category today',
      recent: 'Showing the latest {shown} of {count} entries',
      details: 'Model summaries', deepseek: 'DeepSeek', local: 'Local model',
      paused: 'Capture is paused. New conversations will not be recorded.',
      saved: 'Worklog · saved automatically',
    }
  }
  return {
    all: '全部', turn: '对话', note: '手记', tool: '工具',
    tabsLabel: '日志类型',
    topics: '{n} 个主题',
    emptyAll: '今天还没有工作日志', emptyFiltered: '这个分类今天还没有记录',
    recent: '显示最近 {shown} 条，共 {count} 条',
    details: '摘要对比', deepseek: 'DeepSeek', local: '本地模型',
    paused: '记录已暂停，新的对话不会加入工作日志',
    saved: '工作日志 · 自动保存',
  }
}

function publicEntry(record) {
  const summaries = record.summaries && typeof record.summaries === 'object' ? record.summaries : {}
  return {
    ts: String(record.ts ?? ''),
    kind: String(record.kind ?? ''),
    summary: String(record.summary ?? ''),
    ...(typeof record.sessionTitle === 'string' && record.sessionTitle ? { sessionTitle: record.sessionTitle } : {}),
    ...(typeof record.topicId === 'string' && record.topicId ? { topicId: record.topicId } : {}),
    ...(typeof record.topic === 'string' && record.topic ? { topic: record.topic } : {}),
    ...(Object.keys(summaries).length
      ? { summaries: { primary: summaries.primary ?? summaries.deepseek, secondary: summaries.secondary ?? summaries.ollama }, summaryLabels: record.summaryLabels ?? {} }
      : {}),
    tools: Array.isArray(record.tools) ? record.tools.slice(0, 8) : [],
  }
}

/** Join segments that follow each other within `gapMs`; drawing only, never grouping. */
function mergeSegments(segments, gapMs) {
  const sorted = [...segments].sort((left, right) => left[0] - right[0])
  const out = []
  for (const segment of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && gapMs > 0 && segment[0] - last[1] <= gapMs) {
      last[1] = Math.max(last[1], segment[1])
      last[2] = segment[2] || last[2]
      continue
    }
    out.push([segment[0], segment[1], segment[2]])
  }
  return out
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])

/**
 * One row per topic across the whole day, drawn as a 24-hour strip.
 *
 * Same rules as the panel: sessions group the rows, topics are the only level
 * below, and segments are merged by the configured gap. Widths are percentages so
 * the strip fits any phone without horizontal scrolling.
 */
export function renderGantt(entries, date, gapMs) {
  const dayStart = new Date(`${date}T00:00:00`).getTime()
  const PX_PER_MIN = 1.4
  const TRACK_W = Math.round(24 * 60 * PX_PER_MIN)
  const GAP_CAP = 45 * 60000
  const MIN_BAR_MS = 2 * 60000

  const bySession = new Map()
  for (const entry of entries) {
    if (typeof entry.topic !== 'string' || entry.topic.trim() === '') continue
    const at = Date.parse(entry.ts)
    if (!Number.isFinite(at)) continue
    const key = entry.sessionId || entry.sessionTitle || 'session'
    if (!bySession.has(key)) bySession.set(key, { key, title: entry.sessionTitle || key, turns: [] })
    bySession.get(key).turns.push({ at, topic: entry.topic.trim(), summary: String(entry.summary ?? '') })
  }
  const sessions = [...bySession.values()].filter((group) => group.turns.length > 0)
  if (sessions.length === 0) return ''

  const minuteOf = (at) => (at - dayStart) / 60000
  const labelRows = []
  const trackRows = []
  let firstBarLeft = null
  for (const group of sessions) {
    group.turns.sort((left, right) => left.at - right.at)
    const topics = new Map()
    group.turns.forEach((turn, index) => {
      const next = index + 1 < group.turns.length ? group.turns[index + 1].at : Number.NaN
      // A turn owns the time up to the next turn, capped, so a stretch of work does
      // not look like a one-minute dot.
      const stop = Number.isFinite(next) ? Math.min(next, turn.at + GAP_CAP) : turn.at + MIN_BAR_MS
      const key = turn.topic.toLowerCase()
      if (!topics.has(key)) topics.set(key, { topic: turn.topic, segments: [], first: turn.at })
      topics.get(key).segments.push([turn.at, Math.max(stop, turn.at + MIN_BAR_MS), turn.summary])
    })
    labelRows.push(`<div class="g-label g-head-label">${escapeHtml(group.title)}</div>`)
    trackRows.push(`<div class="g-line g-head"></div>`)
    for (const topic of [...topics.values()].sort((left, right) => left.first - right.first)) {
      const bars = mergeSegments(topic.segments, gapMs).map((segment) => {
        const left = Math.max(0, Math.min(TRACK_W, minuteOf(segment[0]) * PX_PER_MIN))
        const width = Math.max(3, Math.min(TRACK_W - left, ((segment[1] - segment[0]) / 60000) * PX_PER_MIN))
        if (firstBarLeft === null) firstBarLeft = left
        const clock = new Date(segment[0]).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        const summary = String(segment[2] ?? '')
        // Tap target: the bar carries what the card would say, the sheet shows it.
        return `<i role="button" tabindex="0" data-clock="${clock}" data-topic="${escapeHtml(topic.topic)}" data-summary="${escapeHtml(summary)}" style="left:${left.toFixed(1)}px;width:${width.toFixed(1)}px"></i>`
      }).join('')
      labelRows.push(`<div class="g-label">${escapeHtml(topic.topic)}</div>`)
      trackRows.push(`<div class="g-line">${bars}</div>`)
    }
  }

  const ticks = []
  for (let hour = 0; hour <= 24; hour += 3) {
    ticks.push(`<span style="left:${(hour * 60 * PX_PER_MIN).toFixed(1)}px">${String(hour).padStart(2, '0')}</span>`)
  }
  const axis = `<div class="g-ticks" style="width:${TRACK_W}px">${ticks.join('')}</div>`
  // Open the strip where the day actually has work, not at 00:00.
  const focus = Math.max(0, Math.round((firstBarLeft ?? 0) - 24))
  return `<div class="g-layout"><div class="g-labels"><div class="g-axis-space"></div>${labelRows.join('')}</div>`
    + `<div class="g-scroll" data-focus="${focus}">${axis}${trackRows.join('')}</div></div>`
}

/**
 * Day summary block for the Pocket page.
 *
 * Same file the panel reads: one card per summariser, so the phone shows exactly
 * what the desktop showed, including a thin-coverage warning.
 */
export function renderDaily(day, daily, language) {
  if (daily === null || typeof daily !== 'object') return ''
  const slots = daily.slots && typeof daily.slots === 'object' ? daily.slots : {}
  const cards = []
  for (const [slot, value] of Object.entries(slots)) {
    if (value === null || typeof value !== 'object' || typeof value.text !== 'string' || value.text === '') continue
    const label = slot === 'secondary'
      ? (language === 'en' ? 'Comparison' : '对比摘要')
      : (language === 'en' ? 'Primary' : '主摘要')
    const model = typeof value.model === 'string' && value.model !== '' ? ` · ${escapeHtml(value.model)}` : ''
    const thin = value.coverage && typeof value.coverage.covered === 'number'
      && value.coverage.covered < value.coverage.required
      && Array.isArray(value.coverage.missing) && value.coverage.missing.length > 0
    const flag = thin
      ? `<p class="daily-flag">${language === 'en' ? 'Thin coverage: missed' : '覆盖不足：漏了'} ${escapeHtml(value.coverage.missing.join('、'))}</p>`
      : ''
    cards.push(`<div class="daily-slot"><div class="daily-label">${label}${model}</div>${flag}<p>${escapeHtml(value.text)}</p></div>`)
  }
  if (cards.length === 0) return ''
  const title = language === 'en' ? 'Daily summary' : '日总结'
  return `<div class="daily-head"><span>${escapeHtml(day)} · ${title}</span></div>${cards.join('')}`
}

function renderPage(template, records, count, date, title, token, language, captureEnabled, gapMinutes, daily) {
  const entries = records.map(publicEntry)
  const gantt = renderGantt(entries, date, (gapMinutes ?? 10) * 60000)
  const dailyHtml = renderDaily(date, daily, language)
  const data = JSON.stringify({ date, count, language, entries, copy: mobileCopy(language), captureEnabled: captureEnabled !== false, gantt: gantt !== '' })
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
  const safeTitle = String(title).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  return template.replaceAll('{{WORKLOG_TITLE}}', safeTitle)
    .replaceAll('{{WORKLOG_TOKEN}}', token)
    .replaceAll('{{WORKLOG_DATA}}', data)
    .replaceAll('{{WORKLOG_GANTT}}', gantt)
    .replaceAll('{{WORKLOG_DAILY}}', dailyHtml)
}

/** Register the read-only Pocket page. The host's App token is format-checked as specified by dsh-plugin-panel. */
export function registerMobile(ctx, store, isCaptureEnabled = () => true, visibleOnly = (records) => records, mergeGapMinutes = () => 10, readDaily = () => null) {
  const web = ctx.webServer ?? ctx.get?.('webServer')
  if (!web || typeof web.register !== 'function') return () => {}
  return web.register({
    kind: 'prefix',
    path: CHANNEL,
    handler(req, res) {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const token = url.searchParams.get('mt') ?? ''
      if (!TOKEN_RE.test(token)) return send(res, 401, '请从 DSH Pocket App 内打开')
      if (url.pathname === `${CHANNEL}/style.css`) {
        try { return send(res, 200, readFileSync(STYLE_FILE, 'utf8'), 'text/css; charset=utf-8') }
        catch { return send(res, 500, '读取移动端样式失败') }
      }
      if (url.pathname !== CHANNEL) return send(res, 404, 'not found')
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed')
      try {
        const date = dayOf()
        const all = visibleOnly(store.readDay(date))
        const records = all.slice(-MAX_MOBILE_ENTRIES).reverse()
        const meta = localeMeta(req.headers?.['accept-language'])
        const template = readFileSync(PAGE_FILE, 'utf8')
        return send(res, 200, renderPage(template, records, all.length, date, meta.title, token, meta.language, isCaptureEnabled(), mergeGapMinutes(), readDaily(date)), 'text/html; charset=utf-8')
      } catch (error) {
        return send(res, 500, `读取工作日志失败：${error instanceof Error ? error.message : String(error)}`)
      }
    },
  })
}

export const mobileInternals = { languageOf, publicEntry, renderPage, localeMeta, mobileCopy }
