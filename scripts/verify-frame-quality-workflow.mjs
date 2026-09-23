/** 浏览器完全拦截API，验证逐帧历史、一次检查优化、应用/恢复与具体图像送检，无真实写入。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
let records=[],submissions=[],errors=[]
page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)})
await page.route('**/api/**',async route=>{
 const req=route.request(),u=new URL(req.url()),path=u.pathname
 if(path.endsWith('/quality-review-models'))return route.fulfill({json:{data:[{id:'vision',name:'看图模型',supports_images:true},{id:'text',name:'纯文字模型',supports_images:false}]}})
 if(path.endsWith('/frame-review-check'))return route.fulfill({json:{data:{ready:true,checks:[{key:'spec',ok:true,message:'规格通过'}]}}})
 if(path.endsWith('/character-views'))return route.fulfill({json:{data:[]}})
 if(path.endsWith('/quality-reviews')){
  const scope=u.searchParams.get('scope'),stage=u.searchParams.get('stage'),output=u.searchParams.get('output_file_id')
  const rows=scope==='legacy'?[{task_id:'old',scope:'legacy',action:'review',status:'succeeded',created_at:'2026-09-11T00:00:00Z',prompt:'旧视频',image_file_ids:[],text:'旧视频报告'}]:records.filter(r=>r.scope===scope&&(!stage||r.generation_context.stage===stage)&&(!output||r.generation_context.output_file_id===output))
  return route.fulfill({json:{data:{items:rows.filter(r=>r.status==='succeeded'),active_tasks:rows.filter(r=>r.status==='running'),total:rows.filter(r=>r.status==='succeeded').length,page:1,page_size:10,latest_applied:rows.find(r=>r.application?.active)||null}}})
 }
 if(path.endsWith('/quality-review')){
  const body=req.postDataJSON();submissions.push(body)
  const id='task-'+submissions.length
  records.unshift({task_id:id,status:'succeeded',created_at:'2026-09-11T01:00:00Z',action:body.action,scope:body.scope,prompt:body.prompt,image_file_ids:body.image_file_ids,generation_context:body.generation_context,model_name:'看图模型',text:'结果',revision:{revised_prompt:'单张优化稿',changes:['修正动作瞬间'],unresolved:['需核对手部像素']}})
  return route.fulfill({json:{data:{task_id:id}}})
 }
 if(path.endsWith('/result'))return route.fulfill({json:{data:{status:records.find(r=>path.includes(r.task_id))?.status || 'succeeded',result:{text:'结果'}}}})
 if(path.endsWith('/apply')){const r=records.find(r=>path.includes(r.task_id));r.application={...req.postDataJSON(),active:true,applied_at:'2026-09-11T01:05:00Z'};return route.fulfill({json:{data:r}})}
 if(path.endsWith('/restore')){const r=records.find(r=>path.includes(r.task_id));r.application.active=false;return route.fulfill({json:{data:r}})}
 if(path.includes('/files/'))return route.fulfill({status:200,body:''})
 throw new Error('Unexpected API '+path)
})
/** 展开默认收起的辅助区及内层报告，主流程无需进行此操作。 */
async function openReview(){
 await page.getByText('AI 检查与优化（可选） · 不影响直接生成',{exact:true}).click()
 await page.locator('summary').filter({hasText:'历史读取免费'}).click()
}
/** 明确选择模型并确认一次费用，不复用上一次的许可。 */
async function confirmModel(name='看图模型 · 支持看图'){
 await page.getByRole('combobox',{name:'检查模型',exact:true}).locator('..').locator('..').click()
 await page.locator('.ant-select-dropdown:visible').getByText(name,{exact:true}).click()
 await page.getByRole('checkbox',{name:/同意本次/}).check()
}
try{
 await page.goto('http://127.0.0.1:5174/frame-quality-acceptance.html')
 await page.getByText('规格通过',{exact:false}).waitFor()
 assert.equal(submissions.length,0)
 await openReview()
 await page.getByText('请选择预检使用的文本模型',{exact:true}).waitFor()
 await page.getByText('引用其他用途的历史建议（可选，读取免费）',{exact:true}).click()
 await page.getByRole('combobox',{name:'引用历史报告',exact:true}).locator('..').locator('..').click()
 await page.locator('.ant-select-dropdown:visible').getByText(/用途未标注/).click()
 await confirmModel()
 await page.getByRole('button',{name:'检查并生成优化稿（一次模型调用）'}).click()
 await page.getByRole('textbox',{name:'优化后提示词'}).waitFor()
 assert.equal(submissions.length,1);assert.equal(submissions[0].action,'review_and_revise');assert.equal(submissions[0].scope,'first');assert.equal(submissions[0].reference_report_task_id,'old')
 await page.getByRole('button',{name:'应用优化并保存标记（免费）'}).click()
 await page.getByTestId('applied').filter({hasText:'单张优化稿'}).waitFor()
 await page.reload();await page.getByTestId('applied').filter({hasText:'单张优化稿'}).waitFor();assert.equal(submissions.length,1)
 await openReview();await page.getByRole('button',{name:'恢复原始发送稿（免费）'}).click();await page.getByTestId('applied').filter({hasText:'单张原稿'}).waitFor()
 await page.getByRole('combobox',{name:'图片检查阶段'}).locator('..').locator('..').click()
 await page.locator('.ant-select-dropdown:visible').getByText('生成后 · 检查具体图片',{exact:true}).click()
 await page.getByRole('combobox',{name:'待检查图片版本'}).locator('..').locator('..').click()
 await page.locator('.ant-select-dropdown:visible').getByText(/图片版本 1/).click()
 await page.locator('summary').filter({hasText:'历史读取免费'}).click()
 assert.ok(await page.getByRole('checkbox',{name:'待检查的图片版本（必传）'}).isChecked())
 await confirmModel('纯文字模型 · 仅文字检查')
 assert.ok(await page.getByRole('button',{name:'检查并生成优化稿（一次模型调用）'}).isDisabled())
 await page.getByRole('combobox',{name:'检查模型',exact:true}).locator('..').locator('..').click();await page.locator('.ant-select-dropdown:visible').getByText('看图模型 · 支持看图',{exact:true}).click();await page.getByRole('checkbox',{name:/同意本次/}).check()
 await page.getByRole('button',{name:'检查并生成优化稿（一次模型调用）'}).click();await page.getByRole('textbox',{name:'优化后提示词'}).waitFor()
 assert.equal(submissions[1].generation_context.output_file_id,'output-a');assert.deepEqual(submissions[1].image_file_ids,['output-a'])
 await page.getByRole('button',{name:'切换尾帧',exact:true}).click();await openReview();assert.equal(await page.getByRole('textbox',{name:'优化后提示词'}).count(),0)
 const before=records.find(r=>r.scope==='first'&&r.generation_context.stage==='before')
 assert.ok(before)
 records.unshift({...before,task_id:'pending-restored',status:'running',application:undefined,revision:undefined,text:''})
 await page.reload();await openReview()
 await page.getByText('任务在后台执行，可以关闭此窗口并继续其他工作。关闭不会取消任务。',{exact:true}).waitFor()
 await page.getByRole('button',{name:'切换尾帧',exact:true}).click();await openReview()
 assert.equal(await page.getByText('任务在后台执行，可以关闭此窗口并继续其他工作。关闭不会取消任务。',{exact:true}).count(),0)
 assert.equal(submissions.length,2)
 assert.deepEqual(errors,[])
 await page.screenshot({path:'local-reports/frame-quality-workflow.png',fullPage:true})
 console.log(JSON.stringify({ok:true,modelCallsMocked:submissions.length,checks:['isolation','combined','apply','restore','reload','output-version','vision-capability','running-task-recovery','no-cross-frame-busy']}))
}catch(e){console.log((await page.locator('body').innerText()).slice(-9000));throw e}finally{await browser.close()}
