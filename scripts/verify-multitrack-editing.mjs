/** 所有写请求本地模拟；只读真实源片用于页面监看，不创建业务任务或模型费用。 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const projectId = 'aca3f2bd-f274-4ca6-b530-892a5a57b441'
const original = await fetch(`http://127.0.0.1:8000/api/v1/studio/timeline/projects/${projectId}`).then(r => r.json())
const source = original.data?.clips?.[0]
assert.ok(source, '需要至少一个已有视频用于只读监看')
const plan = { clips: [0,1].map(i => ({ id:`clip-${i}`, shot_id:`shot-${i}`, file_id:source.file_id, label:`镜头 ${i+1} · 人物连续性复核`, in_seconds:0, out_seconds:3, volume:1, review:'unchecked', review_note:'' })),
 audio:[], subtitles:[{id:'cue', start_seconds:0, end_seconds:1, text:'原字幕'}], resolution:720 }
let record = { revision:1, plan, warnings:[], character_references:[] }
// Genuine PCM fixture provides a decodable waveform without touching stored audio.
const wav = Buffer.alloc(44 + 8000 * 2)
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40)
for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(Math.sin(i/8000*440*2*Math.PI)*12000),44+i*2)
let saved, exported, blocked=0, visualCalls=0, reports=[]
let evidence, prepared
const page = await browser.newPage({viewport:{width:1440,height:1000}})
try {
 await page.route('**/api/**',async route => {
  const req=route.request(), url=new URL(req.url())
  if (!['GET','OPTIONS'].includes(req.method())) {
   if(url.pathname.endsWith('/edit') && req.method()==='PUT') { saved=req.postDataJSON(); record={...record,revision:record.revision+1,plan:saved.plan};return route.fulfill({json:{data:record}}) }
   if(url.pathname.endsWith('/exports')) { exported=req.postDataJSON();return route.fulfill({json:{data:{task_id:'fixture-edit-export',status:'pending'}}}) }
   if(url.pathname.endsWith('/visual-evidence')) { const body=req.postDataJSON();prepared=body;evidence={evidence_id:'evidence-1',revision:body.expected_revision,clip_id:body.clip_id,fingerprint:'f',baseline_file_ids:body.baseline_file_ids,sample_mode:body.sample_mode,images:[{file_id:source.file_id,label:'测试采样画面',seconds:0}],limitations:['测试材料']};return route.fulfill({json:{data:evidence}}) }
   if(url.pathname.endsWith('/visual-reviews')) { visualCalls++;assert.equal(req.postDataJSON().external_and_billing_confirmed,true);reports=[{task_id:'visual-task',created_at:'2026-09-10T10:00:00+00:00',model_name:'视觉测试模型',revision:record.revision,clip_id:evidence.clip_id,matches_current:true,text:'### 模型原文\n人物服装需要人工核对。',evidence}];return route.fulfill({json:{data:{task_id:'visual-task',status:'pending'}}}) }
   blocked++;return route.abort()
  }
  if(url.pathname.endsWith('/character-views')) return route.fulfill({json:{data:[{character_id:'role',name:'测试角色',views:['FRONT','LEFT','BACK'].map((view_angle,i)=>({file_id:`angle-${i}`,image_id:i,source_type:'character',source_id:'role',view_angle,label:['角色定妆 · 正面','角色定妆 · 左侧','角色定妆 · 背面'][i]}))}]}})
  if(url.pathname.includes('/files/angle-')) return route.fulfill({status:404,body:''})
  if(url.pathname.endsWith('/edit')) return route.fulfill({json:{data:record}})
  if(url.pathname===`/api/v1/studio/timeline/projects/${projectId}`) return route.fulfill({json:{data:{...original.data,clips:plan.clips.map((c,i)=>({...source,...c,chapter_id:source.chapter_id,start_seconds:i*3,end_seconds:(i+1)*3,duration_seconds:3})),total_shots:2,ready_shots:2,missing_shot_ids:[],total_duration_seconds:6}}})
  if(url.pathname.endsWith('/studio/files') && url.searchParams.get('file_type')==='audio')return route.fulfill({json:{data:{items:[{id:'fixture-audio',type:'audio',name:'测试配音',duration_ms:1000}],pagination:{total:1,page:1,page_size:8}}}})
  if(url.pathname.includes('fixture-edit-export'))return route.fulfill({json:{data:{status:'succeeded',progress:100,result:{file_id:source.file_id,edit_revision:record.revision}}}})
  if(url.pathname.includes('fixture-audio'))return route.fulfill({contentType:'audio/wav',body:wav})
  if(url.pathname.endsWith('/visual-review-models'))return route.fulfill({json:{data:[{id:'vision',revision_id:'revision',name:'视觉测试模型'}]}})
  if(url.pathname.endsWith('/visual-reviews'))return route.fulfill({json:{data:reports.filter(r=>r.clip_id===url.searchParams.get('clip_id'))}})
  if(url.pathname.includes('visual-task'))return route.fulfill({json:{data:{status:'succeeded',result:{text:'报告'}}}})
  const response = await route.fetch({url:'http://127.0.0.1:8000'+url.pathname+url.search})
  return route.fulfill({response})
 })
 await page.goto((process.env.JELLYFISH_WEB_URL || 'http://127.0.0.1:5174')+`/projects/${projectId}/editor`)
 await page.getByRole('heading',{name:'成片剪辑工作台',exact:false}).waitFor()
 await page.getByRole('spinbutton',{name:'源片入点',exact:true}).fill('0.4')
 await page.getByRole('button',{name:/后\s*移/}).click()
 await page.getByRole('button',{name:/撤\s*销/}).click()
 await page.getByRole('button',{name:/重\s*做/}).click()
 await page.getByRole('button',{name:'添加已有音频'}).click()
 await page.getByRole('button',{name:'选择此音频'}).click()
 await page.locator('svg[aria-label="真实音频波形"]').waitFor()
 const wave=page.getByRole('button',{name:'拖动音频 测试配音'})
 await wave.scrollIntoViewIfNeeded();const box=await wave.boundingBox()
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2,{steps:8});await page.mouse.up()
 await page.getByRole('textbox',{name:'字幕内容',exact:true}).fill('校时字幕')
 await page.getByRole('button',{name:'保存工程',exact:true}).click()
 await page.getByText('工程 v2',{exact:true}).waitFor()
 assert.equal(saved.plan.clips[0].id,'clip-1')
 assert.equal(saved.plan.clips[1].in_seconds,.4)
 assert.equal(saved.plan.audio[0].file_id,'fixture-audio');assert.ok(saved.plan.audio[0].start_seconds>0,'wave drag updates saved offset')
 assert.equal(saved.plan.subtitles[0].text,'校时字幕')
 const edge=wave.locator('[data-edge="right"]');const edgeBox=await edge.boundingBox()
 await page.mouse.move(edgeBox.x+2,edgeBox.y+10);await page.mouse.down();await page.mouse.move(edgeBox.x-40,edgeBox.y+10,{steps:6});await page.mouse.up()
 await page.getByRole('button',{name:'保存工程',exact:true}).click();await page.getByText('工程 v3',{exact:true}).waitFor();assert.ok(saved.plan.audio[0].duration_seconds<1)
 await page.reload()
 await page.getByText('工程 v3',{exact:true}).waitFor()
 assert.equal(await page.getByRole('textbox',{name:'字幕内容',exact:true}).inputValue(),'校时字幕')
 await page.getByRole('button',{name:'打开视觉检查',exact:true}).click()
 await page.getByText('测试角色 · 未关联演员 · 3 张',{exact:true}).click()
 await page.getByRole('combobox',{name:'视觉检查采样模式'}).locator('..').locator('..').click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:'最多3'}).click()
 for (const label of ['背面','正面','左侧']) await page.getByRole('checkbox',{name:`测试角色 角色定妆 · ${label}`}).check()
 await page.getByRole('button',{name:'准备检查材料（本地免费）'}).click()
 await page.getByRole('button',{name:'确认费用并检查'}).waitFor()
 assert.deepEqual(prepared.baseline_file_ids,['angle-2','angle-0','angle-1']);assert.equal(prepared.sample_mode,'start')
 await page.getByRole('combobox',{name:'视觉检查模型'}).click();await page.getByText('视觉测试模型',{exact:true}).click()
 assert.equal(visualCalls,0)
 await page.getByRole('button',{name:'确认费用并检查'}).click()
 await page.getByRole('button',{name:'确认外发并检查'}).click()
 await page.getByText('对应当前保存工程 · 待人工核对').waitFor();assert.equal(visualCalls,1)
 assert.ok(await page.locator('pre').filter({hasText:'模型原文'}).count())
 await page.getByRole('button',{name:'刷新历史报告'}).click();assert.equal(visualCalls,1)
 await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click()
 for(const width of [1440,900,540]) {await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`)}
 await page.setViewportSize({width:1440,height:1000})
 await page.screenshot({path:'local-reports/multitrack-editing.png',fullPage:true})
 await page.getByRole('button',{name:'合成预览 / 导出',exact:true}).click()
 await page.getByRole('button',{name:'开始合成',exact:true}).click()
 await page.waitForTimeout(700)
 assert.equal(exported.edit_revision,3);assert.equal(blocked,0)
 console.log('PASS: trim, reorder, undo/redo, audio selection, subtitle edit, persisted reload, frozen export revision, 1440/900/540 layout; zero real writes')
} catch(error) { await page.screenshot({path:'local-reports/multitrack-editing-failure.png',fullPage:true}); throw error } finally { await page.unrouteAll({behavior:'ignoreErrors'}); await browser.close() }
