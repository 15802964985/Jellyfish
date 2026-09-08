/** Exercise the actual gallery loader with isolated generated-client responses. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/pages/aiStudio/chapter/ChapterStudio.tsx'), 'utf8')
const loader = source.slice(source.indexOf('  const loadCardThumbs ='), source.indexOf('  const generateKeyframeCard ='))
const code = ts.transpileModule(loader + '\nexports.load = loadCardThumbs', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

/** Supply only the data owned by the selected shot, without any real network. */
function harness(slot, links = {}) {
  const calls = [], updates = [], epoch = { current: 1 }, exports = {}
  const context = {
    exports, frameRequestEpoch: epoch, selectedShot: { id: 'shot-A' },
    StudioShotFrameImagesService: { listShotFrameImagesApiV1StudioShotFrameImagesGet: async (args) => {
      assert.equal(args.shotDetailId, 'shot-A')
      return { data: { items: slot ? [slot] : [] } }
    } },
    listTaskLinksNormalized: async (args) => { calls.push(args); return links[args.relationType] || [] },
    buildFileDownloadUrl: (id) => '/files/' + id,
    updateCardState: (type, state) => updates.push({ type, ...state }), sleep: async () => {},
  }
  vm.runInNewContext(code, context)
  return { load: exports.load, calls, updates, epoch, context }
}

test('new canonical tasks and legacy history both load without duplicate files', async () => {
  const h = harness({ id: 2, frame_type: 'key', file_id: 'new' }, {
    shot_frame_slot: [{ id: 42, file_id: 'new' }],
    shot_frame_image: [{ id: 40, file_id: 'old' }, { id: 39, file_id: 'new' }],
  })
  await h.load('key')
  assert.deepEqual(h.calls.map(x => x.relationType), ['shot_frame_slot', 'shot_frame_image'])
  assert.ok(h.calls.every(x => x.relationEntityId === '2'))
  assert.equal(h.updates[0].thumbs.map(x => x.fileId).join(','), 'new,old')
})

test('current adopted/uploaded slot is visible even with no task history', async () => {
  const h = harness({ id: 3, frame_type: 'last', file_id: 'uploaded' })
  await h.load('last')
  assert.equal(h.updates[0].thumbs[0].fileId, 'uploaded')
})

test('missing first frame does not borrow a key or another shot image', async () => {
  const h = harness({ id: 2, frame_type: 'key', file_id: 'key' })
  await h.load('first')
  assert.equal(h.calls.length, 0)
  assert.equal(h.updates[0].thumbs.length, 0)
})

test('late response after shot change never overwrites current gallery', async () => {
  const h = harness({ id: 2, frame_type: 'key', file_id: 'old-shot' })
  h.context.listTaskLinksNormalized = async () => { h.epoch.current++; return [] }
  await h.load('key')
  assert.equal(h.updates.length, 0)
})
