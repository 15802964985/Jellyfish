/** Real workbench/account routes with every API request mocked and no supplier traffic. */
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const base=process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:5189'
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext({viewport:{width:1366,height:900},serviceWorkers:'block'})
const posts=[],errors=[]
const bundle={task_id:'recovery-fixture',status:'running',stage:'needs_user',paused:true,recovery_epoch:2,manual:false,can_import_original:true,error:'采集暂停，保留原账号',account_id:'account-a',account_name:'原账号 A',input_fingerprint:'a'.repeat(64),platform:{name:'豆包',url:'https://www.doubao.com/'},request:{platform:'doubao',target_type:'frame',entity_id:'shot-a',slot_id:1,expected_version:1,requested_model:'Seedream 4.5',prompt:'原提示词',reference_file_ids:[]},remote:{conversation_url:'https://www.doubao.com/chat/123',message_id:'456'}}
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname
 if(path.startsWith('/api/')){
  let data={data:[],meta:{total:0}}
  if(req.method()!=='GET')posts.push({path,body:req.postDataJSON()})
  if(path.endsWith('/handoff'))data=bundle
  else if(path.endsWith('/artifacts'))data=[]
  else if(path.endsWith('/recover')){assert.equal(req.postDataJSON().expected_recovery_epoch,2);bundle.paused=false;bundle.can_import_original=false;bundle.recovery_epoch++;data={task_id:bundle.task_id,status:'running',stage:'needs_user'}}
  else if(path.endsWith('/cancel')){bundle.status='cancelled';bundle.stage='cancelled';data={}}
  else if(path.endsWith('/accounts'))data=[{id:'account-a',display_name:'原账号 A',platform:'doubao',enabled:true,online:false,session_state:'offline',supported_models:['Seedream 4.5'],active_task_id:bundle.status==='cancelled'?null:bundle.task_id,readiness:{code:'busy',blocking:true,reason:'原任务占用',action:'恢复或取消'}}]
  else if(path.endsWith('/desktop/status'))data={online:true,commands:[]}
  else if(path.endsWith('/platforms'))data={doubao:{name:'豆包',status:'image_candidate',url:'https://www.doubao.com/'}}
  else if(req.method()!=='GET')throw Error('Unexpected write '+path)
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 }
 if(url.origin===base)return route.continue()
 return route.abort()
})
try{
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
 await page.goto(base+'/web-generation/recovery-fixture')
 await page.getByRole('button',{name:'恢复原任务',exact:true}).waitFor()
 assert.equal(posts.length,0)
 await page.reload();await page.getByRole('button',{name:'恢复原任务',exact:true}).waitFor();assert.equal(posts.length,0)
 await page.getByRole('button',{name:'恢复原任务',exact:true}).click()
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(n=>n.textContent==='恢复原任务'))
 assert.equal(posts.length,1)
 await page.getByRole('link',{name:'查看原账号',exact:true}).click()
 await page.getByRole('link',{name:'查看原任务（保留账号）',exact:true}).click()
 await page.getByRole('button',{name:'取消并释放账号',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:/OK|确.*定/}).click()
 await page.getByText('豆包 · 已取消',{exact:true}).waitFor()
 assert.equal(posts.length,2);assert.ok(posts[1].path.endsWith('/cancel'))
 await page.reload();await page.getByText('豆包 · 已取消',{exact:true}).waitFor();assert.equal(posts.length,2)
 await mkdir('local-reports/web-reliability',{recursive:true})
 for(const width of [1366,540]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:`local-reports/web-reliability/recovery-${width}.png`,fullPage:true})}
 assert.deepEqual(errors,[])
 console.log('PASS: persisted pause, explicit same-task recovery, account backlink, cancel, refresh, desktop/mobile; 0 real writes')
}finally{await context.close();await browser.close()}
