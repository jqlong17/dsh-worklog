#!/usr/bin/env node
/**
 * Smoke-render the Gantt component outside the browser.
 *
 * It pulls the component out of lib/client.js, runs it with a fake React and the
 * newest day of real records, and prints one line per session. This is what
 * caught a `gapMs is not defined` ReferenceError that blanked the whole panel —
 * the unit tests never execute that code path.
 *
 *   node scripts/smoke-gantt.mjs [YYYY-MM-DD]
 */
import { existsSync, readFileSync } from "node:fs"
const React = { useState: (v) => [typeof v === "function" ? v() : v, () => {}], useRef: () => ({ current: null }), useEffect: () => {}, Fragment: "Fragment" }
const h = (type, props, ...children) => ({ type: typeof type === "string" ? type : (type.name || String(type)), props: props || {}, children: children.flat(9).filter((c) => c !== null && c !== undefined && c !== false) })
const clock = (ts) => (typeof ts === "string" && ts.length >= 16 ? new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "--:--")
const fmt = (t, key, vars) => (t(key) || "").replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""))
const copy = { "gantt.empty":"x","topic.hint":"h","gantt.time":"时间","gantt.now":"now","gantt.nowLine":"现在","gantt.underMinute":"<1m","gantt.foot":"{n}","gantt.untitled":"未命名","gantt.topicCount":"{n} 个主题","gantt.latest":"最近：","meta.turns":"{n} 条" }
const t = (k) => copy[k] || k
    function Gantt(props) {
      const t = props.t
      const day = props.day
      const entries = Array.isArray(props.entries) ? props.entries : []
      const GAP_CAP = 45 * 60 * 1000
      // One day is drawn at 6 px/min (an hour is 360 px); a range falls back to a
      // per-day scale, otherwise a week would be a 60 000 px canvas.
      const span = props.range && props.range.from ? props.range : { from: day, to: day }
      const rangeStart = new Date(`${span.from}T00:00:00`).getTime()
      const rangeEnd = new Date(`${span.to}T00:00:00`).getTime() + 86400000
      const spanMs = Math.max(3600000, rangeEnd - rangeStart)
      const singleDay = spanMs <= 2 * 86400000
      const pxPerMs = singleDay ? 6 / 60000 : 90 / 86400000
      const trackWidth = Math.max(720, Math.round(spanMs * pxPerMs))
      const [hover, setHover] = React.useState(null)
      const now = Number.isFinite(props.now) ? props.now : Date.now()
      const live = Boolean(props.live && props.live.tracked > 0)
      // Only affects how a topic's segments are drawn, never how many rows there are.
      const gapMs = Math.max(0, Number(props.mergeGapMinutes) || 0) * 60000

      const bySession = new Map()
      for (const entry of entries) {
        if (typeof entry.ts !== 'string' || entry.ts === '') continue
        const id = entry.sessionId || ''
        if (!bySession.has(id)) bySession.set(id, [])
        bySession.get(id).push(entry)
      }
      let newestSession = ''
      let newestTs = ''
      for (const [id, list] of bySession) {
        const last = list.reduce((best, entry) => (entry.ts > best ? entry.ts : best), '')
        if (last > newestTs) {
          newestTs = last
          newestSession = id
        }
      }

      // Sessions are the outer level: a topic id is only unique inside a session.
      // Topics are the only level below it — there is no stage entity.
      const blocks = []
      for (const [sessionId, list] of bySession) {
        list.sort((left, right) => String(left.ts).localeCompare(String(right.ts)))
        const block = { sessionId, title: '', summary: '', topics: new Map(), first: 0, last: 0, segments: [] }
        for (const [index, entry] of list.entries()) {
          const start = new Date(entry.ts).getTime()
          if (!Number.isFinite(start)) continue
          if (!block.title && entry.sessionTitle) block.title = String(entry.sessionTitle)
          if (!block.summary && typeof entry.summary === 'string') block.summary = entry.summary
          if (!block.first || start < block.first) block.first = start
          if (start > block.last) block.last = start
          const topic = typeof entry.topic === 'string' ? entry.topic.trim() : ''
          if (topic === '') continue
          const next = index + 1 < list.length ? new Date(list[index + 1].ts).getTime() : Number.NaN
          let stop
          if (Number.isFinite(next)) stop = Math.min(next, start + GAP_CAP)
          else if (live && sessionId === newestSession) stop = Math.min(now, start + GAP_CAP)
          else stop = start
          const key = topic.toLowerCase().replace(/[\s，。、,.:：;；!！?？"'“”‘’（）()【】\[\]<>《》\-—_/\\|]+/g, '')
          let row = block.topics.get(key)
          if (row === undefined) {
            row = { key: `${sessionId}#${key}`, topic, segments: [], turns: 0, first: start, total: 0, ongoing: false }
            block.topics.set(key, row)
          }
          row.turns += 1
          row.total += Math.max(0, stop - start)
          if (start < row.first) row.first = start
          // Nothing can have happened after this moment; a later timestamp is clock
          // skew between host and browser, and drawing it past "now" reads as a bug.
          if (stop > now) stop = now
          if (stop > start) row.segments.push([start, stop, typeof entry.summary === 'string' ? entry.summary : ''])
          if (!Number.isFinite(next) && live && sessionId === newestSession) row.ongoing = true
        }

        if (block.topics.size > 0) {
          block.topics = [...block.topics.values()].sort((left, right) => left.first - right.first)
          blocks.push(block)
        }
      }
      blocks.sort((left, right) => left.first - right.first)
      const rows = blocks.flatMap((block) => block.topics)
      const list = blocks
      const flat = rows

      /** clock() wants an ISO string; the timeline works in epoch ms. */
      const stamp = (ms) => new Date(ms).toISOString()
      const clip = (text, max) => (String(text).length <= max ? String(text) : `${String(text).slice(0, max - 1)}…`)
      /**
       * Hover text: topic, span, then the line this turn earned. Native titles
       * keep it dependency-free and work with a trackpad as well as a mouse.
       */
      const tip = (title, from, to, summary) => [
        title,
        `${clock(stamp(from))}–${clock(stamp(to))} · ${fmtDuration(t, to - from)}`,
        summary ? clip(summary, 160) : '',
      ].filter(Boolean).join('\n')
      /** Session card: span, volume, the topics it contains and the last line. */
      const sessionTip = (block) => {
        const turns = block.topics.reduce((total, row) => total + row.turns, 0)
        const lastRow = block.topics[block.topics.length - 1]
        const lastSegment = lastRow && lastRow.segments.length > 0 ? lastRow.segments[lastRow.segments.length - 1] : null
        return [
          block.title || t('gantt.untitled'),
          `${clock(stamp(block.first))}–${clock(stamp(block.last))} · ${fmtDuration(t, block.last - block.first)} · ${fmt(t, 'gantt.topicCount', { n: block.topics.length })} · ${fmt(t, 'meta.turns', { n: turns })}`,
          ...block.topics.slice(0, 6).map((row) => `· ${row.topic} ${fmtDuration(t, row.total)}`),
          lastSegment && lastSegment[2] ? `${t('gantt.latest')} ${clip(lastSegment[2], 90)}` : '',
        ].filter(Boolean).join('\n')
      }
      /** Topic card: its own span and the last two turns that built it. */
      const topicTip = (row) => {
        const ends = row.segments.map((segment) => segment[1])
        const last = ends.length === 0 ? row.first : Math.max(...ends)
        return [
          row.topic,
          `${clock(stamp(row.first))}–${clock(stamp(last))} · ${fmtDuration(t, row.total)} · ${fmt(t, 'meta.turns', { n: row.turns })}`,
          ...row.segments.slice(-2).map((segment) => `${clock(stamp(segment[0]))} ${clip(segment[2] || '', 80)}`),
        ].filter(Boolean).join('\n')
      }
      /**
       * Join segments that follow each other within `gapMs`.
       *
       * A topic interrupted by a one-minute pause should read as one stretch, not
       * as confetti; the setting only affects drawing, never the row count.
       */
      const mergeSegments = (segments, gap) => {
        const sorted = [...segments].sort((left, right) => left[0] - right[0])
        const out = []
        for (const segment of sorted) {
          const last = out[out.length - 1]
          if (last !== undefined && gap > 0 && segment[0] - last[1] <= gap) {
            last[1] = Math.max(last[1], segment[1])
            last[2] = segment[2] || last[2]
            continue
          }
          out.push([segment[0], segment[1], segment[2]])
        }
        return out
      }

      /** Show a card above `element`, anchored so it stays inside the panel. */
      const showTip = (element, text) => {
        const box = element.getBoundingClientRect()
        const width = Math.min(340, typeof window === 'undefined' ? 340 : window.innerWidth - 24)
        const centre = box.left + box.width / 2
        const view = typeof window === 'undefined' ? { innerWidth: 1200, innerHeight: 900 } : window
        // Keep the card inside the window: clamp on x, and flip below the row when
        // there is not enough room above it.
        const x = Math.min(Math.max(centre, width / 2 + 12), view.innerWidth - width / 2 - 12)
        const above = box.top >= 96
        setHover({ text, x, y: above ? box.top : box.bottom, below: !above })
      }
      // Accepts a timestamp string or an epoch number.
      const x = (value) => {
        const at = typeof value === 'number' ? value : new Date(value).getTime()
        return Math.max(0, Math.min(trackWidth, (at - rangeStart) * pxPerMs))
      }
      // Opening at 00:00 would hide everything the user came to see.
      const scrollRef = React.useRef(null)
      // Park once per range, and only after the rows exist: when the view mounts
      // before the first fetch lands there is nothing to park on, and a one-shot
      // effect would leave the timeline sitting at 00:00 for the rest of the day.
      const parkedFor = React.useRef('')
      React.useEffect(() => {
        const element = scrollRef.current
        if (element === null || flat.length === 0) return
        const key = `${span.from}|${span.to}`
        if (parkedFor.current === key) return
        parkedFor.current = key
        const lastEnd = flat.reduce((best, row) => Math.max(best, ...row.segments.map((segment) => segment[1]), row.first), rangeStart)
        element.scrollLeft = Math.max(0, LABEL_W + x(lastEnd) - element.clientWidth * 0.72)
      }, [span.from, span.to, flat.length])

      // Everything starts expanded; the header still collapses a session when the
      // day gets long. `null` means "no explicit choice yet".
      const [expanded, setExpanded] = React.useState(null)
      const allIds = blocks.map((block) => block.sessionId)
      const isOpen = (block) => (expanded === null ? true : expanded.has(block.sessionId))
      const toggleBlock = (block) => {
        setExpanded((previous) => {
          const next = new Set(previous === null ? allIds : previous)
          if (next.has(block.sessionId)) next.delete(block.sessionId)
          else next.add(block.sessionId)
          return next
        })
      }

      if (list.length === 0) {
        return h('div', { className: 'wl-empty' }, t('gantt.empty'), h('p', { className: 'wl-empty-hint' }, t('topic.hint')))
      }

      const ticks = []
      if (singleDay) {
        for (let hour = 0; hour < 24; hour += 1) {
          ticks.push(h('span', {
            className: 'wl-gantt-tick',
            key: hour,
            'data-major': hour % 2 === 0 ? 'true' : 'false',
            style: { left: `${hour * 60 * 60000 * pxPerMs}px` },
          }, String(hour).padStart(2, '0')))
        }
      } else {
        const days = Math.round(spanMs / 86400000)
        const step = Math.max(1, Math.ceil(days / 24))
        for (let index = 0; index < days; index += step) {
          const at = rangeStart + index * 86400000
          ticks.push(h('span', {
            className: 'wl-gantt-tick',
            key: at,
            'data-major': 'true',
            style: { left: `${index * 86400000 * pxPerMs}px` },
          }, `${String(new Date(at).getMonth() + 1).padStart(2, '0')}-${String(new Date(at).getDate()).padStart(2, '0')}`))
        }
      }
      const merged = (() => {
        const spans = flat.flatMap((row) => row.segments).sort((left, right) => left[0] - right[0])
        let total = 0
        let cursor = -Infinity
        let end = -Infinity
        for (const [from, to] of spans) {
          if (from > end) {
            if (end > cursor) total += end - cursor
            cursor = from
            end = to
          } else if (to > end) {
            end = to
          }
        }
        if (end > cursor) total += end - cursor
        return total
      })()
      const elapsed = Math.max(1, Math.min(now, rangeEnd) - rangeStart)

      return h('div', { className: 'wl-gantt', ref: scrollRef },
        h('div', { className: 'wl-gantt-canvas', style: { width: `${LABEL_W + trackWidth}px` } },
          h('div', { className: 'wl-gantt-row wl-gantt-axis' },
            h('span', { className: 'wl-gantt-label' }, t('gantt.time')),
            h('span', { className: 'wl-gantt-track', style: { width: `${trackWidth}px`, backgroundSize: `${singleDay ? 360 : 90}px 100%` } }, ticks),
          ),
          blocks.map((block) => h(React.Fragment, { key: block.sessionId },
            h('div', {
              className: 'wl-gantt-row wl-gantt-session',
              role: 'button',
              tabIndex: 0,
              'aria-expanded': isOpen(block) ? 'true' : 'false',
              onClick: () => toggleBlock(block),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  toggleBlock(block)
                }
              },
            },
              h('span', {
                className: 'wl-gantt-label',
                'aria-label': sessionTip(block),
                onMouseEnter: (event) => showTip(event.currentTarget, sessionTip(block)),
                onMouseLeave: () => setHover(null),
              },
                h('span', { className: 'wl-gantt-name' },
                  `${isOpen(block) ? '▾' : '▸'} ${block.title || t('gantt.untitled')}`),
                h('span', { className: 'wl-gantt-meta' }, fmt(t, 'gantt.topicCount', { n: block.topics.length }))),
              h('span', { className: 'wl-gantt-track', style: { width: `${trackWidth}px`, backgroundSize: `${singleDay ? 360 : 90}px 100%` } },
                Math.min(block.last, now) > block.first
                  ? h('span', {
                    className: 'wl-gantt-band',
                    style: {
                      left: `${x(block.first)}px`,
                      width: `${Math.max(3, x(Math.min(block.last, now)) - x(block.first))}px`,
                    },
                  })
                  : null)),
            (isOpen(block) ? block.topics : []).map((row) => {
              const drawn = mergeSegments(row.segments, gapMs)
              const bars = drawn.length === 0
                ? [h('span', {
                  className: 'wl-gantt-bar',
                  'data-ongoing': row.ongoing ? 'true' : 'false',
                  key: 'empty',
                  style: { left: `${x(Math.min(row.first, now))}px`, width: '3px' },
                  'aria-label': topicTip(row),
                  onMouseEnter: (event) => showTip(event.currentTarget, topicTip(row)),
                  onMouseLeave: () => setHover(null),
                })]
                : drawn.map((segment, index) => {
                  const text = tip(row.topic, segment[0], segment[1], segment[2])
                  return h('span', {
                    className: 'wl-gantt-bar',
                    'data-ongoing': row.ongoing && index === drawn.length - 1 ? 'true' : 'false',
                    key: segment[0],
                    style: { left: `${x(segment[0])}px`, width: `${Math.max(3, x(segment[1]) - x(segment[0]))}px` },
                    'aria-label': text,
                    onMouseEnter: (event) => showTip(event.currentTarget, text),
                    onMouseLeave: () => setHover(null),
                  })
                })
              return h('div', { className: 'wl-gantt-row wl-gantt-topic', key: row.key },
                h('span', {
                  className: 'wl-gantt-label',
                  'aria-label': topicTip(row),
                  onMouseEnter: (event) => showTip(event.currentTarget, topicTip(row)),
                  onMouseLeave: () => setHover(null),
                },
                  h('span', { className: 'wl-gantt-name' }, row.topic),
                  h('span', { className: 'wl-gantt-meta' }, fmtDuration(t, row.total))),
                h('span', { className: 'wl-gantt-track', style: { width: `${trackWidth}px`, backgroundSize: `${singleDay ? 360 : 90}px 100%` } },
                  bars),
              )
            }),
          )),
          hover === null ? null : h('div', {
            className: 'wl-gantt-tip',
            'data-below': hover.below ? 'true' : 'false',
            style: { left: `${hover.x}px`, top: `${hover.y}px` },
          }, hover.text),
          now > rangeStart && now < rangeEnd
            ? h('span', { className: 'wl-gantt-now', style: { left: `${LABEL_W + x(now)}px` } },
              h('span', { className: 'wl-gantt-now-label' }, t('gantt.nowLine')))
            : null,
        ),
        h('div', { className: 'wl-gantt-foot' },
          fmt(t, 'gantt.foot', {
            n: flat.length,
            covered: fmtDuration(t, merged),
            share: merged === 0 ? 0 : Math.round((merged / elapsed) * 100),
          })),
      )
    }

    const LABEL_W = 210

    /** `1h 20m` / `35m`, deliberately short: it sits under the topic name. */
    function fmtDuration(t, ms) {
      const minutes = Math.max(0, Math.round(ms / 60000))
      if (minutes < 1) return t('gantt.underMinute')
      const hours = Math.floor(minutes / 60)
      return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % 60}m`
    }

const day = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const file = `${process.env.HOME}/.dsh/worklog/${day}.jsonl`
if (!existsSync(file)) { console.log(`no log for ${day}`); process.exit(0) }
const records = readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse)
const entries = records.map((r) => ({ ts: r.ts, sessionId: r.sessionId, topic: r.topic, sessionTitle: r.sessionTitle, summary: r.summary }))
const tree = Gantt({ t, entries, day, range: { from: day, to: day }, mergeGapMinutes: 10, now: Date.now(), live: { tracked: 0 } })
if (tree.props.className === "wl-empty") { console.log("EMPTY STATE"); process.exit(0) }

const text = (node) => {
  if (node === null || node === undefined) return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(text).join("")
  if (node.children) return text(node.children)
  return ""
}

let total = 0
for (const frag of tree.children[0].children.filter((c) => c.type === "Fragment")) {
  const session = frag.children[0]
  const topics = frag.children.slice(1)
  total += topics.length
  const names = topics.map((row) => text(row).replace(/\s+/g, " ").trim())
  if (names.some((name) => name === "")) throw new Error("a topic row rendered without text")
  console.log(text(session).replace(/\s+/g, " ").trim().padEnd(20), "主题行", String(topics.length).padStart(2), "|", names.join(" ‖ ").slice(0, 110))
}
console.log(`\n合计主题行 ${total}`)
