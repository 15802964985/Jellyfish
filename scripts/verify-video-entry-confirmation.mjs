/** Check the reported shot in both inspector layouts; never forward model submission. */
import assert from 'node:assert/strict'
import {chromium} from './browser-runner/node_modules/playwright/index.mjs'
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 for(const mode of ['push','overlay','no-api-model']) {
  const page=await browser.newPage({viewport:{width:1500,height:1000}})
  let paidAttempts=0,previews=0,blocked=0;const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(mode=>localStorage.setItem('jellyfish_chapter_studio_layout_v1',JSON.stringify({inspectorOpen:true,inspectorMode:mode,rightWidth:440})),mode)
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url())
   if(!['GET','OPTIONS'].includes(req.method())){
    if(url.pathname.endsWith('/video/render')) {previews++;return route.fulfill({json:{data:{execution_prompt:'隔离验证提示词',variables_snapshot:{pack:{},quality_source_fingerprint:'isolated'}}}})}
    if(url.pathname.includes('/generation-tasks/shots/')&&url.pathname.endsWith('/video'))paidAttempts++
    blocked++;return route.abort()
   }
   if(mode==='no-api-model' && (url.pathname.endsWith('/generation-specification') || url.pathname.endsWith('/video-generation-options')))return route.fulfill({json:{data:null}})
   const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
   if((response.headers()['content-type']||'').includes('json')) {const json=await response.json();if(json.data && Object.hasOwn(json.data,'duration'))json.data.duration=15;return route.fulfill({json})}
   return route.fulfill({response})
  })
  await page.goto((process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:5174')+'/projects/d2b997cc-7522-4a0f-9520-6cf4d609d0fb/chapters/32c0cd76-10e5-454f-b795-a8dfb0068a05/studio',{waitUntil:'domcontentloaded',timeout:60000})
  await page.getByRole('tab',{name:'视频生成',exact:true}).click()
  assert.equal(await page.locator('.ant-segmented').filter({hasText:'API 调用'}).count(),0)
  await page.waitForTimeout(800)
  await page.locator('button:not(.ant-btn-loading)').filter({hasText:'生成视频'}).first().click()
  await page.getByRole('textbox',{name:'视频可编辑提示词',exact:true}).waitFor()
  assert.equal(paidAttempts,0);assert.ok(previews>0)
  const dialog=page.locator('.cs-prompt-preview')
  if(mode==='no-api-model') await dialog.locator('.ant-modal-footer').getByText(/API 模型配置尚未就绪/).waitFor()
  assert.equal(await dialog.locator('.ant-segmented').filter({hasText:'API 调用'}).count(),1)
  await dialog.getByText('平台网页',{exact:true}).click()
  await dialog.getByRole('button',{name:'平台网页生成',exact:true}).click()
  await page.getByRole('dialog').filter({hasText:'平台网页生成 · 模型与账号'}).waitFor()
  assert.equal(paidAttempts,0)
  await page.getByRole('dialog').filter({hasText:'平台网页生成 · 模型与账号'}).locator('.ant-modal-close').click()
  await page.locator('.cs-prompt-preview .ant-modal-close').click()
  assert.equal(paidAttempts,0);assert.deepEqual(errors,[])
  console.log(JSON.stringify({mode,previews,paidAttempts,blocked,errors}))
  await page.unrouteAll({behavior:'wait'})
  await page.close()
 }
} catch(error) {for(const context of browser.contexts())for(const page of context.pages()){console.log((await page.locator('body').innerText()).slice(-6000));await page.screenshot({path:'local-reports/web-reliability/video-entry-failure.png',fullPage:true})}throw error} finally {for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
