import assert from 'node:assert/strict'
import {chromium} from 'file:///C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs'
/** 只读对比服务端有效值与保存表，确保空值隐藏、有效值不丢失。 */
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1366,height:900}})
const errors=[],writes=[]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/**',route=>{if(!['GET','OPTIONS'].includes(route.request().method())){writes.push(route.request().url());return route.abort()}return route.continue()})
try{
 const id='aca3f2bd-f274-4ca6-b530-892a5a57b441',base='http://127.0.0.1:8000/api/v1/studio/creative-directions'
 const record=(await (await page.request.get(`${base}/project/${id}`)).json()).data
 const catalog=(await (await page.request.get(`${base}/catalog`)).json()).data
 const valid=v=>v!=null&&(Array.isArray(v)?v.length>0:typeof v==='string'?Boolean(v.trim()):true)
 const expected=Object.entries(record.effective).filter(([,v])=>valid(v)).map(([k])=>catalog.field_labels[k]||k).sort()
 await page.goto(`http://127.0.0.1:7788/projects/${id}`)
 await page.getByRole('button',{name:'项目创作设定',exact:true}).first().click()
 const drawer=page.getByRole('dialog')
 await drawer.getByText(/^已保存的有效设定与来源/).click()
 const cells=drawer.locator('.ant-table-tbody .ant-table-row td:first-child')
 await cells.first().waitFor()
 assert.deepEqual((await cells.allTextContents()).sort(),expected)
 assert.ok(!(await drawer.locator('.ant-table').innerText()).includes('已清空'))
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[])
 console.log(JSON.stringify({visible_fields:expected,empty_fields_hidden:true,business_writes:0,page_errors:0}))
}finally{await browser.close()}
