/** Durable local receipts: never resubmit after an uncertain browser click. */
import { mkdir, readFile, rename, writeFile, rmdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'

/** Serialize recursively so changing reference order changes the request identity. */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key,stable(value[key])]))
  return value
}

/** Compute an immutable identity covering business target, prompt and ordered files. */
export function fingerprint(request) {
  return createHash('sha256').update(JSON.stringify(stable(request))).digest('hex')
}

/** Persist only beneath an explicit runtime directory, using atomic replacement. */
export class ReceiptStore {
  constructor(directory) { this.directory=resolve(directory) }
  path(id) {
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(id)) throw new Error('Invalid task ID')
    return join(this.directory,`${id}.json`)
  }
  async read(id) {
    try { return JSON.parse(await readFile(this.path(id),'utf8')) }
    catch(error) { if(error.code==='ENOENT') return null; throw error }
  }
  async write(id,value) {
    await mkdir(this.directory,{recursive:true})
    const path=this.path(id), temp=`${path}.${randomUUID()}.tmp`
    await writeFile(temp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600})
    await rename(temp,path)
    return value
  }
  async begin(id,request) {
    const previous=await this.read(id), hash=fingerprint(request)
    if(previous && previous.fingerprint!==hash) throw new Error('Task input changed; refusing to reuse receipt')
    return previous || await this.write(id,{task_id:id,fingerprint:hash,stage:'prepared',updated_at:new Date().toISOString()})
  }
}

/** Hash files incrementally so video verification does not allocate the whole original. */
export async function fileDigest(path) {
 const hash=createHash('sha256');let bytes=0
 for await(const chunk of createReadStream(path)){hash.update(chunk);bytes+=chunk.length}
 return {sha256:hash.digest('hex'),bytes}
}

/** Advance a single task without repeating generation after submission begins.
 * Adapter methods operate on the actual webpage; backend finalization must be idempotent.
 * Needs-user and uncertain states retain receipts, enabling manual reconciliation.
 */
async function executeLocked({task,store,adapter,finalize,onStage=async()=>{}}) {
  let receipt=await store.begin(task.id,task.request)
  const request={...task.request,local_task_id:task.id}
  const save=async patch=>{
    receipt=await store.write(task.id,{...receipt,...patch,updated_at:new Date().toISOString()})
    await onStage(receipt.stage)
  }
  /** Persist bounded phase totals without prompts or media URLs, including failed attempts. */
  const measure=async(name,run)=>{
   const start=performance.now()
   try{return await run()}finally{
    const old=receipt.timings?.[name]||{attempts:0,total_ms:0}
    receipt=await store.write(task.id,{...receipt,timings:{...receipt.timings,[name]:{attempts:old.attempts+1,total_ms:old.total_ms+Math.round(performance.now()-start)}}})
   }
  }
  if(receipt.stage==='completed') return receipt
  if(receipt.stage==='prepared') {
    await measure('prepare',()=>adapter.prepare(request))
    // Persist intent BEFORE clicking. An exception after this point must never resubmit.
    await save({stage:'submitting'})
    let remote
    try {
      remote=await measure('submit',()=>adapter.submit(request,async anchor=>{await save({anchor})}))
      if(!remote?.conversation_url || !remote?.message_id) throw new Error('Missing verified remote receipt')
    } catch(error) {
      await save({stage:'submission_unknown',reason:'需要核对豆包页面是否已经受理，禁止自动重复提交'})
      throw error
    }
    // A failed backend receipt report must not erase an already verified remote identity.
    await save({stage:'submitted',remote})
  }
  if(['submitting','submission_unknown'].includes(receipt.stage)) {
    // Reconcile a persisted user message in its original account; never call submit again.
    const remote=receipt.anchor&&adapter.reconcile?await adapter.reconcile(receipt.anchor,request,async anchor=>{await save({anchor})}):null
    if(!remote?.conversation_url||!remote?.message_id) throw new Error('提交结果不确定：请人工核对原会话，不能重新生成')
    await save({stage:'submitted',remote})
  }
  if(receipt.stage==='submitted') {
    /** Cache only an exact task/remote/source descriptor, and rehash before reuse. */
    const collection={original:async(descriptor,download)=>{
     const key=fingerprint({remote:receipt.remote,descriptor})
     const cached=receipt.originals?.[key]
     if(cached){
      try{
       const checked=await fileDigest(cached.path)
       if(checked.sha256!==cached.sha256||checked.bytes!==cached.bytes)throw new Error('已下载原件校验不符，停止回填')
       return cached
      }catch(error){if(error.code!=='ENOENT')throw error}
     }
     const item=await download()
     if(!item?.path||!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.bytes)||item.bytes<=0)throw new Error('原件检查点缺少文件校验')
     if(!receipt.originals?.[key]&&Object.keys(receipt.originals||{}).length>=64)throw new Error('原件列表反复变化，停止自动采集')
     receipt=await store.write(task.id,{...receipt,originals:{...receipt.originals,[key]:item},updated_at:new Date().toISOString()})
     return item
    }}
    const output=await measure('collect',()=>adapter.collect(receipt.remote,request,collection))
    if(!(output?.outputs||[output]).length || !(output?.outputs||[output]).every(item=>item?.path && /^[a-f0-9]{64}$/.test(item.sha256))) throw new Error('Result must be downloaded and hashed before finalizing')
    await save({stage:'downloaded',output})
  }
  if(receipt.stage==='downloaded') {
    // Failed HTTP finalization retries this exact local file, never the platform generation.
    const result=await measure('archive',()=>finalize({task,output:receipt.output,remote:receipt.remote}))
    await save({stage:'completed',result})
  }
  return receipt
}

/** A process crash leaves the lock for explicit reconciliation, never blind takeover. */
export async function executeTask(options) {
  const lock=options.store.path(options.task.id)+'.lock'
  await mkdir(options.store.directory,{recursive:true})
  try {await mkdir(lock)} catch(error) {
    if(error.code!=='EEXIST') throw error
    let owner
    try {owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'))} catch {throw new Error('Task already owned or interrupted; reconcile before resuming')}
    if(!Number.isSafeInteger(owner.pid) || owner.pid<1) throw new Error('Invalid receipt lock owner')
    try {process.kill(owner.pid,0);throw new Error('Task already owned or interrupted; reconcile before resuming')}
    catch(alive) {if(alive.code!=='ESRCH')throw alive}
    // A dead local process can release only its empty lock. Receipt stage still forbids resubmission.
    await unlink(join(lock,'owner.json'));await rmdir(lock);await mkdir(lock)
  }
  await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}))
  try {return await executeLocked(options)} finally {await unlink(join(lock,'owner.json'));await rmdir(lock)}
}
