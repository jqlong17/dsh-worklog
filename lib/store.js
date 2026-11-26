/**
 * dsh-worklog — the plain-file record store.
 *
 * One NDJSON file per local day, append-only. No database, no index files:
 * every read parses the lines it needs, so the log stays greppable and a
 * restart never loses or rewrites history.
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Hard bounds so one runaway day cannot stall a tool call. */
export const MAX_LINES_PER_READ = 5000
export const MAX_DAYS_PER_SCAN = 120

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/

/** Expand a leading `~` the way the shell would. */
export function expandHome(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return join(homedir(), '.dsh', 'worklog')
  if (text === '~') return homedir()
  if (text.startsWith('~/') || text.startsWith('~' + '\\')) return join(homedir(), text.slice(2))
  return text
}

/** Local calendar day of a Date, as `YYYY-MM-DD`. */
export function dayOf(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** True for a well-formed `YYYY-MM-DD` string. */
export function isDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00`)
  return !Number.isNaN(parsed.getTime()) && dayOf(parsed) === value
}

function parseLine(line) {
  const text = line.trim()
  if (!text) return undefined
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Read access to one worklog directory.
 * @param readSettings - resolves the current settings; called on every access so a live edit applies.
 */
export function createStore(readSettings) {
  const read = () => {
    const current = readSettings() ?? {}
    return {
      storePath: expandHome(current.storePath),
      captureEnabled: current.captureEnabled !== false,
      includeToolCalls: current.includeToolCalls !== false,
      maxSummaryChars: Number(current.maxSummaryChars) > 0 ? Number(current.maxSummaryChars) : 200,
    }
  }

  const root = () => read().storePath
  const fileFor = (day) => join(root(), `${day}.jsonl`)

  /** Every day that has a file, newest first. */
  function listDays() {
    try {
      return readdirSync(root())
        .filter((name) => DAY_FILE.test(name))
        .map((name) => name.slice(0, 10))
        .sort()
        .reverse()
        .slice(0, MAX_DAYS_PER_SCAN)
    } catch {
      return []
    }
  }

  /** Parsed records of one day, oldest first. Unparsable lines are skipped. */
  function readDay(day) {
    if (!isDay(day)) return []
    let text
    try {
      text = readFileSync(fileFor(day), 'utf8')
    } catch {
      return []
    }
    const lines = text.split('\n')
    const from = Math.max(0, lines.length - MAX_LINES_PER_READ)
    const out = []
    for (let index = from; index < lines.length; index += 1) {
      const record = parseLine(lines[index])
      if (record !== undefined) out.push(record)
    }
    return out
  }

  /** Append one record to its day file. Returns the file path. */
  function append(record) {
    const day = isDay(record.date) ? record.date : dayOf()
    const dir = root()
    mkdirSync(dir, { recursive: true })
    const path = fileFor(day)
    appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8')
    return path
  }

  /** Path, today's count, last write time and disk usage for the panel and `worklog_status`. */
  function status() {
    const today = dayOf()
    const days = listDays()
    let bytes = 0
    let lastWrite = ''
    for (const day of days) {
      try {
        const stat = statSync(fileFor(day))
        bytes += stat.size
        if (stat.mtime.toISOString() > lastWrite) lastWrite = stat.mtime.toISOString()
      } catch {
        // A file removed mid-scan is not an error.
      }
    }
    const todayRecords = readDay(today)
    return {
      storePath: root(),
      today,
      todayLines: todayRecords.length,
      days: days.length,
      totalBytes: bytes,
      lastWrite,
      lastRecordTs: todayRecords.length > 0 ? String(todayRecords[todayRecords.length - 1].ts ?? '') : '',
    }
  }

  return { read, root, fileFor, listDays, readDay, append, status }
}
