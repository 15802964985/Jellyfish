/** Offline browser flow: every non-GET API request is fulfilled locally or aborted; never bills or writes business data. */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
let rendered, submitted, blocked=0, checkedImageCount
const subjects=[{name:'角色·妈妈',media:[{file_id:'fixture-mother',media_kind:'image',ordinal:0}]},{name:'场景·林荫道',media:[{file_id:'fixture-scene',media_kind:'image',ordinal:0}]}]
try {
 await page.addInitScript(({subjects,shotId})=>{
   const getItem=Storage.prototype.getItem
   Storage.prototype.getItem=function(key){ return key.startsWith('jellyfish.video-subjects.') ? (getItem.call(this,key) ?? JSON.stringify(subjects)) : getItem.call(this,key) }
   const match=location.pathname.match(/chapters/)
   if(match) localStorage.setItem(`jellyfish.video-subjects.${shotId}`,JSON.stringify(subjects))
 },{subjects,shotId:process.env.JELLYFISH_SHOT_ID})
 await page.route('**/api/**',async route=>{
  const req=route.request(), url=new URL(req.url())
  if(!['GET','OPTIONS'].includes(req.method())) {
   if(url.pathname.endsWith('/video/render')) {
    rendered=req.postDataJSON()
    return route.fulfill({json:{data:{execution_prompt:'妈妈走在林荫道。\n'+rendered.subjects.map((s,i)=>`[Image ${i+1}]=${s.name}`).join('；'),variables_snapshot:{pack:{scene:{name:'林荫道'},characters:[{name:'妈妈'}],props:[],script_excerpt:'走路',action_beats:['走路']}}}}})
   }
   if(url.pathname.endsWith('/video')&&url.pathname.includes('generation-tasks')) {submitted=req.postDataJSON();return route.fulfill({json:{data:{task_id:'fixture-not-a-real-task'}}})}
   blocked++;return route.abort()
  }
  if(/^\/api\/v1\/studio\/shot-details\/[^/]+$/.test(url.pathname))return route.fulfill({json:{data:{id:url.pathname.split('/').at(-1),duration:5,camera_shot:'MS',angle:'EYE_LEVEL',movement:'STATIC',prompt:'人物行走',video_ratio:'16:9'}}})
  if(url.pathname.endsWith('/character-views'))return route.fulfill({json:{data:[{character_id:'role',name:'妈妈',views:['正面','左侧','背面'].map((label,i)=>({file_id:['fixture-mother','fixture-side','fixture-back'][i],image_id:i,source_type:'character',source_id:'role',view_angle:['FRONT','LEFT','BACK'][i],label:`角色定妆 · ${label}`}))}]}})
  if(url.pathname.endsWith('/video-readiness'))checkedImageCount=url.searchParams.get('subject_image_count')
  if(url.pathname.includes('fixture-'))return route.fulfill({status:404,json:{detail:'offline fixture'}})
  if(url.pathname.endsWith('/video-generation-options')&&url.searchParams.get('model_id')==='fixture-r2v')return route.fulfill({json:{data:{provider:'vidu',model_id:'fixture-r2v',model_name:'viduq2',allowed_ratios:['16:9','9:16'],default_ratio:'16:9',supports_first_frame:false,supports_last_frame:false,supports_text_to_video:false,max_key_frames:0,requires_subject_reference:true,studio_subject_images_verified:true,max_subjects:7,max_images_per_subject:3,max_total_subject_images:7,min_seconds:3,max_seconds:15}}})
  if(url.pathname.endsWith('/generation-specification')&&url.searchParams.get('model_id')==='fixture-r2v')return route.fulfill({json:{data:{provider:'vidu',model_id:'fixture-r2v',model_name:'viduq2',revision_id:'fixture-revision',field:'resolution',default:'480P',options:[{value:'480P',label:'480P'},{value:'720P',label:'720P'}],price:null}}})
  const response=await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
  if(!(response.headers()['content-type']||'').includes('json'))return route.fulfill({response})
  const json=await response.json()
  if(url.pathname.endsWith('/model-overview'))json.data.models.push({category:'video',scenario_keys:['subjects'],model_name:'viduq2',configurations:[{model_id:'fixture-r2v',provider_name:'离线验证模型'}]})
  if(json.data&&Object.hasOwn(json.data,'duration'))json.data.duration=5
  return route.fulfill({json})
 })
 await page.goto((process.env.JELLYFISH_WEB_URL||'http://127.0.0.1:5174')+process.env.JELLYFISH_STUDIO_PATH)
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');await page.waitForTimeout(1800);if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'视频生成',exact:true}).click()
 const model=page.locator('.cs-group').filter({has:page.getByText('本次视频模型',{exact:true})}).locator('.ant-select-selector')
 await model.click();await page.getByText('离线验证模型 · viduq2',{exact:true}).click()
 await page.getByText('按角色选择多角度图片',{exact:true}).waitFor()
 await page.getByText('妈妈 · 未关联演员 · 3 张',{exact:true}).click()
 await page.getByRole('checkbox',{name:'妈妈 角色定妆 · 左侧'}).check()
 await page.getByRole('textbox',{name:'参考图 1 用途'}).fill('角色·妈妈')
 await page.getByRole('checkbox',{name:'妈妈 角色定妆 · 背面'}).check()
 await page.getByRole('button',{name:'组1角度3前移'}).click()
 assert.equal(await page.getByRole('textbox',{name:'参考图 1 用途'}).inputValue(),'角色·妈妈')
 await page.getByRole('button',{name:/下\s*移/}).first().click()
 assert.equal(await page.getByRole('textbox',{name:'参考图 1 用途'}).inputValue(),'场景·林荫道')
 await page.getByRole('textbox',{name:'参考图 2 用途'}).fill('角色·妈妈（只参考外观）')
 await page.locator('button').filter({hasText:'生成视频'}).first().click()
 await page.getByRole('textbox',{name:'视频本次发送提示词'}).waitFor()
 assert.equal(rendered.reference_mode,'subjects');assert.deepEqual(rendered.image_file_ids,[])
 assert.equal(rendered.subjects[0].media[0].file_id,'fixture-scene')
 assert.equal(rendered.subjects[1].name,'角色·妈妈（只参考外观）')
 assert.deepEqual(rendered.subjects[1].media.map(m=>m.file_id),['fixture-mother','fixture-back','fixture-side'])
 assert.deepEqual(rendered.subjects[1].media.map(m=>m.ordinal),[0,1,2])
 assert.equal(checkedImageCount,'4')
 await page.getByText('本次实际发送的主体参考图',{exact:true}).waitFor()
 assert.equal(await page.locator('section.cs-group').filter({has:page.getByText('本次实际发送的主体参考图',{exact:true})}).locator('img').count(),4)
 for(const width of [1440,900,540]) {await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 await page.screenshot({path:'local-reports/subject-video-workflow.png',fullPage:true})
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'确认费用并生成视频',exact:true}).click()
 await page.getByRole('button',{name:'按此规格生成',exact:true}).click()
 await page.waitForTimeout(500)
 assert.ok(submitted);assert.deepEqual(submitted.media.subjects,rendered.subjects)
 assert.equal(submitted.media.frames.first,null);assert.equal(submitted.model_id,'fixture-r2v')
 assert.equal(submitted.operation_input.resolution,'480P');assert.equal(blocked,0)
 console.log('PASS: model-aware strategy, ordered/named subject images, preview and actual submit body identical, responsive layout; all writes mocked, zero billing')
}finally{await browser.close()}
