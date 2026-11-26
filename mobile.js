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

function renderPage(template, records, count, date, title, token, language, captureEnabled) {
  const data = JSON.stringify({ date, count, language, entries: records.map(publicEntry), copy: mobileCopy(language), captureEnabled: captureEnabled !== false })
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
  const safeTitle = String(title).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
  return template.replaceAll('{{WORKLOG_TITLE}}', safeTitle)
    .replaceAll('{{WORKLOG_TOKEN}}', token)
    .replaceAll('{{WORKLOG_DATA}}', data)
}

/** Register the read-only Pocket page. The host's App token is format-checked as specified by dsh-plugin-panel. */
export function registerMobile(ctx, store, isCaptureEnabled = () => true) {
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
        const all = store.readDay(date)
        const records = all.slice(-MAX_MOBILE_ENTRIES).reverse()
        const meta = localeMeta(req.headers?.['accept-language'])
        const template = readFileSync(PAGE_FILE, 'utf8')
        return send(res, 200, renderPage(template, records, all.length, date, meta.title, token, meta.language, isCaptureEnabled()), 'text/html; charset=utf-8')
      } catch (error) {
        return send(res, 500, `读取工作日志失败：${error instanceof Error ? error.message : String(error)}`)
      }
    },
  })
}

export const mobileInternals = { languageOf, publicEntry, renderPage, localeMeta, mobileCopy }
