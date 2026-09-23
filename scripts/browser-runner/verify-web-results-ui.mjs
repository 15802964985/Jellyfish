/** Offline React regression: every API request is fulfilled locally, including adoption. */
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const base=process.env.WEB_RESULTS_TEST_URL||'http://127.0.0.1:18792'
const browser=await chromium.launch({channel:'msedge',headless:true})
let current='file-0',version=5,extraCandidate=false
const posts=[],scopes=[],errors=[]
try{
 const context=await browser.newContext({serviceWorkers:'block',viewport:{width:540,height:900}}),page=await context.newPage()
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.pathname==='/result-fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/src/components/__fixtures__/WebResultsCheck.tsx"></script>'})
  if(url.pathname.startsWith('/api/')){
   let data={}
   if(url.pathname.endsWith('/handoff/jobs')){
    const entity=url.searchParams.get('entity_id');scopes.push(Object.fromEntries(url.searchParams))
    data=[{task_id:entity==='asset-a'?'task-a':'task-b',target_type:'prop',entity_id:entity,slot_id:7,status:'succeeded',candidate_count:entity==='asset-a'?3:extraCandidate?4:2,model:'fixture',created_at:'2026-09-23T01:00:00Z'}]
   }else if(url.pathname.endsWith('/artifacts')){
    const n=url.pathname.includes('task-a')?3:2;data=Array.from({length:n},(_,i)=>({artifact_id:'artifact-'+i,file_id:'file-'+i,modality:'image'}))
   }else if(url.pathname.includes('/targets/'))data={version,file_id:current}
   else if(url.pathname.endsWith('/adopt')){
    posts.push(req.postDataJSON());assert.equal(posts.at(-1).expected_version,version);assert.equal(posts.at(-1).expected_current_file_id,current)
    current='file-1';version++;data={published:true,file_id:current}
   }else if(url.pathname.includes('/files/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNkYPjPwMDAxAAGAAsfAQMU4wsAAAAAAElFTkSuQmCC','base64')})
   else throw Error('Unexpected API path: '+url.pathname)
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
  }
  if(url.origin===base)return route.continue()
  return route.abort()
 })
 await page.goto(base+'/result-fixture')
 await page.getByRole('button',{name:'选择生成结果（3）',exact:true}).click()
 const box=await page.locator('.ant-modal').boundingBox();assert.ok(box&&box.x>=0&&box.x+box.width<=540)
 await page.getByRole('button',{name:'采用此结果',exact:true}).first().click()
 await page.waitForFunction(()=>document.body.innerText.includes('已采用所选结果'))
 assert.equal(posts.length,1)
 assert.equal(page.url(),base+'/result-fixture')
 await page.getByRole('button',{name:'Close',exact:true}).click()
 await page.getByRole('button',{name:'切换对象',exact:true}).click()
 await page.getByRole('button',{name:'选择生成结果（2）',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'选择生成结果（3）',exact:true}).count(),0)
 assert.ok(scopes.some(s=>s.entity_id==='asset-a'&&s.slot_id==='7'&&s.target_type==='prop'))
 assert.ok(scopes.some(s=>s.entity_id==='asset-b'&&s.slot_id==='7'))
 // Completion notification must bypass the ten-second fallback, without navigation or adoption.
 extraCandidate=true;const started=Date.now()
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jellyfish:task-settled',{detail:{taskId:'task-b',status:'succeeded'}})))
 await page.getByRole('button',{name:'选择生成结果（4）',exact:true}).waitFor({timeout:2500})
 assert.ok(Date.now()-started<2500);assert.equal(posts.length,1)
 assert.deepEqual(errors,[])
 console.log('INLINE_CANDIDATE_SELECTION_OK: original-page adoption, observed file/version CAS, object isolation, mobile layout, zero real writes')
}finally{await browser.close()}
