/** 默认回填、跨标签最新设置和收费前冻结；所有写请求本地模拟，绝不调用真实供应商。 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({channel:'msedge',headless:true})
const page = await browser.newPage({viewport:{width:1500,height:1000}})
const base = process.env.JELLYFISH_WEB_URL || 'http://127.0.0.1:5174'
let defaultId='sync-default', blocked=0, patches=[], renders=[], submitted=[], checks=[], failSave=false
const details=new Map(), metadata=new Map()
/** 返回各镜头独立的可变服务端夹具，模拟真实提交后才可读的新值。 */
const detailFor=id=>{if(!details.has(id))details.set(id,{id,duration:16,camera_shot:'MS',angle:'EYE_LEVEL',movement:'STATIC',override_video_ratio:null,mood_tags:[],atmosphere:'原气氛',follow_atmosphere:false});return details.get(id)}
try {
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname
  if(/^\/api\/v1\/studio\/shots\/[0-9a-f-]{36}$/.test(path)) {
   const id=path.split('/').at(-1)
   if(!metadata.has(id)) metadata.set(id,(await fetch('http://127.0.0.1:8000'+path).then(r=>r.json())).data)
   if(req.method()==='PATCH') { const patch=req.postDataJSON(); await new Promise(r=>setTimeout(r,450)); metadata.set(id,{...metadata.get(id),...patch}) }
   return route.fulfill({json:{data:metadata.get(id)}})
  }
  if(/^\/api\/v1\/studio\/shot-details\/[^/]+$/.test(path)) {
   const id=path.split('/').at(-1)
   if(req.method()==='PATCH') {
    const patch=req.postDataJSON();patches.push({id,patch});await new Promise(r=>setTimeout(r,900))
    if(failSave)return route.fulfill({status:500,json:{detail:'模拟保存失败'}})
    details.set(id,{...detailFor(id),...patch})
   }
   return route.fulfill({json:{data:detailFor(id)}})
  }
  if(!['GET','OPTIONS'].includes(req.method())) {
   if(path.endsWith('/video/render')) {const body=req.postDataJSON();renders.push({body,detail:{...detailFor(path.split('/').at(-3))}});return route.fulfill({json:{data:{execution_prompt:`本次时长 ${renders.at(-1).detail.duration} 秒；${body.prompt || '人物行走'}`,variables_snapshot:{pack:{characters:[],props:[],action_beats:[]}}}}})}
   if(path.endsWith('/video')&&path.includes('generation-tasks')) {submitted.push(req.postDataJSON());return route.fulfill({json:{data:{task_id:'sync-fixture-task'}}})}
   blocked++;return route.abort()
  }
  if(path.endsWith('/model-settings'))return route.fulfill({json:{data:{default_video_model_id:defaultId}}})
  if(path.endsWith('/video-generation-options'))return route.fulfill({json:{data:{model_id:url.searchParams.get('model_id')||defaultId,model_name:'viduq2',provider:'vidu',allowed_ratios:['16:9','9:16'],default_ratio:'16:9',supports_first_frame:true,supports_last_frame:true,supports_text_to_video:true,max_key_frames:0,min_seconds:1,max_seconds:10}}})
  if(path.endsWith('/generation-specification')&&url.searchParams.get('category')==='video') {
   const id=url.searchParams.get('model_id')||defaultId
   return route.fulfill({json:{data:{model_id:id,model_name:'viduq2',provider:'vidu',revision_id:id+'-revision',field:'resolution',default:'540p',options:[{value:'540p',label:'540p'},{value:'720p',label:'720p'}],price:null}}})
  }
  if(path.endsWith('/video-readiness')){const id=path.split('/').at(-2),d=detailFor(id);checks.push(d.duration);return route.fulfill({json:{data:{shot_id:id,reference_mode:url.searchParams.get('reference_mode')||'text_only',ready:d.duration<=10,checks:[{key:'duration_ready',ok:d.duration<=10,message:d.duration<=10?`时长 ${d.duration} 秒符合模型`:'时长16秒不符合当前型号'}]}}})}
  if(path.endsWith('/quality-reviews'))return route.fulfill({json:{data:{items:[],latest_applied:null}}})
  if(path.includes('sync-fixture-task'))return route.fulfill({json:{data:{status:'pending',progress:0}}})
  const response=await route.fetch({url:'http://127.0.0.1:8000'+path+url.search})
  if(!(response.headers()['content-type']||'').includes('json'))return route.fulfill({response})
  const json=await response.json()
  if(path.endsWith('/model-overview'))json.data.models.push(...['sync-default','sync-other'].map(id=>({category:'video',scenario_keys:['text'],model_name:'viduq2',configurations:[{model_id:id,provider_name:id==='sync-default'?'测试默认模型':'测试手选模型'}]})))
  return route.fulfill({json})
 })
 await page.goto(base+'/projects/aca3f2bd-f274-4ca6-b530-892a5a57b441/chapters/643f01c6-b6a4-5327-ae11-1d142be61cc3/studio')
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');await page.waitForTimeout(1300);if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 const model=page.getByRole('combobox',{name:'本次视频模型'}).locator('..').locator('..')
 await page.getByText('时长16秒不符合当前型号',{exact:true}).waitFor()
 assert.match(await model.innerText(),/测试默认模型/)
 await page.getByRole('tab',{name:'生成参数',exact:true}).click()
 await page.getByRole('textbox',{name:'镜头视频时长'}).fill('5')
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 await page.getByText('当前镜头已满足视频生成条件',{exact:true}).waitFor()
 assert.equal(checks.at(-1),5);assert.equal(patches.at(-1).patch.duration,5)
 await page.getByText(/本镜头 5 秒/).waitFor()
 // 手动选择分辨率后回到页面，未变版本的刷新不应覆盖选择。
 const resolution=page.getByRole('combobox',{name:'视频分辨率'}).locator('..').locator('..')
 await resolution.click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^720p$/}).click()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.waitForTimeout(500);assert.match(await resolution.innerText(),/720p/)
 // 手选型号保留；清空选择才回到当前默认型号。
 await model.click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:'测试手选模型 · viduq2'}).click()
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(300)
 assert.match(await model.innerText(),/测试手选模型/)
 await model.hover();await model.locator('..').locator('.ant-select-clear').click()
 await page.waitForTimeout(300);assert.match(await model.innerText(),/测试默认模型/)
 await page.getByRole('tab',{name:'生成参数',exact:true}).click()
 await page.getByRole('combobox',{name:'镜头视频比例'}).locator('..').locator('..').click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:'9:16'}).first().click()
 await page.getByRole('tab',{name:'维护设置',exact:true}).click()
 await page.getByPlaceholder('分镜标题…',{exact:true}).fill('同步后的分镜标题')
 await page.getByPlaceholder('备注…',{exact:true}).fill('同步后的剧情备注')
 // 比例仍在防抖窗口内便返回并生成，必须先保存。
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 await page.getByText('当前镜头已满足视频生成条件',{exact:true}).waitFor()
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 await page.getByRole('textbox',{name:'视频本次发送提示词'}).waitFor()
 assert.ok([...metadata.values()].some(item=>item.title==='同步后的分镜标题' && item.script_excerpt==='同步后的剧情备注'));
 assert.equal(renders.at(-1).detail.duration,5);assert.equal(renders.at(-1).detail.override_video_ratio,'9:16')
 await page.getByRole('button',{name:'确认费用并生成视频',exact:true}).click()
 for (const [id,detail] of details) details.set(id,{...detail,duration:6})
 await page.getByRole('button',{name:'按此规格生成',exact:true}).click()
 await page.getByText('确认期间镜头设置或模型已变化，请更新发送预览后重新确认',{exact:true}).waitFor()
 assert.equal(submitted.length,0)
 await page.locator('.cs-prompt-preview .ant-modal-close').click()
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 await page.getByRole('textbox',{name:'视频本次发送提示词'}).waitFor()
 await page.getByRole('button',{name:'确认费用并生成视频',exact:true}).click()
 await page.getByRole('button',{name:'按此规格生成',exact:true}).click()
 await page.waitForTimeout(500)
 assert.equal(submitted.length,1);assert.equal(submitted[0].model_id,'sync-default');assert.equal(submitted[0].operation_input.seconds,6);assert.equal(submitted[0].operation_input.ratio,'9:16')
 for (const close of await page.locator('.ant-notification-notice-close').all()) await close.click()
 // 保存失败后阻止用已知旧值生成，并保留可重试草稿。
 await page.getByRole('tab',{name:'生成参数',exact:true}).click();failSave=true
 await page.getByRole('textbox',{name:'镜头视频时长'}).fill('7')
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 await page.getByText('镜头设置保存失败，请重试保存后再生成',{exact:true}).waitFor()
 assert.equal(await page.locator('button').filter({hasText:'生成视频'}).first().isDisabled(),true)
 failSave=false;await page.getByRole('button',{name:'重试保存',exact:true}).click()
 await page.getByText(/本镜头 7 秒/).waitFor();await page.getByText('当前镜头已满足视频生成条件',{exact:true}).waitFor()
 assert.equal(blocked,0);assert.equal(submitted.length,1)
 await page.screenshot({path:'local-reports/studio-settings-sync.png',fullPage:true})
 console.log('PASS: default model filled, manual override/clear, delayed duration save/readiness, ratio flush before preview, resolution survives refresh, actual submit matches latest, save failure blocks generation; zero real writes/billing')
} catch(error){await page.screenshot({path:'local-reports/studio-settings-sync-failure.png',fullPage:true});throw error}
finally {await page.unrouteAll({behavior:'ignoreErrors'});await browser.close()}
