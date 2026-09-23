/** Isolated UI regression; every API request is fulfilled locally, never sent to production. */
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'msedge',headless:true})
const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'})
const taskId='fixture_handoff_001'
const bundle={task_id:taskId,status:'running',stage:'handoff_ready',input_fingerprint:'a'.repeat(64),manual:true,account_id:'account-a',account_name:'测试账号 A',platform:{name:'即梦AI',url:'https://jimeng.jianying.com/'},request:{platform:'jimeng',target_type:'frame',entity_id:'shot-fixture',slot_id:1,expected_version:1,prompt:'仅用于离线测试的提示词',requested_model:'fixture model',reference_file_ids:[]},result:null,remote:null}
const artifacts=[],posts=[],errors=[]
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE5cAAAAASUVORK5CYII=','base64')
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url())
 if(url.pathname.startsWith('/api/')){
  let data={data:[],total:0}
  const path=url.pathname
  if(request.method()==='POST')posts.push(path)
  if(path.endsWith('/handoff'))data=bundle
  else if(path.endsWith('/artifacts'))data=artifacts
  else if(path.endsWith('/handoff-progress')){bundle.stage=JSON.parse(request.postData()).stage;data={task_id:taskId,status:'running',stage:bundle.stage}}
  else if(path.endsWith('/handoff-result')){
   const payload=request.postDataBuffer().toString()
   assert.ok(payload.includes('name="receipt_json"'));assert.ok(payload.includes('fixture model'));assert.ok(payload.includes('name="file"'))
   bundle.status='succeeded';bundle.stage='completed';bundle.remote={conversation_url:'https://jimeng.jianying.com/result/1',message_id:'1'};bundle.result={file_id:'original',published:true}
   artifacts.push({artifact_id:'original',file_id:'original',modality:'image',published:true,watermark:'visible'})
   data={task_id:taskId,status:'succeeded',stage:'completed',result:bundle.result}
  }else if(path.endsWith('/official-export')){
   assert.ok(request.postDataBuffer().toString().includes('same_result_confirmed'))
   artifacts.push({artifact_id:'clean',file_id:'clean',source_file_id:'original',modality:'image',published:false,watermark:'official_clean'})
   data={file_id:'clean',artifact_id:'clean',published:false}
  }else if(path.includes('/targets/'))data={version:2,file_id:'original'}
  else if(path.endsWith('/adopt')){artifacts[1].published=true;data={file_id:'clean',published:true}}
  else if(path.includes('/files/'))return route.fulfill({contentType:'image/png',body:pixel})
  else if(request.method()!=='GET')throw new Error('Unexpected write '+path)
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 }
 if(url.hostname==='127.0.0.1'&&url.port==='5187')return route.continue()
 return route.abort()
})
try{
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message))
 await page.goto(`http://127.0.0.1:5187/web-generation/${taskId}`,{waitUntil:'domcontentloaded'})
 await page.getByText('测试账号 A',{exact:true}).waitFor({timeout:60000})
 assert.equal(posts.length,0)
 await page.reload();await page.getByText('测试账号 A',{exact:true}).waitFor();assert.equal(posts.length,0)
 await page.getByRole('button',{name:'已在官网提交',exact:true}).click()
 await page.getByRole('textbox',{name:'官网结果地址'}).fill('https://jimeng.jianying.com/result/1')
 await page.getByRole('textbox',{name:'官网结果编号'}).fill('1')
 await page.getByPlaceholder('本次官网实际选定的完整模型名').fill('fixture model')
 await page.getByLabel('官网原文件',{exact:true}).setInputFiles({name:'original.png',mimeType:'image/png',buffer:pixel})
 await page.getByRole('checkbox',{name:/已核对指定账号/}).check()
 await page.getByRole('button',{name:'校验并回填原业务',exact:true}).click()
 await page.getByText('已回填原业务对象',{exact:true}).waitFor()
 await page.getByPlaceholder('官网导出选项 / 已具备权益的依据').fill('离线模拟官网官方导出选项')
 await page.getByLabel('官方无水印文件',{exact:true}).setInputFiles({name:'clean.png',mimeType:'image/png',buffer:pixel})
 await page.getByRole('checkbox',{name:/确认来自同账号/}).check()
 await page.getByRole('button',{name:'校验并另存，不重新生成',exact:true}).click()
 await page.getByRole('button',{name:'采用此版本'}).waitFor()
 await page.getByRole('button',{name:'采用此版本'}).click()
 await page.getByText('已执行采用（当前选择以原业务为准）',{exact:true}).waitFor()
 for(const width of [1280,540]){await page.setViewportSize({width,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),'horizontal overflow')}
 assert.equal(posts.filter(path=>path.endsWith('/handoff-result')).length,1)
 assert.equal(posts.filter(path=>path.endsWith('/official-export')).length,1)
 assert.equal(posts.filter(path=>path.endsWith('/adopt')).length,1)
 assert.deepEqual(errors,[])
 console.log('PASS: refresh is read-only; multipart original/export/adoption; 1280/540 layout; no real API/platform calls')
}finally{await context.close();await browser.close()}
