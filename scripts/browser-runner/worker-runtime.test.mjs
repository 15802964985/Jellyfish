/** Execute the actual worker loop with isolated disk, loopback API and inert browser adapters. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fingerprint} from './receipts.mjs'

for(const scenario of ['retry','restart','captcha','references','login']){
const restart=scenario==='restart',captcha=['captcha','login'].includes(scenario),references=scenario==='references'
test(`worker recovers the original without duplicate submission (scenario=${scenario})`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'jellyfish-worker-'))
 const runner=join(root,'scripts/browser-runner'),local=join(root,'local-browser')
 await mkdir(runner,{recursive:true});await mkdir(local,{recursive:true})
 const reports=[];let paused=false,epoch=0,finished=false,activeReferences=0,maxReferences=0
 const task={task_id:'runtime-task-0001',token:'fixture',request:{prompt:'fixture',requested_model:'Fixture',reference_file_ids:references?[0,1,2,3,4]:[]}}
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk
  let data={}
  if(req.url.includes('/references/')){
   const index=Number(req.url.split('/').at(-1));activeReferences++;maxReferences=Math.max(maxReferences,activeReferences)
   await new Promise(resolve=>setTimeout(resolve,(3-index%3)*15))
   const bytes=Buffer.from('reference-'+index);res.setHeader('content-type','image/png');res.setHeader('x-content-sha256',createHash('sha256').update(bytes).digest('hex'));res.end(bytes);activeReferences--;return
  }
  if(req.url.endsWith('/accounts'))data=[{id:'fixture',platform:'fixture'}]
  else if(req.url.endsWith('/claim'))data=task
  else if(req.url.endsWith('/resume')){
   if(paused){epoch=1;paused=false}
   data={status:'running',paused:false,recovery_epoch:epoch}
  }else if(req.url.endsWith('/stage')){const report=JSON.parse(body);reports.push(report);if(report.paused)paused=true}
  else if(req.url.endsWith('/result')){finished=true;data={published:true}}
  res.setHeader('content-type','application/json');res.end(JSON.stringify(data))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
  if(restart){
   const account=join(local,'accounts/fixture');await mkdir(join(account,'receipts'),{recursive:true})
   await writeFile(join(account,'current.json'),JSON.stringify({task,recovery:{held:true,epoch:0,collectFailures:10,prepareFailures:0}}))
   await writeFile(join(account,'receipts/runtime-task-0001.json'),JSON.stringify({task_id:task.task_id,fingerprint:fingerprint(task.request),stage:'submitted',remote:{conversation_url:'https://fixture.invalid/1',message_id:'1'}}))
  }
  await writeFile(join(local,'runner-config.json'),JSON.stringify({backend_url:`http://127.0.0.1:${server.address().port}`,token:'fixture'}))
  await writeFile(join(runner,'stub.mjs'),`
import {writeFile,readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
let checks=0,closed=false,submits=0,collects=${restart?1:0};
const page={isClosed:()=>closed,goto:async()=>{},screenshot:async()=>{}};
export const chromium={launchPersistentContext:async()=>({pages:()=>[page],close:async()=>{closed=true}})};
export const PLATFORM_ADAPTERS={fixture:{home:'https://fixture.invalid',conversation:/^https:/,dismiss:async()=>{},blocker:async()=>${scenario==='login'}&&++checks<=3?'needs_login':null,discover:async()=>['Fixture'],image:(_page,_paths,path)=>({
 prepare:async()=>{if(${references}){for(let i=0;i<5;i++)if(await readFile(_paths[i],'utf8')!=='reference-'+i)throw Error('reference order changed')}if(${restart})throw Error('repeated preparation')},submit:async()=>{if(${restart}||++submits!==1)throw Error('duplicate submit');return {conversation_url:'https://fixture.invalid/1',message_id:'1'}},
 collect:async()=>{if(++collects===1){const error=Error(${captcha?"'请完成安全验证'":"'explicit selection'"});error.code='NEEDS_USER';throw error}const data=Buffer.from('original');await writeFile(path,data);closed=true;return {path,sha256:createHash('sha256').update(data).digest('hex')}}
})}};
`)
  let source=await readFile(new URL('./worker.mjs',import.meta.url),'utf8')
  source=source.replace("from 'playwright'","from './stub.mjs'").replace("from './platform-adapters.mjs'","from './stub.mjs'")
  for(const file of ['receipts.mjs','doubao-session.mjs'])source=source.replace(`'./${file}'`,JSON.stringify(new URL(file,import.meta.url).href))
  source=source.replace('setTimeout(r,ms)','setTimeout(r,0)')
  await writeFile(join(runner,'worker.mjs'),source)
  const child=spawn(process.execPath,[join(runner,'worker.mjs'),'fixture'],{stdio:['ignore','pipe','pipe']})
  let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v)
  const timer=setTimeout(()=>child.kill(),15000)
  const code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer)
  assert.equal(code,0,output);assert.ok(finished,output);if(references)assert.equal(maxReferences,3)
  assert.equal(reports.filter(r=>r.paused).length,captcha?0:1)
  assert.ok(reports.some(r=>captcha?r.stage==='awaiting_user'&&r.recovery_epoch===0:r.recovery_epoch===1))
  const receipt=JSON.parse(await readFile(join(local,'accounts/fixture/receipts/runtime-task-0001.json'),'utf8'))
  assert.equal(receipt.stage,'completed');assert.equal(receipt.remote.message_id,'1')
 }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})}
})

}
