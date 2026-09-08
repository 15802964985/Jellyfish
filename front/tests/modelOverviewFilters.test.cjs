/** Pure overview filtering regressions; no browser, production configuration or paid requests. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/pages/aiStudio/models/modelOverviewFilters.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exportsObject = {}
vm.runInNewContext(code, { exports: exportsObject })
const filter = exportsObject.filterModelOverview
test('choosing a matching account retains the model preset, another provider clears it', () => {
  const item = { model_name: 'hy-image-v3', category: 'image', provider_ids: ['p1', 'p2'] }
  assert.equal(exportsObject.overviewPresetForProvider(item, 'p2').names[0], 'hy-image-v3')
  assert.equal(exportsObject.overviewPresetForProvider(item, 'other'), undefined)
})
const defaults = { scene: '', category: '', provider: '', status: '', search: '' }
const items = [
  { key: '1', provider_key: 'hunyuan', provider_name: '混元', model_name: 'hy-image-v3', category: 'image',
    configuration_status: 'configured', configurations: [{ provider_name: '我的账户' }], scenario_keys: ['concept', 'reference_image'] },
  { key: '2', provider_key: 'jimeng', provider_name: '即梦', model_name: 'video-model', category: 'video',
    configuration_status: 'not_configured', configurations: [], scenario_keys: ['first_last'] },
  { key: '3', provider_key: 'hunyuan', provider_name: '混元', model_name: 'unknown', category: 'video',
    configuration_status: 'needs_attention', configurations: [{ provider_name: '备用账户' }], scenario_keys: [] },
]
test('defaults include unconfigured models', () => assert.equal(filter(items, defaults).length, 3))
test('scene and category filters intersect', () => {
  assert.equal(filter(items, { ...defaults, scene: 'first_last', category: 'image' }).length, 0)
  assert.equal(filter(items, { ...defaults, scene: 'first_last' })[0].key, '2')
})
test('saved includes healthy and incomplete accounts', () => {
  assert.equal(filter(items, { ...defaults, status: 'saved' }).length, 2)
  assert.equal(filter(items, { ...defaults, status: 'not_configured' })[0].key, '2')
})
test('provider and case-insensitive search include account names', () => {
  assert.equal(filter(items, { ...defaults, search: ' HY-IMAGE ' })[0].key, '1')
  assert.equal(filter(items, { ...defaults, provider: 'hunyuan', search: '备用' })[0].key, '3')
})
