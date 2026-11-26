#!/usr/bin/env node
/**
 * Manifest and client smoke check for dsh-worklog.
 *
 * Verifies the fields DSH reads before activation (exports, files, locale,
 * detail documents, icon, patch rows) and that the client module registers its
 * tab type, title and body without touching a real browser.
 *
 *   node scripts/self-check.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0

function check(name, condition, detail) {
  if (condition) console.log(`  ok   ${name}`)
  else {
    failures += 1
    console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`)
  }
}

const pkgPath = join(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

console.log('[manifest]')
check('package name is dsh-worklog', pkg.name === 'dsh-worklog', pkg.name)
check('version is 0.1.0', pkg.version === '0.1.0', pkg.version)
check('type is module', pkg.type === 'module', pkg.type)
check('bundle patch is declared', pkg.dsh?.bundle?.patch === './cordis.patch.yml', JSON.stringify(pkg.dsh?.bundle))
check('client platform is web', pkg.dsh?.client?.platform === 'web', JSON.stringify(pkg.dsh?.client))
check('client inject names two packages', Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length === 2, JSON.stringify(pkg.dsh?.client?.inject))

const exportsMap = pkg.exports ?? {}
check('exports "." exists', exportsMap['.'] !== undefined)
check('exports "./client" exists', exportsMap['./client'] !== undefined)
check('exports "./icon" exists', exportsMap['./icon'] !== undefined)
check('exports "./locale/*.json" exists', exportsMap['./locale/*.json'] !== undefined)
for (const [key, target] of Object.entries(exportsMap)) {
  if (!target.startsWith('./') || target.includes('*')) continue
  check(`exports ${key} target exists`, existsSync(join(root, target)), target)
}

for (const required of ['lib', 'vendor', 'locale/*.json', 'icon.svg', 'cordis.patch.yml', 'docs']) {
  check(`files includes ${required}`, Array.isArray(pkg.files) && pkg.files.includes(required), JSON.stringify(pkg.files))
}
check('keywords contain a Chinese word', (pkg.keywords ?? []).some((word) => /[\u4e00-\u9fff]/.test(word)), JSON.stringify(pkg.keywords))

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
check('patch inserts id = package name', patch.includes(`id: ${pkg.name}`), patch.trim())
check('patch name is the package name, not a path', patch.includes(`name: ${pkg.name}`), patch.trim())

console.log('[locale and detail]')
for (const lang of ['zh', 'en']) {
  const path = join(root, 'locale', `${lang}.json`)
  check(`locale/${lang}.json exists`, existsSync(path))
  const data = JSON.parse(readFileSync(path, 'utf8'))
  check(`locale/${lang}.json has meta.title`, Boolean(data.meta?.title), JSON.stringify(data.meta))
  check(`locale/${lang}.json has meta.description`, Boolean(data.meta?.description))
  const detail = data.meta?.detail
  check(`locale/${lang}.json detail file exists`, typeof detail === 'string' && existsSync(join(root, detail)), String(detail))
}

const svg = readFileSync(join(root, 'icon.svg'), 'utf8')
check('icon is an svg', svg.trimStart().startsWith('<svg'), svg.slice(0, 20))
check('icon uses currentColor', svg.includes('currentColor'))
check('icon is 24x24', svg.includes('viewBox="0 0 24 24"') && svg.includes('width="24"'))
check('icon uses stroke-width 1.8', svg.includes('stroke-width="1.8"'))
check('icon file under 256 KiB', statSync(join(root, 'icon.svg')).size < 256 * 1024)

console.log('[client module]')
let loaded
globalThis.window = { __ModuleLoader__: { load: (spec) => { loaded = spec } } }
await import(pathToFileURL(join(root, 'lib/client.js')).href)
check('client calls the module loader', loaded !== undefined)
check('client id equals the package name', loaded?.id === pkg.name, String(loaded?.id))

const stubs = {
  createElement: (...args) => ({ args }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
}
const module = loaded.factory((name) => {
  if (name === 'react') return stubs
  throw new Error(`unexpected require ${name}`)
})
check('client exports apply', typeof module.apply === 'function')
check('client inject lists slots/sidebarRightTabs/locale', ['slots', 'sidebarRightTabs', 'locale'].every((name) => module.inject.includes(name)), JSON.stringify(module.inject))

const registered = { tabs: [], slots: [], dictionary: null }
const clientCtx = {
  effect(fn) { const disposer = fn(); registered.effects ??= []; registered.effects.push(disposer); return () => {} },
  locale: {
    register(namespace, copy) { registered.dictionary = { namespace, copy }; return () => {} },
    bind: () => (key) => key,
  },
  sidebarRightTabs: {
    register(definition) { registered.tabs.push(definition); return () => {} },
  },
  slots: {
    inject(owner, factory) { registered.slots.push(owner); return factory() },
    register(registration) { registered.slots.push(registration.name); return () => {} },
  },
}
module.apply(clientCtx)
check('client registers one tab type', registered.tabs.length === 1, String(registered.tabs.length))
check('tab id equals the package name', registered.tabs[0]?.id === pkg.name, String(registered.tabs[0]?.id))
check('tab type has a guide entry', Array.isArray(registered.tabs[0]?.guide) && registered.tabs[0].guide.length === 1)
check('tab type declares the extension band', registered.tabs[0]?.priority === 'extension')
const slotNames = [...new Set(registered.slots)]
check('client registers the body and title slots', slotNames.join(',') === 'sidebar.right.pane.tab.title,sidebar.right.pane.tab', slotNames.join(','))
check('client registers a locale dictionary', registered.dictionary?.namespace === pkg.name && Boolean(registered.dictionary.copy.zh) && Boolean(registered.dictionary.copy.en), String(registered.dictionary?.namespace))

console.log('')
if (failures > 0) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
