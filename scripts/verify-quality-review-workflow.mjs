/** 离线浏览器验证历史免费复用、显式调用、应用标记与旧版本保护。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1400,height:1100},timezoneId:'Asia/Shanghai'})
const context={model_revision_id:'video-r1',reference_mode:'text_only',image_file_ids:[],ratio:'16:9',seconds:10,resolution:null,generate_audio:null}
const original={task_id:'review-1',scope:'video',action:'review',prompt:'原始提示词',generation_context:context,image_file_ids:[],status:'succeeded',created_at:'2026-09-10T09:00:00',text:'建议明确动作节奏。',model_name:'已配置预检模型'}
let records=[original],calls=0,applied=0
page.on('pageerror',error=>console.error(error.message))
try {
 await page.route('**/api/**',async route=>{
  const r=route.request(),u=new URL(r.url())
  if(u.pathname.endsWith('/quality-review-models'))return route.fulfill({json:{data:[{id:'text-model',name:'测试文本模型',supports_images:false}]}})
  if(u.pathname.endsWith('/quality-reviews')&&u.searchParams.get('scope')==='legacy')return route.fulfill({json:{data:{items:[],total:0,page:1,page_size:10}}})
  if(u.pathname.endsWith('/quality-reviews'))return route.fulfill({json:{data:{items:records,total:records.length,page:1,page_size:10,latest_applied:records.find(r=>r.application?.active)||null}}})
  if(u.pathname.endsWith('/quality-review')){
   calls++;const body=r.postDataJSON();assert.ok(body.retry_request_id);assert.equal(body.action,'revise');assert.equal(body.source_task_id,'review-1');assert.equal(body.external_and_billing_confirmed,true);assert.equal(body.generation_context.model_revision_id,'video-r1')
   records=[{...original,task_id:'revision-1',action:'revise',source_task_id:'review-1',revision:{revised_prompt:'智能优化后的完整提示词',changes:['明确节奏'],unresolved:['参考图身份需核对']}},original]
   return route.fulfill({json:{data:{task_id:'revision-1'}}})
  }
  if(u.pathname.endsWith('/apply')){
   applied++;const body=r.postDataJSON();assert.equal(body.before_prompt,records[0].application?.active?records[0].application.prompt:records[0].prompt);records[0].application={...body,applied_at:new Date().toISOString(),active:true};original.optimization_status='applied'
   return route.fulfill({json:{data:records[0]}})
  }
  if(u.pathname.endsWith('/result'))return route.fulfill({json:{data:{status:'succeeded',result:{text:'优化完成'}}}})
  return route.abort()
 })
 await page.route('**/quality-test',route=>route.fulfill({contentType:'text/html',body:`<meta charset="UTF-8"><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 const {QualityReviewPanel}=await import('/src/pages/aiStudio/chapter/components/QualityReviewPanel.tsx');
 const {StudioGenerationTasksService}=await import('/src/services/generated/index.ts');
 function Fixture(){const [prompt,setPrompt]=React.useState('原始提示词');return React.createElement('div',{style:{padding:30}},React.createElement('input',{'aria-label':'当前视频提示词',value:prompt,onChange:e=>setPrompt(e.target.value)}),React.createElement(QualityReviewPanel,{shotId:'s',prompt,generationContext:${JSON.stringify(context)},onApply:async(record,next)=>{await StudioGenerationTasksService.applyQualityRevisionApiV1StudioGenerationTasksShotsShotIdQualityReviewsTaskIdApplyPost({shotId:'s',taskId:record.task_id,requestBody:{prompt:next,before_prompt:record.application?.active?record.application.prompt:record.prompt,image_file_ids:[],generation_context:${JSON.stringify(context)}}});setPrompt(next)}}))};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Fixture));
 </script>`}))
 await page.goto('http://127.0.0.1:5174/quality-test')
 await page.locator('summary').filter({hasText:'AI 检查与优化'}).waitFor()
 await page.getByText('建议明确动作节奏。',{exact:true}).waitFor()
 await page.getByRole('button',{name:'刷新历史（免费）'}).click();assert.equal(calls,0)
 await page.locator('.ant-select').filter({hasText:'选择预检/优化使用的文本模型'}).click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:'测试文本模型'}).click()
 await page.getByRole('checkbox',{name:/同意本次/}).check()
 await page.getByRole('button',{name:'依据此预检智能调整（调用模型）'}).click()
 await page.getByText('参考图身份需核对',{exact:true}).waitFor()
 assert.equal(calls,1)
 assert.equal(await page.getByRole('textbox',{name:'优化前提示词'}).inputValue(),'原始提示词')
 assert.equal(await page.getByRole('textbox',{name:'优化后提示词'}).inputValue(),'智能优化后的完整提示词')
 const times=await page.evaluate(async()=>{const {formatStudioTime}=await import('/src/pages/aiStudio/components/studioTime.ts');return ['2026-09-10T09:00:00','2026-09-10T09:00:00Z','2026-09-10T17:00:00+08:00'].map(formatStudioTime)})
 assert.equal(new Set(times).size,1);assert.ok(times[0].includes('17:00:00'))
 const apply=page.getByRole('button',{name:'应用并保存为生成稿（免费）'})
 await page.getByRole('textbox',{name:'当前视频提示词'}).fill('人工新修改')
 assert.equal(await apply.isDisabled(),true)
 await page.getByRole('textbox',{name:'当前视频提示词'}).fill('原始提示词')
 await apply.click();await page.getByText(/已应用优化 ·/).waitFor()
 assert.equal(applied,1);assert.equal(calls,1)
 await page.getByRole('textbox',{name:'优化后提示词'}).fill('已应用后的免费微调稿')
 await apply.click();assert.equal(applied,2);assert.equal(calls,1)
 await page.waitForFunction(()=>document.querySelector('[aria-label="当前视频提示词"]').value==='已应用后的免费微调稿')
 assert.equal(await page.getByRole('textbox',{name:'当前视频提示词'}).inputValue(),'已应用后的免费微调稿')
 await page.reload();await page.locator('summary').filter({hasText:'AI 检查与优化'}).waitFor()
 await page.getByText(/已应用优化 ·/).waitFor();assert.equal(calls,1)
 console.log('PASS: reopen/read/refresh reuse history with zero model calls; explicit revision uses correct source/version; stale apply blocked; applied mark persists; no real writes or billing')
} finally {await browser.close()}
