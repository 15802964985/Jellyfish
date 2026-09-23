/** 完整工作室最终请求验证：真实GET，本地模拟所有写操作及生成，不调用收费模型。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1500,height:1050}})
const background=process.env.TEST_FRAME_BACKGROUND==='1'
let generationFinished=!background,cancelRequests=0
const autoDraft=process.env.TEST_FRAME_AUTO_DRAFT==='1'
let records=[],submitted=[],errors=[],detail,reviewCalls=0,draftCalls=0
page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)})
const shot='2056143f-48ac-4eef-9f8e-86cec575e7af'
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),path=u.pathname
 if(path.endsWith('/cancel'))cancelRequests++
 if(path.endsWith('/frames/first/draft')){draftCalls++;return route.fulfill({json:{data:{prompt:'依据剧本整理的首帧草稿',warnings:[]}}})}
 if(path.endsWith('/quality-review-models'))return route.fulfill({json:{data:[{id:'check-model',name:'检查模型',supports_images:true}]}})
 if(path.endsWith('/generation-specification')&&(u.searchParams.get('category')==='image'||u.searchParams.get('model_id')==='img'))return route.fulfill({json:{data:{category:'image',model_id:'img',model_name:'图片模型',revision_id:'img-r1',field:'resolution_profile',default:'preview',options:[{value:'preview',label:'1024x1024',size:'1024x1024'}],price:null}}})
 if(path===`/api/v1/studio/shot-details/${shot}`){
  if(!detail)detail={...(await fetch('http://127.0.0.1:8000'+path).then(r=>r.json())).data,first_frame_prompt:autoDraft?'':'单帧基础提示词',frame_reference_selections:{first:[],key:[],last:[]}}
  if(req.method()==='PATCH')detail={...detail,...req.postDataJSON()}
  return route.fulfill({json:{data:detail}})
 }
 if(path.endsWith('/quality-reviews')){const rows=records.filter(r=>r.scope===u.searchParams.get('scope'));return route.fulfill({json:{data:{items:rows,total:rows.length,page:1,page_size:10,latest_applied:rows.find(r=>r.application?.active)}}})}
 if(path.endsWith('/quality-review')){const body=req.postDataJSON();reviewCalls++;records=[{task_id:'frame-check',scope:body.scope,action:body.action,prompt:body.prompt,generation_context:body.generation_context,image_file_ids:[],status:'succeeded',created_at:new Date().toISOString(),text:'方案',revision:{revised_prompt:'实际发送的单帧优化完整稿',changes:['修正姿态'],unresolved:[]}}];return route.fulfill({json:{data:{task_id:'frame-check'}}})}
 if(path.endsWith('/apply')){records[0].application={...req.postDataJSON(),active:true,applied_at:new Date().toISOString()};return route.fulfill({json:{data:records[0]}})}
 if(path.includes('/frame-check/result'))return route.fulfill({json:{data:{status:'succeeded',result:{text:'方案'}}}})
 if(req.method()!=='GET'&&req.method()!=='OPTIONS'){
  if(path.endsWith('/frame-review-check'))return route.fulfill({json:{data:{ready:true,checks:[{key:'input',ok:true,message:'本地输入通过'}]}}})
  if(/\/frames\/(first|key|last)\/render$/.test(path))return route.fulfill({json:{data:{base_prompt:req.postDataJSON().prompt,execution_prompt:'单帧最终原稿',recommended_media:{references:[]},variables_snapshot:{quality_source_fingerprint:'fixture-source'},reference_mappings:[]}}})
  if(path.endsWith('/frames/first')&&path.includes('generation-tasks')){submitted.push(req.postDataJSON());return route.fulfill({json:{data:{task_id:'no-real-generation'}}})}
  return route.fulfill({json:{data:{}}})
 }
 if(path.includes('no-real-generation'))return route.fulfill({json:{data:{task_id:'no-real-generation',status:generationFinished?'succeeded':'running',progress:generationFinished?100:20,result:{}}}})
 const r=await route.fetch({url:'http://127.0.0.1:8000'+path+u.search});return route.fulfill({response:r})
})
try{
 const base=process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:5174'
 await page.goto(base+`/projects/aca3f2bd-f274-4ca6-b530-892a5a57b441/chapters/643f01c6-b6a4-5327-ae11-1d142be61cc3/studio?shotId=${shot}`)
 await page.getByText('清晨林荫道侧跟拍小女孩背大书包蹲看蚂蚁并回头确认妈妈',{exact:true}).first().click()
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');await page.waitForTimeout(1300);if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).click()
 await page.waitForTimeout(1500)
 await page.getByRole('button',{name:/^生\s*成$/}).first().click()
 const dialog=page.getByRole('dialog').filter({has:page.getByText('参考图与参数 → 提示词 → 生成 → 查看并采用图片',{exact:true})})
 await dialog.getByText('本地输入通过',{exact:false}).waitFor()
 if(autoDraft){
  const baseInput=dialog.getByPlaceholder('请输入基础提示词，例如人物动作、场景氛围、镜头视角等…')
  assert.equal(await baseInput.inputValue(),'依据剧本整理的首帧草稿');assert.equal(draftCalls,1)
  await baseInput.fill('用户修改后的首帧画面')
  await dialog.getByRole('button',{name:'保存本帧提示词',exact:true}).click()
  await dialog.getByRole('button',{name:'按规则渲染',exact:true}).click()
  await dialog.getByText('本地输入通过',{exact:false}).waitFor()
  assert.equal(detail.first_frame_prompt,'用户修改后的首帧画面')
 }else assert.equal(draftCalls,0)

 await dialog.getByText('AI 检查与优化（可选） · 不影响直接生成',{exact:true}).click()
 await dialog.locator('summary').filter({hasText:'历史读取免费'}).click()
 await dialog.getByRole('combobox',{name:'检查模型',exact:true}).locator('..').locator('..').click();await page.locator('.ant-select-dropdown:visible').getByText('检查模型 · 支持看图',{exact:true}).click()
 await dialog.getByRole('checkbox',{name:/同意本次/}).check()
 await dialog.getByRole('button',{name:'检查并生成优化稿（一次模型调用）'}).click()
 await dialog.getByRole('textbox',{name:'优化后提示词'}).waitFor()
 await dialog.getByRole('button',{name:'应用优化并保存标记（免费）'}).click()
 await dialog.getByText('本帧已应用智能优化；下方最终发送预览与实际生成一致',{exact:true}).waitFor()
 await dialog.getByRole('button',{name:/^生\s*成$/}).click()
 await page.getByRole('button',{name:'按此规格生成',exact:true}).click()
 await page.waitForFunction(()=>document.body.textContent.includes('生成'))
 for(let i=0;i<25&&!submitted.length;i++)await page.waitForTimeout(200)
 assert.equal(submitted.length,1);assert.equal(submitted[0].execution_prompt,'实际发送的单帧优化完整稿');assert.equal(submitted[0].quality_revision_task_id,'frame-check');assert.equal(submitted[0].model_id,'img');assert.equal(submitted[0].operation_input.resolution_profile,'preview');assert.equal(reviewCalls,1);assert.deepEqual(errors,[])
 if(background){
  await dialog.waitFor({state:'hidden'})
  await page.getByRole('button',{name:/^生\s*成$/}).nth(1).click()
  await dialog.waitFor({state:'visible'})
  generationFinished=true
  await page.waitForTimeout(12000)
  assert.ok(await dialog.isVisible(),'旧帧完成不能关闭后来打开的窗口')
  await dialog.locator('.ant-modal-close').click()
  await dialog.waitFor({state:'hidden'})
  assert.equal(cancelRequests,0)
 }
 await page.screenshot({path:'local-reports/frame-quality-send.png',fullPage:true})
 console.log(JSON.stringify({ok:true,actualRequest:submitted[0],paidCalls:0}))
}catch(e){console.log((await page.locator('body').innerText()).slice(-14000));await page.screenshot({path:'local-reports/frame-send-failure.png',fullPage:true});throw e}finally{await browser.close()}
