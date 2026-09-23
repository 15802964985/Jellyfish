/** 使用实际保存队列模拟慢请求、并行编辑、切镜头和失败重试，不接触数据库。 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({channel:'msedge',headless:true})
const page=await browser.newPage()
try {
 await page.route('**/api/**',route=>route.abort())
 await page.goto('http://127.0.0.1:5174/')
 const result=await page.evaluate(async()=>{
  const {ShotDetailDraftStore}=await import('/src/pages/aiStudio/chapter/components/useShotDetailSync.ts')
  const requests=[]
  const store=new ShotDetailDraftStore(()=>{},(id,patch)=>new Promise((resolve,reject)=>requests.push({id,patch,resolve,reject})))
  const pause=()=>new Promise(resolve=>setTimeout(resolve,15))
  store.load('a',{id:'a',duration:1,atmosphere:'old'})
  store.load('b',{id:'b',duration:9,atmosphere:'b'})
  store.patch('a',{duration:2});const first=store.flush('a')
  store.patch('a',{atmosphere:'new',duration:3})
  requests[0].resolve({id:'a',duration:2,atmosphere:'old'});await pause()
  const during={...store.entry('a').detail}
  requests[1].resolve({id:'a',duration:3,atmosphere:'new'});await first
  store.patch('a',{duration:4});const oldShot=store.flush('a')
  store.load('b',{id:'b',duration:10,atmosphere:'b2'})
  requests[2].resolve({id:'a',duration:4,atmosphere:'new'});await oldShot
  const other={...store.entry('b').detail}
  store.patch('a',{atmosphere:'retry'})
  const failure=store.flush('a').catch(()=>true)
  requests[3].reject(new Error('offline'));await failure
  const failed={pending:{...store.entry('a').pending},error:store.entry('a').error}
  const retry=store.flush('a');requests[4].resolve({id:'a',duration:4,atmosphere:'retry'});await retry
  return {during,other,failed,final:store.entry('a').detail,requests:requests.map(({id,patch})=>({id,patch}))}
 })
 assert.equal(result.during.duration,3);assert.equal(result.during.atmosphere,'new')
 assert.equal(result.other.id,'b');assert.equal(result.other.duration,10)
 assert.deepEqual(result.requests[1].patch,{duration:3,atmosphere:'new'})
 assert.equal(result.failed.pending.atmosphere,'retry');assert.ok(result.failed.error)
 assert.equal(result.final.atmosphere,'retry');assert.equal(result.requests.length,5)
 console.log('PASS: latest fields survive slow response, writes serialized, other shot isolated, failure preserves draft, explicit retry; zero network writes')
}finally{await browser.close()}
