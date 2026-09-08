/** Deterministic drawer lifecycle checks; JSX is inspected without claiming real-browser layout validation. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const transpile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const filterExports = {}
vm.runInNewContext(transpile('../src/pages/aiStudio/models/modelOverviewFilters.ts'), { exports: filterExports })
const componentCode = transpile('../src/pages/aiStudio/models/ModelSelectionGuide.tsx')
const flush = () => new Promise(resolve => setImmediate(resolve))

/** Model React state/effect dependency transitions and deferred generated-client calls. */
function harness() {
  const states = [], effects = [], pending = [], requests = []
  let cursor = 0, effectCursor = 0, tree
  const jsx = (type, props) => ({ type, props })
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    },
    useMemo: fn => fn(),
    useEffect(fn, deps) {
      const index = effectCursor++, old = effects[index]
      if (!old || deps.some((value, i) => value !== old.deps[i])) pending.push(() => {
        old?.cleanup?.()
        effects[index] = { deps, cleanup: fn() }
      })
    },
  }
  const exports = {}
  vm.runInNewContext(componentCode, { exports, require: id => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (id === 'antd') return new Proxy({}, { get: (_, key) =>
      key === 'Typography' ? { Paragraph: 'Paragraph', Text: 'Text' } : key })
    if (id.includes('modelOverviewFilters')) return filterExports
    return { LlmService: { getModelOverviewApiV1LlmModelOverviewGet() {
      let resolve, reject
      const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
      const record = { resolve, reject, cancelled: false }
      promise.cancel = () => { record.cancelled = true }
      requests.push(record)
      return promise
    } } }
  } })
  return {
    requests,
    render(open = true) {
      cursor = effectCursor = 0
      tree = exports.default({ open, onClose() {}, onConfigure() {} })
      while (pending.length) pending.shift()()
      return tree
    },
    node(type) {
      const visit = node => {
        if (!node || typeof node !== 'object') return undefined
        if (Array.isArray(node)) return node.map(visit).find(Boolean)
        if (node.type === type) return node
        return visit(node.props?.children)
      }
      return visit(tree)
    },
  }
}
const fixture = { models: [{ key: 'a', model_name: '未配置样例', provider_key: 'jimeng',
  provider_name: '即梦', category: 'video', integration: 'integrated',
  configuration_status: 'not_configured', configurations: [], scenario_keys: ['first_last'] }],
  scenarios: [], notices: [] }

test('initial load renders unconfigured rows and footer pagination', async () => {
  const h = harness()
  h.render()
  h.requests[0].resolve({ data: fixture })
  await flush()
  h.render()
  const tree = h.node('Drawer')
  assert.equal(h.node('Table').props.dataSource.length, 1)
  assert.equal(tree.props.footer.type, 'Pagination')
  assert.equal(tree.props.footer.props.total, 1)
  assert.equal(h.node('Table').props.pagination, false)
})
test('close/reopen cancels obsolete requests and ignores their late response', async () => {
  const h = harness()
  h.render(); h.render(false); h.render(true)
  assert.equal(h.requests.length, 2)
  assert.equal(h.requests[0].cancelled, true)
  h.requests[1].resolve({ data: fixture })
  await flush()
  h.render()
  h.requests[0].resolve({ data: { models: [], scenarios: [], notices: [] } })
  await flush()
  h.render()
  assert.equal(h.node('Table').props.dataSource.length, 1)
  assert.equal(h.node('Table').props.loading, false)
})

test('all four filters have choices and their popups, including page size, outrank the drawer', async () => {
  const h = harness()
  h.render()
  h.requests[0].resolve({ data: { ...fixture, scenarios: [
    { key: 'first_last', title: '首尾帧过渡', requirement: '首尾帧', guidance: '双帧输入' },
  ] } })
  await flush()
  const root = h.render()
  const drawer = h.node('Drawer')
  assert.equal(root.type, 'ConfigProvider')
  assert.ok(root.props.theme.components.Select.zIndexPopup > drawer.props.zIndex)
  assert.equal(drawer.props.footer.type, 'Pagination')
  assert.equal(drawer.props.footer.props.showSizeChanger, true)
  const find = node => !node || typeof node !== 'object' ? [] :
    Array.isArray(node) ? node.flatMap(find) :
      [...(node.type === 'Select' ? [node] : []), ...find(node.props?.children)]
  const selects = find(root)
  assert.equal(selects.length, 4)
  for (const select of selects) assert.ok(select.props.options.length > 1, select.props['aria-label'])
  selects.find(node => node.props['aria-label'] === '生成类型').props.onChange('text')
  h.render()
  assert.equal(h.node('Table').props.dataSource.length, 0)
})
test('failed read stops spinner and retry clears stale data', async () => {
  const h = harness()
  h.render()
  h.requests[0].reject(new Error('offline'))
  await flush()
  h.render()
  assert.equal(h.node('Table').props.loading, false)
  const visitButtons = node => !node || typeof node !== 'object' ? [] :
    Array.isArray(node) ? node.flatMap(visitButtons) :
      [...(node.type === 'Button' ? [node] : []), ...visitButtons(node.props?.children)]
  const retry = visitButtons(h.render()).find(node => node.props.children === '重新读取配置')
  retry.props.onClick()
  h.render(); h.render()
  assert.equal(h.node('Table').props.loading, true)
  assert.equal(h.requests.length, 2)
})
