/** Deterministic hook lifecycle tests; no browser, network or billable model calls. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/pages/aiStudio/components/useGenerationCompletion.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

/** Replace React scheduling and the generated client to exercise polling deterministically. */
function harness(read, settled) {
  let cleanup
  const timers = []
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    require: (id) => id === 'react'
      ? { useRef: (current) => ({ current }), useEffect: (fn) => { cleanup = fn() } }
      : { FilmService: { getTaskStatusApiV1FilmTasksTaskIdStatusGet: read } },
    setTimeout: (fn, delay) => { assert.equal(delay, 10000); timers.push(fn); return fn },
    clearTimeout: (fn) => { const index = timers.indexOf(fn); if (index >= 0) timers.splice(index, 1) },
  })
  exports.useGenerationCompletion('task-1', () => {}, settled)
  return { timers, cleanup }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('continues beyond 60 seconds and refreshes once at completion', async () => {
  let reads = 0
  let refreshed = 0
  const h = harness(async () => ({ data: { status: ++reads > 8 ? 'succeeded' : 'running' } }), async () => { refreshed++ })
  await flush()
  for (let i = 0; i < 8; i++) { h.timers.shift()(); await flush() }
  assert.equal(reads, 9)
  assert.equal(refreshed, 1)
  assert.equal(h.timers.length, 0)
  h.cleanup()
})

test('retries transient status and terminal refresh failures', async () => {
  let reads = 0
  let refreshes = 0
  const h = harness(async () => {
    if (++reads === 1) throw new Error('temporary network failure')
    return { data: { status: 'succeeded' } }
  }, async () => { if (++refreshes === 1) throw new Error('temporary image read failure') })
  await flush()
  h.timers.shift()(); await flush()
  h.timers.shift()(); await flush()
  assert.equal(refreshes, 2)
  assert.equal(h.timers.length, 0)
  h.cleanup()
})

test('unmount ignores a late status response', async () => {
  let resolve
  let refreshed = false
  const h = harness(() => new Promise((done) => { resolve = done }), async () => { refreshed = true })
  h.cleanup()
  resolve({ data: { status: 'succeeded' } })
  await flush()
  assert.equal(refreshed, false)
  assert.equal(h.timers.length, 0)
})
