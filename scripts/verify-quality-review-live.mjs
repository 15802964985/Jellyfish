/** 正式页面只读验收：历史恢复不提交模型任务，渲染响应仅由本地fixture提供；所有非GET请求绝不转发到服务器。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1050}})
let historyReads=0,blocked=0
try {
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url())
  if(url.pathname.endsWith('/quality-reviews'))historyReads++
  // 所有非GET先终止网络路径；仅本地提供固定渲染文本，绝不发送真实POST。
  if(!['GET','OPTIONS'].includes(r.method())) {
    blocked++
    if(url.pathname.endsWith('/video/render')) return route.fulfill({json:{data:{execution_prompt:'浏览器隔离验收草稿',variables_snapshot:{pack: process.env.VERIFY_PROMPT_LAYOUT ? {action_beat_phases:[{phase:'trigger',text:'动作开始'},{phase:'aftermath',text:'完整动作与尺寸说明'.repeat(70)},{phase:'peak',text:'中间动作'},{phase:'aftermath',text:'动作结束'}]} : {}}}}})
    return route.abort()
  }
  const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
  return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})
 })
 await page.goto((process.env.JELLYFISH_WEB_URL || 'http://127.0.0.1:7788')+process.env.JELLYFISH_STUDIO_PATH)
 await page.waitForTimeout(1800)
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 const selector=page.locator('.cs-group').filter({has:page.getByText('参考',{exact:true})}).locator('.ant-select-selector')
 await selector.click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^首帧$/}).click()
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 await page.getByRole('tab',{name:'AI 预检与优化（可选）',exact:false}).click()
 const summary=page.locator('summary').filter({hasText:'AI 智能预检与提示词优化'})
 await summary.waitFor({timeout:30000})
 await page.getByRole('button',{name:'刷新历史（免费）'}).waitFor()
 await page.getByText('预检建议（事实与推断仍需核对）',{exact:true}).waitFor()
 const before=historyReads;await page.getByRole('button',{name:'刷新历史（免费）'}).click()
 await page.waitForTimeout(700);assert.ok(historyReads>before)
 assert.equal(await page.getByRole('button',{name:'重新预检（调用模型）'}).isDisabled(),true)
 if(process.env.VERIFY_PROMPT_LAYOUT) {
  await page.getByRole('tab',{name:'来源与规则（免费）',exact:true}).click()
  for(const viewport of [{width:1440,height:790},{width:900,height:640}]) {
   await page.setViewportSize(viewport)
   const box=await page.locator('.cs-prompt-preview .ant-modal-footer').boundingBox()
   assert.ok(box && box.y+box.height <= viewport.height)
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth))
   const beat=page.locator('.cs-action-beat').nth(1)
   assert.ok(await beat.evaluate(el=>el.scrollWidth <= el.clientWidth))
  }
  console.log('PASS: long action beats wrap; no horizontal overflow; footer remains visible at 1440x790 and 900x640')
 }
 console.log('PASS: production preview opens; saved legacy report shown; history refresh reads only; paid action requires consent; no model task submitted. Blocked unrelated writes: '+blocked)
} catch(error){console.log((await page.locator('body').innerText()).slice(-2500));throw error}
finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
