import assert from 'node:assert/strict'
import { chromium } from 'file:///C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs'
const browser = await chromium.launch({channel:'msedge',headless:true})
const page = await browser.newPage({viewport:{width:1440,height:1000}})
const errors=[]
let writes=0
page.on('pageerror',e=>errors.push(e.message))
try {
  await page.route('**/api/**',route=>{
    if(!['GET','OPTIONS'].includes(route.request().method())) {writes++;return route.abort()}
    return route.continue()
  })
  const catalog=await (await page.request.get('http://127.0.0.1:8000/api/v1/studio/generation-tasks/video-edit-models')).json()
  for(const name of ['happyhorse-1.1-i2v','doubao-seedance-1.5-pro']) {
    const model=catalog.data.models.find(item=>item.model_name===name)
    assert.ok(model && !model.available)
    assert.match(model.reason,/型号不适用/)
    assert.ok(model.source_url.startsWith('https://'))
  }
  const overview=await (await page.request.get('http://127.0.0.1:8000/api/v1/llm/model-overview?domestic_only=false')).json()
  const saved=overview.data.models.find(item=>item.model_name==='happyhorse-1.1-i2v')
  assert.equal(saved.mode_contracts.find(mode=>mode.key==='edit').implementation,'unverified')
  assert.equal(saved.mode_contracts.find(mode=>mode.key==='image_video').implementation,'integrated')
  const schema=await (await page.request.get('http://127.0.0.1:8000/openapi.json')).json()
  assert.ok(!Object.keys(schema.paths).some(path=>path.includes('account-quota')))
  await page.goto('http://127.0.0.1:7788/models')
  await page.getByRole('tab',{name:'模型',exact:true}).click()
  await page.getByText('场景选型说明',{exact:true}).first().click()
  await page.getByRole('dialog').last().waitFor()
  await page.locator('.ant-table-row-expand-icon').first().click()
  await page.getByText('本地参数约束（当前模式）',{exact:true}).first().waitFor()
  await page.waitForTimeout(400)
  await page.screenshot({path:'E:/JellyfishNew/.local/generation-overview-deployed.png'})
  await page.locator('.ant-drawer-close').last().click()
  assert.equal(await page.getByRole('button',{name:'额度与预算',exact:true}).count(),0)
  await page.locator('.ant-table-row button').filter({has:page.locator('[aria-label="edit"]')}).first().click()
  await page.getByText('编辑模型',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'额度与预算',exact:true}).count(),0)
  assert.equal(writes,0)
  assert.deepEqual(errors,[])
  console.log('PASS deployed API: exact editing exclusions, official links, operation contracts, manual quota removed, readonly model UI')
} finally { await browser.close() }
