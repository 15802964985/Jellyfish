/** Submission grouping uses IDs and observed attachment blocks, never fuzzy prompt similarity. */
import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {submissionGroup,submissionEnd} from './doubao-submission.mjs';
import {doubaoImageAdapter} from './doubao-adapter.mjs';import {doubaoVideoAdapter} from './doubao-video.mjs';
/** Build structural rows for split/combined attachment layouts without website traffic. */
const row=(id,text='',attachments=0,user=true)=>({id:String(id),text,attachments,user});
for(const count of [0,1,3])for(const layout of ['before','after','combined'])test(count+' references '+layout+' bind one group',()=>{
 const text=row(100,'rendered prompt',layout==='combined'?count:0),refs=layout==='combined'?[]:Array.from({length:count},(_,i)=>row(200+i,'',1));
 const prefix=layout==='after'?[text,...refs]:[...refs,text],rows=[...prefix,row(900,'result',0,false)],bound=submissionGroup(rows,count);
 assert.equal(bound.user_message_id,'100');assert.deepEqual(bound.user_message_ids,prefix.map(r=>r.id));assert.equal(bound.message_id,'900');assert.equal(submissionEnd(rows,bound),prefix.length-1);
 assert.throws(()=>submissionEnd([row(99,'foreign input'),...rows],bound),/已变化/);
});
test('unknown empty node and incomplete references remain unresolved',()=>{
 assert.equal(submissionGroup([row(1),row(2,'prompt'),row(3,'reply',0,false)],1),null);
 assert.equal(submissionGroup([row(1,'',1),row(2,'prompt')],3),null);
 assert.equal(submissionGroup([row(1,'',1)],1),null);
});
test('extra input, extra attachments, duplicate IDs and missing anchor fail closed',()=>{
 assert.throws(()=>submissionGroup([row(1,'a'),row(2,'b')],0),/多个文本/);
 assert.throws(()=>submissionGroup([row(1,'',2),row(2,'text')],1),/超过/);
 assert.throws(()=>submissionGroup([row(1,'',1),row(1,'text')],1),/重复/);
 assert.throws(()=>submissionEnd([row(1,'a')],{user_message_id:'2'}),/编号缺失/);
});
/** Render the real observed block_type marker in local fixtures; no generation requests leave the browser. */
const block='<div data-plugin-identifier="block_type:10052"><picture><img></picture></div>';
const user=(id,body)=>'<div data-message-id="'+id+'" class="justify-end">'+body+'</div>';
test('actual submit/reconcile handles 0/1/3 references and restart without resending',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<textarea></textarea>'}));
 for(const count of [0,1,3]){
  await page.goto('https://www.doubao.com/chat/');
  const html=Array.from({length:count},(_,i)=>user(200+i,block)).join('')+user(100,'rendered message')+'<div data-message-id="900">accepted</div>';
  await page.evaluate(html=>{window.sends=0;document.querySelector('textarea').onkeydown=e=>{if(e.key==='Enter'){window.sends++;history.pushState({},'', '/chat/123');document.body.innerHTML=html}}},html);
  const request={local_task_id:'fixture-task',prompt:'exact draft',reference_file_ids:Array.from({length:count},(_,i)=>String(i))};
  const adapter=doubaoImageAdapter(page,[],null),saved=[];const remote=await adapter.submit(request,async a=>saved.push(a));
  assert.equal(remote.user_message_id,'100');assert.equal(remote.user_message_ids.length,count+1);assert.equal(await page.evaluate(()=>window.sends),1);
  assert.ok(saved.some(a=>a.user_message_ids?.length===count+1));
  await page.route('https://www.doubao.com/chat/123',r=>r.fulfill({contentType:'text/html',body:html}));
  const recovered=await adapter.reconcile({binding_version:2,local_task_id:'fixture-task',exclusive_empty:true,conversation_url:remote.conversation_url},request);
  assert.deepEqual(recovered.user_message_ids,remote.user_message_ids);
 }
 const html=user(201,block)+user(202,block)+user(100,'displayed prompt')+'<div data-message-id="900"><video></video></div>';
 await page.route('https://www.doubao.com/chat/123',r=>r.fulfill({contentType:'text/html',body:html}));
 const video=await doubaoVideoAdapter(page,[],null).reconcile({binding_version:2,local_task_id:'video-task',exclusive_empty:true,conversation_url:'https://www.doubao.com/chat/123'},{local_task_id:'video-task',prompt:'different presentation',reference_file_ids:['a','b']});
 assert.equal(video.message_id,'900');assert.deepEqual(video.user_message_ids,['201','202','100']);
 }finally{await browser.close()}
});
