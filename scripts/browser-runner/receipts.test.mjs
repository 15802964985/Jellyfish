/** Offline regression of submission uncertainty, recovery and target isolation. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ReceiptStore, executeTask, fingerprint, fileDigest } from './receipts.mjs'

/** Keep all test artifacts in one uniquely-created temporary directory. */
async function fixture(run) {
 const directory=await mkdtemp(join(tmpdir(),'jellyfish-web-receipts-'))
 try {await run(new ReceiptStore(directory))} finally {await rm(directory,{recursive:true,force:true})}
}
const task={id:'test_task_123456789',request:{target:{kind:'shot_frame_slot',slot_id:1},prompt:'a red cup',references:['a','b']}}

test('ordered references and target are part of immutable request identity',()=>{
 assert.notEqual(fingerprint(task.request),fingerprint({...task.request,references:['b','a']}))
 assert.notEqual(fingerprint(task.request),fingerprint({...task.request,target:{kind:'shot_frame_slot',slot_id:2}}))
})
test('uncertain submission never clicks twice after restart',()=>fixture(async store=>{
 let submits=0
 const adapter={prepare:async()=>{},submit:async()=>{submits++;throw new Error('connection lost')}}
 await assert.rejects(executeTask({task,store,adapter,finalize:async()=>{}}),/connection lost/)
 await assert.rejects(executeTask({task,store,adapter,finalize:async()=>{}}),/提交结果不确定/)
 assert.equal(submits,1)
}))
test('archive retry reuses local output and completion is idempotent',()=>fixture(async store=>{
 let submits=0,collects=0,archives=0
 const adapter={prepare:async()=>{},submit:async()=>{submits++;return {conversation_url:'https://www.doubao.com/chat/123',message_id:'m1'}},collect:async()=>{collects++;return {path:'result.png',sha256:'a'.repeat(64)}}}
 const finalize=async()=>{archives++;if(archives===1)throw new Error('backend offline');return {file_id:'saved'}}
 await assert.rejects(executeTask({task,store,adapter,finalize}),/backend offline/)
 assert.equal((await executeTask({task,store,adapter,finalize})).stage,'completed')
 await executeTask({task,store,adapter,finalize})
 assert.equal(submits,1);assert.equal(collects,1);assert.equal(archives,2)
 await assert.rejects(executeTask({task:{...task,request:{...task.request,prompt:'new'}},store,adapter,finalize}),/input changed/)
}))
test('invalid IDs cannot escape receipt directory',()=>fixture(async store=>{
 await assert.rejects(store.begin('../escape/123456789',{}),/Invalid task ID/)
}))

test('concurrent invocation of one local receipt cannot submit twice',()=>fixture(async store=>{
 let release,entered
 const started=new Promise(r=>entered=r), gate=new Promise(r=>release=r)
 let submits=0
 const adapter={prepare:async()=>{entered();await gate},submit:async()=>{submits++;return {conversation_url:'https://www.doubao.com/chat/test',message_id:'m1'}},collect:async()=>({path:'image.png',sha256:'b'.repeat(64)})}
 const running=executeTask({task,store,adapter,finalize:async()=>({file_id:'file1'})})
 await started
 await assert.rejects(executeTask({task,store,adapter,finalize:async()=>{}}),/already owned/)
 release();await running
 assert.equal(submits,1)
}))


test('lost backend stage acknowledgement preserves verified remote receipt',()=>fixture(async store=>{
 let submits=0,failed=false
 const remote={conversation_url:'https://www.doubao.com/chat/123',message_id:'456'}
 const adapter={prepare:async()=>{},submit:async()=>{submits++;return remote},collect:async()=>({path:'image.png',sha256:'c'.repeat(64)})}
 const onStage=async stage=>{if(stage==='submitted'&&!failed){failed=true;throw new Error('stage offline')}}
 const options={task,store,adapter,onStage,finalize:async()=>({file_id:'saved'})}
 await assert.rejects(executeTask(options),/stage offline/)
 const receipt=await store.read(task.id)
 assert.equal(receipt.stage,'submitted');assert.deepEqual(receipt.remote,remote)
 assert.equal((await executeTask(options)).stage,'completed');assert.equal(submits,1)
}))

/** A delayed assistant response resumes the same checkpoint, with no second submission. */
test('known user-message checkpoint reconciles after restart without sending again',()=>fixture(async store=>{
 let submits=0
 const anchor={conversation_url:'https://www.doubao.com/chat/123',user_message_id:'456'}
 const adapter={prepare:async()=>{},submit:async(req,checkpoint)=>{submits++;await checkpoint(anchor);throw Error('assistant delayed')},reconcile:async saved=>{assert.deepEqual(saved,anchor);return {...saved,message_id:'789'}},collect:async()=>({path:'image.png',sha256:'d'.repeat(64)})}
 const options={task,store,adapter,finalize:async()=>({file_id:'saved'})}
 await assert.rejects(executeTask(options),/assistant delayed/)
 assert.equal((await executeTask(options)).stage,'completed');assert.equal(submits,1)
}))

/** A partial batch survives process-level re-entry without another website generation. */
test('partial originals resume by identity, detect tampering, and expose phase timings',()=>fixture(async store=>{
 let submits=0,downloads=0,attempt=0
 const path=join(store.directory,'original.png')
 const adapter={prepare:async()=>{},submit:async()=>{submits++;return {conversation_url:'https://www.doubao.com/chat/123',message_id:'456'}},
 collect:async(_remote,_request,collection)=>{
  const output=await collection.original({message_id:'456',ordinal:0,source:'original'},async()=>{downloads++;await writeFile(path,'exact bytes');return {path,...await fileDigest(path)}})
  if(++attempt===1)throw Error('second original unavailable')
  return output
 }}
 const options={task,store,adapter,finalize:async()=>({published:true})}
 await assert.rejects(executeTask(options),/second original/)
 const pending=await store.read(task.id);assert.equal(pending.stage,'submitted');assert.equal(Object.keys(pending.originals).length,1)
 await writeFile(path,'tampered')
 await assert.rejects(executeTask(options),/校验不符/)
 assert.equal(downloads,1)
 await unlink(path)
 const finished=await executeTask(options)
 assert.equal(finished.stage,'completed');assert.equal(submits,1);assert.equal(downloads,2)
 assert.equal(finished.timings.collect.attempts,3);assert.equal(finished.timings.archive.attempts,1)
}))

/** Stable candidates reuse verified bytes, while changed sources cannot reuse an old checkpoint. */
test('retry skips downloaded original but invalidates a changed source descriptor',()=>fixture(async store=>{
 let downloads=0,attempt=0,source='source-a'
 const adapter={prepare:async()=>{},submit:async()=>({conversation_url:'https://www.doubao.com/chat/123',message_id:'456'}),collect:async(_remote,_request,c)=>{
  const output=await c.original({message_id:'456',ordinal:0,source},async()=>{downloads++;const path=join(store.directory,source);await writeFile(path,source);return {path,...await fileDigest(path)}})
  if(++attempt<3)throw Error('later original failed')
  return output
 }}
 const options={task,store,adapter,finalize:async()=>({published:true})}
 await assert.rejects(executeTask(options),/later original/)
 await assert.rejects(executeTask(options),/later original/);assert.equal(downloads,1)
 source='source-b';await executeTask(options);assert.equal(downloads,2)
}))
