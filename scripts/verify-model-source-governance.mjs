/** Read-only production acceptance of source scope and synchronization UI. */
import assert from 'node:assert/strict'
import { chromium } from 'file:///C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs'
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
let writes=0
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
try {
  await page.route('**/api/**',route=>{
    if(!['GET','OPTIONS'].includes(route.request().method())) {writes++;return route.abort()}
    return route.continue()
  })
  await page.goto('http://127.0.0.1:7788/models')
  await page.getByRole('tab',{name:'接口与价格同步',exact:true}).click()
  await page.getByText(/已绑定型号来源/).waitFor()
  const data=await (await page.request.get('http://127.0.0.1:8000/api/v1/llm/model-sync')).json()
  assert.ok(data.data.coverage)
  assert.equal(data.data.scope.filter(s=>s.configured_ids.length).length,7)
  assert.ok(!data.data.sources.some(s=>s.targets.some(t=>t.category==='text'&&t.source_kind==='price')))
  await page.getByText('查看本次检测型号范围（已配置优先）').click()
  await page.getByText('来源覆盖（不等于验收）',{exact:true}).waitFor()
  assert.equal(writes,0)
  assert.deepEqual(errors,[])
  console.log('PASS: production source coverage, 7 configurations, price isolation, read-only UI, no page errors')
} finally {await browser.close()}
