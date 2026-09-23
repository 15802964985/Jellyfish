/** Offline real-adapter recovery: the second download fails, the first must not repeat. */
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {chromium} from 'playwright';import {ReceiptStore,executeTask} from './receipts.mjs';
import {doubaoImageAdapter} from './doubao-adapter.mjs';import {doubaoVideoAdapter} from './doubao-video.mjs';
for(const modality of ['image','video'])test(modality+' persists partial downloads across actual adapter retries',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jellyfish-original-checkpoint-')),store=new ReceiptStore(join(dir,'receipts'));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage(),url='https://www.doubao.com/chat/123';
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNkYPjPwMDAxAAGAAsfAQMU4wsAAAAAAElFTkSuQmCC';
 const media=modality==='image'?[0,1].map(i=>'<img alt="image" width="80" height="80" src="'+png+'" onclick="window.selected='+i+';window.download.hidden=false">').join(''):[0,1].map(i=>'<video style="width:80px;height:80px" src="https://fixture.invalid/'+i+'.mp4" onclick="window.selected='+i+';window.download.hidden=false"></video>').join('');
 const html='<div data-message-id="100" class="justify-end">input</div><div data-message-id="200">'+media+'</div><button id="download" hidden class="bg-dbx-fill-highlight" data-trigger-type="hover"><svg><path d="M20.375 14.8535"/></svg>下载</button>';
 await page.route('**/*',r=>r.request().url()===url?r.fulfill({contentType:'text/html',body:html}):r.abort());await page.goto(url);
 await page.evaluate(()=>{
 window.downloads=[0,0];document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelector('#download').hidden=true});
 document.querySelector('#download').onclick=()=>{const i=window.selected;window.downloads[i]++;const a=document.createElement('a');a.download='original';a.href=i===1&&window.downloads[i]===1?'https://www.doubao.com/unsupported':URL.createObjectURL(new Blob(['original-'+i],{type:'image/png'}));a.click();if(a.href.startsWith('blob:'))URL.revokeObjectURL(a.href)};
 });
 const task={id:'checkpoint_task_123456',request:{prompt:'input'}},receipt=await store.begin(task.id,task.request);
 await store.write(task.id,{...receipt,stage:'submitted',remote:{conversation_url:url,message_id:'200',user_message_id:'100',result_messages:[{message_id:'200',count:2}]}});
 const adapter=(modality==='image'?doubaoImageAdapter:doubaoVideoAdapter)(page,[],join(dir,'original'));
 const options={task,store,adapter,finalize:async({output})=>{assert.equal(output.outputs.length,2);for(let i=0;i<2;i++)assert.equal(await readFile(output.outputs[i].path,'utf8'),'original-'+i);return {published:true}}};
 await assert.rejects(executeTask(options),/Unsupported original/);
 assert.equal(Object.keys((await store.read(task.id)).originals).length,1);
 await executeTask(options);assert.deepEqual(await page.evaluate(()=>window.downloads),[1,2]);
 }finally{await browser.close()}
});
