/** Inspect actual asset/studio routes; all mutations and model renders are fulfilled locally. */
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const base=process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:7788'
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage({viewport:{width:1600,height:1000}})
page.setDefaultTimeout(15000)
const posts=[],errors=[];let blocked=0
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname
 if(path.endsWith('/web-generation/accounts'))return route.fulfill({json:[{id:'offline-account',platform:'doubao',display_name:'隔离验证账号',enabled:true,online:true,session_state:'ready',supported_models:['Seedream 4.5'],readiness:{code:'ready',reason:'可自动执行',action:'',blocking:false}}]})
 if(path.endsWith('/execution-status'))return route.fulfill({json:{available:true,reasons:[],notices:[],eligible_account_ids:['offline-account']}})
 if(path.includes('/web-generation/')&&path.includes('/models/'))return route.fulfill({json:{revision:0,models:[{name:'Seedream 4.5',enabled:true,is_default:true,automatic_supported:true}]}})
 if(!['GET','OPTIONS'].includes(req.method())){
  if(path.endsWith('/render'))return route.fulfill({json:{data:{execution_prompt:'隔离验收：保持原业务目标与参考图，生成单张画面。',variables_snapshot:{pack:{},quality_source_fingerprint:'fixture'},recommended_media:{references:[]}}}})
  if(path.endsWith('/web-generation/images')){posts.push(req.postDataJSON());return route.fulfill({json:{task_id:'offline-business-fixture',status:'pending',stage:'queued'}})}
  blocked++;return route.fulfill({status:409,json:{message:'隔离验收阻止业务写入'}})
 }
 if(path.includes('offline-business-fixture'))return route.fulfill({json:{data:{id:'offline-business-fixture',task_id:'offline-business-fixture',status:'pending',progress:0}}})
 return route.continue()
})
/** Confirm one real business entry, with only its final task POST intercepted. */
async function submitFromPreview(dialog,target){
 await dialog.getByText('平台网页',{exact:true}).click()
 await dialog.getByRole('button',{name:'平台网页生成',exact:true}).click()
 const web=page.getByRole('dialog').filter({hasText:'平台网页生成 · 模型与账号'})
 await web.getByText('本机执行器已就绪',{exact:true}).waitFor()
 await web.getByRole('checkbox').check()
 const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/web-generation/images'))
 await Promise.all([sent,web.getByRole('button',{name:'提交后台任务',exact:true}).click()])
 assert.equal(posts.at(-1).target_type,target);assert.ok(posts.at(-1).prompt.trim());assert.ok(posts.at(-1).expected_version)
 await web.waitFor({state:'hidden'})
}
try{
 const scenes=await (await fetch('http://127.0.0.1:8000/api/v1/studio/entities/scene?page=1&page_size=20')).json()
 const scene=scenes.data.items.find(row=>row.id==='3eb8db30-e1ce-53de-b359-3c603dd97940')||scenes.data.items[0]
 await page.goto(base+`/assets/scenes/${scene.id}/edit`)
 await page.getByRole('button',{name:/^生\s*成$/}).first().click()
 const preview=page.getByRole('dialog').filter({hasText:'提示词内容预览'})
 await preview.getByText('平台网页',{exact:true}).waitFor();await submitFromPreview(preview,'scene')
 assert.equal(posts[0].entity_id,scene.id)
 await page.goto(base+'/projects/aca3f2bd-f274-4ca6-b530-892a5a57b441/chapters/643f01c6-b6a4-5327-ae11-1d142be61cc3/studio?shotId=2056143f-48ac-4eef-9f8e-86cec575e7af')
 await page.getByText('清晨林荫道侧跟拍小女孩背大书包蹲看蚂蚁并回头确认妈妈',{exact:true}).first().click()
 const expand=page.getByTitle('展开属性面板（P / Ctrl/Cmd+I）');if(await expand.isVisible())await expand.click()
 await page.getByRole('tab',{name:'关键帧与参考图',exact:true}).click()
 await page.getByRole('button',{name:/^生\s*成$/}).first().click()
 const frame=page.getByRole('dialog').filter({hasText:'参考图与参数 → 提示词 → 生成 → 查看并采用图片'})
 await frame.getByText('平台网页',{exact:true}).waitFor();await submitFromPreview(frame,'frame')
 assert.equal(posts[1].entity_id,'2056143f-48ac-4eef-9f8e-86cec575e7af')
 assert.equal(posts.length,2);assert.deepEqual(errors,[])
 console.log(JSON.stringify({passed:'actual scene and frame entry preserve target and require confirmation',mockedSubmissions:posts.length,blocked,realMutations:0}))
}catch(error){console.log((await page.locator('body').innerText()).slice(-5000));throw error}finally{await page.unrouteAll({behavior:'wait'});await browser.close()}
