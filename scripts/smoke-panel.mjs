#!/usr/bin/env node
/**
 * Render the panel component outside the browser.
 *
 * The panel went blank three times from a reference error inside the component:
 * a variable defined in the wrong scope throws on render, React unmounts the
 * subtree, and the user sees an empty tab. Unit tests never execute that code, so
 * this harness loads the client module with a fake host and renders it.
 *
 *   node scripts/smoke-panel.mjs
 */
// Render the panel component with a fake host to catch reference errors.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8')

const noop = () => {}
const makeElement = (type, props, ...children) => ({
  type: typeof type === 'string' ? type : (type && (type.name || 'Component')) || String(type),
  props: props || {},
  children: children.flat(9).filter((child) => child !== null && child !== undefined && child !== false),
})

const React = {
  createElement: makeElement,
  Fragment: 'Fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
  useEffect: noop,
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
}

const payload = {
  ok: true,
  enabled: true,
  range: { from: '2026-11-27', to: '2026-11-27', days: 1 },
  now: '2026-11-27T02:00:00.000Z',
  mergeGapMinutes: 10,
  entries: [],
  topics: [],
  daily: { date: '2026-11-27', hasSummary: true, stale: true, slots: { primary: { text: '今天做了 A', model: 'm', coverage: { required: 3, covered: 1, missing: ['X'] } } }, generatedAt: '' },
  summary: { date: '2026-11-27', slots: { primary: { text: '今天做了 A', model: 'm', coverage: { required: 3, covered: 2, missing: ['X'] } }, secondary: { text: 'B', model: 'n' } } },
  days: [{ date: '2026-11-27', turns: 3, topics: 2, hasSummary: true, stale: false, slots: { primary: { text: 'A', model: 'm' } } }],
  settings: {},
}

let registered = null
globalThis.window = {
  __ModuleLoader__: { load: (spec) => { registered = spec } },
  localStorage: { getItem: () => null, setItem: noop },
  addEventListener: noop,
  removeEventListener: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  innerWidth: 1200,
  innerHeight: 900,
  location: { href: 'http://localhost/' },
}
globalThis.document = { hidden: false, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ appendChild: noop, setAttribute: noop, style: {} }), body: { appendChild: noop } }
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload })

// eslint-disable-next-line no-new-func
new Function('window', 'document', 'fetch', source)(globalThis.window, globalThis.document, globalThis.fetch)

if (registered === null) {
  console.log('FAIL: the module did not register itself')
  process.exit(1)
}

const mod = registered.factory((name) => (name === 'react' ? React : {}))
console.log('module registered:', registered.id)

// Capture the tab body: that is the component that went blank in production.
let panelComponent = null
const rendered = {}
const ctx = {
  effect: (fn) => { try { fn() } catch { /* host services are absent here */ } },
  get: () => undefined,
  slots: {
    inject: (_name, fn) => { try { const out = fn(); return out } catch { return undefined } },
    // Capture the tab body specifically: the first registration is the icon.
    register: (spec, component) => { if (spec?.name === 'sidebar.right.pane.tab' && typeof component === 'function') panelComponent = component; return component },
  },
  locale: {
    register: () => undefined,
    get: () => '/dsh-worklog/locale',
    bind: () => (key) => key,
  },
}
try {
  mod.apply(ctx)
} catch (error) {
  console.log('FAIL: apply threw:', error.message)
  process.exit(1)
}
if (panelComponent === null) {
  console.log('FAIL: the panel component was never registered')
  process.exit(1)
}

/**
 * Render twice: once with every state at its default (the collapsed toolbar) and
 * once with states forced on, which is what exercises the daily card, the settings
 * panel and the by-date list.
 */
function render(label, hooks) {
  const saved = { ...React }
  Object.assign(React, hooks)
  try {
    const tree = panelComponent({ t: (key) => key })
    rendered[label] = tree
    if (tree === undefined || tree === null) {
      console.log(`FAIL: the panel rendered nothing (${label})`)
      process.exit(1)
    }
  } catch (error) {
    console.log(`FAIL: panel render threw (${label}): ${error.message}`)
    process.exit(1)
  } finally {
    Object.assign(React, saved)
  }
}

render('defaults', {})

/**
 * Force specific pieces of state. `nulls`/`booleans` are keyed by the order the
 * hooks are declared in Panel, which is stable enough for a smoke test.
 */
function profile(options) {
  let index = 0
  return {
    useState: (initial) => {
      const position = index
      index += 1
      if (typeof initial === 'function') {
        const value = initial()
        const isView = value === 'gantt' || value === 'session' || value === 'topic' || value === 'date'
        return [isView && options.view ? options.view : value, noop]
      }
      if (typeof initial === 'boolean') return [options.booleans?.[position] ?? false, noop]
      if (initial === null) return [options.nulls?.[position] ?? null, noop]
      return [initial, noop]
    },
  }
}

// data = 0, daily = 6, days = 9 (declaration order in Panel).
render('expanded', profile({ booleans: { 5: true }, nulls: { 0: payload, 6: payload } }))
render('dateView', profile({ nulls: { 0: payload, 9: payload.days }, view: 'date' }))

// The settings panel and the date list are separate components; render them too.
for (const name of ['SettingsPanel']) {
  const component = mod[name]
  if (typeof component !== 'function') continue
  try {
    component({ t: (key) => key, settings: payload.settings ?? {}, error: '', busy: false, onSave: noop, onClose: noop })
  } catch (error) {
    console.log(`FAIL: ${name} threw: ${error.message}`)
    process.exit(1)
  }
}

const hasClass = (node, cls) => {
  if (node === null || node === undefined) return false
  if (Array.isArray(node)) return node.some((child) => hasClass(child, cls))
  if (typeof node !== 'object') return false
  const own = String(node.props?.className ?? '')
  if (own.split(/\s+/).includes(cls)) return true
  return hasClass(node.children, cls)
}
for (const [what, cls, profile] of [['daily card', 'wl-daily', 'expanded'], ['by-date list', 'wl-days', 'dateView']]) {
  if (!hasClass(rendered[profile], cls)) {
    console.log(`FAIL: the ${what} did not render in the ${profile} profile`)
    process.exit(1)
  }
}
console.log('panel render: ok')
