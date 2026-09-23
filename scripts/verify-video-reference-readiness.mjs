/** Read-only browser regression: visible reference mode drives readiness, including stale responses. */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1050}})
const modes=[]
try {
 await page.route('**/api/**', async route=>{
  const r=route.request(),u=new URL(r.url())
  if(!['GET','OPTIONS'].includes(r.method()))return route.abort()
  if(u.pathname.endsWith('/video-readiness')){
   const mode=u.searchParams.get('reference_mode')||'text_only';modes.push(mode)
   await new Promise(resolve=>setTimeout(resolve,mode==='text_only'?2200:100))
   return route.fulfill({json:{code:200,data:{shot_id:u.pathname.split('/').at(-2),reference_mode:mode,ready:mode==='first',checks:[{key:'model_reference_mode',ok:mode==='first',message:mode==='first'?'首帧参考符合型号要求':'该型号必须使用首帧'}]}}})
  }
  const response=await route.fetch({url:'http://127.0.0.1:8000'+u.pathname+u.search})
  return route.fulfill({response})
 })
 await page.goto((process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:7788')+process.env.JELLYFISH_STUDIO_PATH)
 await page.waitForTimeout(1300)
 const open=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await open.isVisible())await open.click()
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 const selector=page.locator('.cs-group').filter({has:page.getByText('参考',{exact:true})}).locator('.ant-select-selector')
 await selector.click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^首帧$/}).click()
 await page.getByText('当前镜头已满足视频生成条件',{exact:true}).waitFor()
 await page.waitForTimeout(2400)
 assert.ok(modes.includes('first'))
 assert.equal(await page.getByText('当前镜头已满足视频生成条件',{exact:true}).isVisible(),true)
 await selector.hover()
 await selector.locator('..').locator('.ant-select-clear').click()
 await page.getByText('该型号必须使用首帧',{exact:true}).waitFor()
 assert.equal(modes.at(-1),'text_only')
 console.log('PASS: select first immediately checks first; late text_only response ignored; clear checks text_only; no writes, no model calls')
} finally {await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
