/** Real studio UI with all writes intercepted; preserved optimization must survive reopening. */
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from './browser-runner/node_modules/playwright/index.mjs'
const evidence=JSON.parse(await readFile('.local/video-applied-verification.json','utf8'))
const saved=evidence.history.latest_applied.application.prompt
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1500,height:1000}})
let blocked=0,renders=0,compatible=false,lastRender=null,paidAttempts=0
const errors=[];page.on('pageerror',e=>errors.push(e.message))
try {
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(!['GET','OPTIONS'].includes(req.method())){
   if(url.pathname.endsWith('/video/render')){renders++;const body=req.postDataJSON();lastRender=body;return route.fulfill({json:{data:{...evidence.render,execution_prompt:body.prompt||evidence.render.execution_prompt}}})}
   if(url.pathname.includes('/generation-tasks/shots/') && url.pathname.endsWith('/video')) {
    paidAttempts++;assert.equal(req.postDataJSON().execution_prompt,saved)
   }
   blocked++;return route.abort()
  }
  if(compatible && url.pathname.endsWith('/quality-reviews') && url.searchParams.get('scope')==='video'){
   const data=structuredClone(evidence.history),a=data.latest_applied
   a.source_fingerprint=evidence.render.variables_snapshot.quality_source_fingerprint
   a.generation_context={...a.generation_context,model_revision_id:lastRender.model_revision_id,reference_mode:lastRender.reference_mode,image_file_ids:lastRender.image_file_ids,subjects:lastRender.subjects||[],seconds:5,resolution:undefined,generate_audio:undefined}
   a.application.generation_context=a.generation_context;data.items=data.items.map(r=>r.task_id===a.task_id?a:r)
   return route.fulfill({json:{data}})
  }
  const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search});if((response.headers()['content-type']||'').includes('json')){const json=await response.json();if(json.data && Object.hasOwn(json.data,'duration'))json.data.duration=5;return route.fulfill({json})}return route.fulfill({response})
 })
 await page.goto((process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:5174')+'/projects/aca3f2bd-f274-4ca6-b530-892a5a57b441/chapters/77072d93-9584-5d06-bb2e-02a1db0678d7/studio')
 await page.waitForTimeout(2000)
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 const edit=page.getByRole('textbox',{name:'视频可编辑提示词',exact:true})
 const final=page.getByRole('textbox',{name:'视频本次发送提示词',exact:true})
 await edit.waitFor();assert.equal(await edit.inputValue(),saved)
 await page.getByText('已保留历史优化稿，请核对变化',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'下一步：确认生成费用',exact:true}).isDisabled(),true)
 await page.locator('.cs-prompt-preview .ant-modal-footer').getByText(/暂不能继续：.*尚未更新发送预览/).waitFor()
 await page.getByRole('button',{name:'现在更新预览（免费）',exact:true}).click()
 await page.getByText('发送预览已同步',{exact:true}).waitFor()
 assert.equal(await final.inputValue(),saved)
 await page.getByRole('tab',{name:/AI 预检与优化/}).click()
 assert.equal(await page.getByRole('textbox',{name:'优化后提示词',exact:true}).inputValue(),saved)
 await page.getByRole('tab',{name:'提示词与发送预览',exact:true}).click()
 assert.equal(await edit.inputValue(),saved)
 await page.locator('.cs-prompt-preview .ant-modal-close').click()
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 await edit.waitFor();assert.equal(await edit.inputValue(),saved)
 await page.locator('.cs-prompt-preview .ant-modal-close').click()
 compatible=true
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 await edit.waitFor();await page.getByText('本次使用已保存的智能优化稿',{exact:true}).waitFor()
 assert.equal(await edit.inputValue(),saved);assert.equal(await final.inputValue(),saved)
 assert.equal(paidAttempts,0)
 await page.getByRole('button',{name:'下一步：确认生成费用',exact:true}).click()
 const fee=page.getByRole('dialog').filter({hasText:'生成规格与预计费用'})
 await fee.waitFor();assert.equal(paidAttempts,0)
 const finalRequest=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes('/generation-tasks/shots/')&&r.url().endsWith('/video'))
 await fee.getByRole('button',{name:'按此规格生成',exact:true}).click()
 await finalRequest
 await page.waitForTimeout(200)
 assert.equal(paidAttempts,1)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({passed:'real studio restores saved optimization, stale source warning, free refresh, tabs and reopen',renders,blocked,paidAttempts,errors}))
} catch(error) {console.log((await page.locator('body').innerText()).slice(-7000));throw error} finally {await browser.close()}
