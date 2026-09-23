/** Exercise studio mood persistence and prerequisite actions with intercepted writes only. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1000}})
let saved=[], snapshot=null, fail=false, writes=0
try {
 await page.route('**/api/**', async route=>{
  const request=route.request(), url=new URL(request.url())
  if(url.pathname.includes('/shot-details/') && request.method()==='PATCH' && Object.keys(request.postDataJSON()||{}).length===1 && 'mood_tags' in request.postDataJSON()) {
   writes++
   if(fail)return route.fulfill({status:500,json:{detail:'模拟失败'}})
   saved=request.postDataJSON().mood_tags
   return route.fulfill({json:{code:200,data:{...snapshot,mood_tags:saved},message:'ok'}})
  }
  if(!['GET','OPTIONS'].includes(request.method()))return route.abort()
  const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
  if(url.pathname.includes('/shot-details/') && !url.pathname.includes('frame')) {
   const body=await response.json()
   if(body.data && 'mood_tags' in body.data){ snapshot=body.data; body.data.mood_tags=saved; return route.fulfill({json:body}) }
  }
  if(url.pathname.includes('video-readiness')){
   const body=await response.json(); if(body.data){body.data.ready=false;body.data.checks=[{key:'duration_ready',ok:false,message:'请先配置镜头时长'},{key:'reference_frames_ready',ok:false,message:'缺少参考帧：first'}];return route.fulfill({json:body})}
  }
  return route.fulfill({response})
 })
 const target=(process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:7788')+process.env.JELLYFISH_STUDIO_PATH
 await page.goto(target)
 await page.waitForTimeout(1500)
 const open=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await open.isVisible())await open.click()
 await page.getByRole('tab',{name:'生成参数',exact:true}).click()
 const select=page.locator('.ant-select[aria-label="当前镜头情绪标签"]')
 await select.locator('.ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^温馨$/}).click()
 await page.waitForFunction(()=>document.body.innerText.includes('已选择 1 项'))
 assert.deepEqual(saved,['温馨'])
 await select.locator('input').fill('释然');await page.keyboard.press('Enter');await page.keyboard.press('Escape')
 await page.waitForFunction(()=>document.body.innerText.includes('已选择 2 项'))
 assert.deepEqual(saved,['温馨','释然'])
 await page.reload();await page.waitForTimeout(1500);if(await open.isVisible())await open.click();await page.getByRole('tab',{name:'生成参数',exact:true}).click()
 await select.locator('.ant-select-selection-item').filter({hasText:'温馨'}).locator('.ant-select-selection-item-remove').click()
 await page.waitForFunction(()=>document.body.innerText.includes('已选择 1 项'));assert.deepEqual(saved,['释然'])
 fail=true
 await select.hover();await select.locator('.ant-select-clear').click()
 await page.getByText('情绪标签保存失败，已恢复原选择，请重试。').waitFor();assert.deepEqual(saved,['释然'])
 fail=false
 await select.hover();await select.locator('.ant-select-clear').click()
 await page.getByText('未设置情绪标签，保留剧本原有表达').waitFor();assert.deepEqual(saved,[])
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 await page.getByText('请先配置镜头时长',{exact:true}).waitFor();await page.getByText('缺少参考帧：首帧',{exact:true}).waitFor()
 await page.getByRole('button',{name:'设置镜头时长'}).click();assert.equal(await page.getByRole('tab',{name:'生成参数',exact:true}).getAttribute('aria-selected'),'true')
 await page.getByRole('tab',{name:'视频生成',exact:true}).click();await page.getByRole('button',{name:'检查关键帧与参考图'}).click();assert.equal(await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).getAttribute('aria-selected'),'true')
 console.log('PASS: selection/custom/remove/clear/reopen/failure rollback; concrete readiness and navigation; simulated mood writes '+writes+', real writes 0')
} finally {await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
