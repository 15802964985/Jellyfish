import assert from 'node:assert/strict'
import { chromium } from 'file:///C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs'
/** 正式只读验收：只允许GET及免费模板预览，不创建造型或调用模型。 */
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1366,height:900}})
const errors=[],writes=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/**',route=>{
  const r=route.request()
  if(!['GET','OPTIONS'].includes(r.method())&&!(r.method()==='POST'&&r.url().endsWith('/creative-directions/template-preview'))){writes.push(r.url());return route.abort()}
  return route.continue()
})
try{
  const base='http://127.0.0.1:8000/api/v1/studio'
  const get=async path=>{const r=await page.request.get(base+path);assert.equal(r.status(),200);return (await r.json()).data}
  const roles=await get('/creative-directions/context-options/character')
  assert.ok(roles.length)
  const role=await get('/entities/character/'+roles[0].value)
  await page.goto(`http://127.0.0.1:7788/projects/${role.project_id}/roles/${roles[0].value}/edit`)
  await page.getByText('角色造型版本',{exact:true}).waitFor()
  await page.getByRole('button',{name:'新建造型版本',exact:true}).click()
  const modal=page.getByRole('dialog')
  await modal.getByText('造型名称',{exact:true}).waitFor()
  await modal.getByRole('button',{name:/取\s*消/}).click()
  const templates=await get('/prompts?page=1&page_size=10')
  await page.goto('http://127.0.0.1:7788/prompts')
  await page.getByText(templates.items[0].name,{exact:true}).first().click()
  await page.getByText('绑定业务对象试渲染（免费）',{exact:true}).click()
  await page.getByRole('combobox',{name:'模板上下文对象'}).click()
  const option=page.locator('.ant-select-item-option-content').first()
  await option.waitFor();await option.click()
  const preview=page.waitForResponse(r=>r.url().endsWith('/creative-directions/template-preview')&&r.request().method()==='POST')
  await page.getByRole('button',{name:'免费试渲染',exact:true}).click()
  const response=await preview;assert.equal(response.status(),200)
  const payload=await response.json();assert.ok(payload.data.direction.fingerprint);assert.ok(payload.data.template_version)
  await page.getByText('本次实际变量与设定来源',{exact:true}).waitFor()
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
  console.log(JSON.stringify({role_version_entry:true,template_context_trial:true,page_errors:errors,business_writes:writes,model_calls:0}))
}finally{await browser.close()}
