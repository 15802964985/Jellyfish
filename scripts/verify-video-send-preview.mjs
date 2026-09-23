/** 视频费用前确认回归：所有写请求被拦截，预览仅用本地夹具，不提交真实生成任务。 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:950}})
let renders=0, writes=0
try {
 await page.route('**/api/**',async route=>{
  const request=route.request(), url=new URL(request.url())
  if(!['GET','OPTIONS'].includes(request.method())) {
   if(url.pathname.endsWith('/video/render')) {
    renders++
    const input=request.postDataJSON()
    await new Promise(resolve=>setTimeout(resolve,350))
    return route.fulfill({json:{data:{execution_prompt:(input.prompt || '原始镜头提示词')+'\n系统补充：保持动作连续',variables_snapshot:{pack:{scene:{name:'测试玄关'},characters:[{name:'测试妈妈'}],props:[{name:'测试童鞋'}],script_excerpt:'本镜头只表现穿鞋动作',action_beats:['蹲下','穿鞋']}}}}})
   }
   writes++; return route.abort()
  }
  const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
  if((response.headers()['content-type']||'').includes('json')) {
   const json=await response.json();if(json.data&&Object.hasOwn(json.data,'duration'))json.data.duration=5
   return route.fulfill({json})
  }
  return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'*'}})
 })
 await page.goto((process.env.JELLYFISH_WEB_URL || 'http://127.0.0.1:7788')+process.env.JELLYFISH_STUDIO_PATH)
 await page.waitForTimeout(1800)
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 const selector=page.locator('.cs-group').filter({has:page.getByText('参考策略',{exact:true})}).locator('.ant-select-selector')
 await selector.click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^首帧/}).click()
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 const edit=page.getByRole('textbox',{name:'视频可编辑提示词',exact:true})
 const final=page.getByRole('textbox',{name:'视频本次发送提示词',exact:true})
 await edit.waitFor()
 assert.ok(await page.getByLabel('本镜头创作目标').getByText('测试玄关',{exact:false}).count())
 await page.getByText('查看本镜头剧情与动作要求',{exact:true}).click()
 await page.getByText('本镜头只表现穿鞋动作',{exact:true}).waitFor()
 assert.equal(await edit.inputValue(),await final.inputValue())
 const submit=page.getByRole('button',{name:'下一步：确认生成费用',exact:true})
 await edit.fill('用户修改后的剧情')
 assert.equal(await submit.isDisabled(),true)
 assert.notEqual(await final.inputValue(),'用户修改后的剧情')
 await page.getByRole('tab',{name:'AI 预检与优化（可选）',exact:false}).click()
 await page.getByText('提示词或参数已变化，请先到').first().waitFor().catch(()=>{})
 await page.getByRole('tab',{name:'提示词与发送预览',exact:true}).click()
 assert.equal(await edit.inputValue(),'用户修改后的剧情')
 await page.getByRole('button',{name:'更新发送预览（免费）',exact:true}).click()
 await page.getByText('发送预览已同步',{exact:true}).waitFor()
 assert.equal(await final.inputValue(),'用户修改后的剧情\n系统补充：保持动作连续')
 assert.equal(await edit.inputValue(),'用户修改后的剧情')
 assert.equal(await submit.isEnabled(),true)
 await page.getByText('查看本次系统补充内容',{exact:true}).click()
 for(const viewport of [{width:1440,height:950},{width:900,height:640},{width:540,height:760}]) {
  await page.setViewportSize(viewport)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth))
  const footer=await page.locator('.cs-prompt-preview .ant-modal-footer').boundingBox()
  assert.ok(footer && footer.y+footer.height <= viewport.height)
 }
 await page.screenshot({path:'local-reports/video-send-preview.png',fullPage:true})
 await page.setViewportSize({width:1440,height:950})
 await submit.click()
 const feeDialog=page.getByRole('dialog').filter({hasText:'生成规格与预计费用'})
 await feeDialog.waitFor()
 const specs=feeDialog.getByRole('combobox')
 if(await specs.count()) assert.equal(await specs.first().isDisabled(),true)
 await feeDialog.getByRole('button',{name:'返回调整',exact:true}).click()
 assert.equal(writes,0)
 console.log(`PASS: edited vs final prompt, free refresh, stale submit blocked, tabs preserve draft, responsive footer; ${renders} mocked renders, zero real writes/billing`)
} finally { await browser.close() }
