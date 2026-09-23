/** Offline video ownership and confirmation regression; all network traffic is fulfilled locally. */
import test from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {doubaoVideoAdapter,videoThread,observeVideoModels} from './doubao-video.mjs';import {jimengSessionState} from './jimeng-session.mjs';
const url='https://www.doubao.com/chat/123',anchor={conversation_url:url,user_message_id:'100'},request={prompt:'one building',requested_model:'Seedance 2.0 Mini',duration_seconds:4,aspect_ratio:'1:1',reference_mode:'text'};
/** An isolated browser cannot contact a real platform or use an account profile. */
async function fixture(html,run,location=url){const browser=await chromium.launch({channel:'msedge',headless:true});try{const ctx=await browser.newContext({serviceWorkers:'block'});await ctx.route('**/*',r=>r.fulfill({contentType:'text/html;charset=utf-8',body:html}));const page=await ctx.newPage();await page.goto(location);await run(page)}finally{await browser.close()}}
const user='<div data-message-id="100" class="justify-end">one building</div>',result='<div data-message-id="300"><div class="block-video-card">video</div></div>';
test('video uses final video message, not first assistant acknowledgement',()=>fixture(user+'<div data-message-id="200">processing</div>'+result,async page=>{const remote=await doubaoVideoAdapter(page,[],null).reconcile(anchor,request);assert.equal(remote.message_id,'300')}));
test('another user input and multiple candidates cannot become the original result',()=>fixture(user+'<div data-message-id="201" class="justify-end">another request</div>'+result,async page=>{await assert.rejects(videoThread(page,anchor,request.prompt),/其他输入/)}));
test('parameter confirmation persists intent before one Enter and survives result separation',()=>fixture(user+'<div data-message-id="200">Seedance 2.0 Mini 1:1 4秒 确认后开始生成</div><textarea onkeydown="if(event.key===\'Enter\'){window.sends=(window.sends||0)+1;document.body.insertAdjacentHTML(\'beforeend\',\'<div data-message-id=201 class=justify-end>开始生成视频</div><div data-message-id=300><div class=block-video-card>video</div></div>\')}"></textarea>',async page=>{let saved=false;const remote=await doubaoVideoAdapter(page,[],null).reconcile(anchor,request,async state=>{assert.ok(state.confirmation_intent);assert.equal(await page.evaluate(()=>window.sends||0),0);saved=true});assert.ok(saved);assert.equal(remote.message_id,'300');assert.equal(await page.evaluate(()=>window.sends),1)}));
test('uncertain confirmation and wrong model cannot trigger another send',()=>fixture(user+'<div data-message-id="200">Seedance 2.0 Mini 1:1 4秒 确认后开始生成</div><textarea></textarea>',async page=>{await assert.rejects(doubaoVideoAdapter(page,[],null).reconcile({...anchor,confirmation_intent:'saved'},request),/不再次发送/);await assert.rejects(doubaoVideoAdapter(page,[],null).reconcile(anchor,{...request,requested_model:'Seedance 2.0 Fast'}),/不完整/);assert.equal(await page.getByRole('textbox').inputValue(),'')}));
test('resolution and multiple-reference roles stop before preparation',()=>fixture('<textarea></textarea>',async page=>{await assert.rejects(doubaoVideoAdapter(page,[],null).prepare({...request,resolution:'1080p'}),/尚未/);await assert.rejects(doubaoVideoAdapter(page,[],null).prepare({...request,reference_mode:'first_last_frames'}),/尚未/)}));
test('visible video menu observes only supported exact names without submitting',()=>fixture('<button>模型 Seedance 2.0 Mini</button><span>Seedance 2.0 Mini</span><span>Seedance 2.0 Fast</span><span>Seedance 2.5</span>',async page=>assert.deepEqual(await observeVideoModels(page),['Seedance 2.0 Mini','Seedance 2.0 Fast'])));
test('Jimeng login evidence differs from generation readiness and visible captcha takes precedence',()=>fixture('<img style="display:none" class="dreamina-component-avatar"><button>创作</button><button class="user-row-test">account</button><img class="dreamina-component-avatar" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">',async page=>{assert.equal(await jimengSessionState(page),'signed_in');await page.locator('body').evaluate(n=>n.insertAdjacentHTML('beforeend','<div id="captcha">verify</div>'));assert.equal(await jimengSessionState(page),'needs_verification')},'https://jimeng.jianying.com/ai-tool/'));
test('video duration uses displayed seconds rather than slider index',()=>fixture('<button>模型 Seedance 2.0 Mini</button><button id="params">1:1 · 10s</button><span>1:1</span><div style="width:100px;height:20px" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="11" aria-valuenow="6" onkeydown="let v=Number(this.getAttribute(\'aria-valuenow\'));v=event.key===\'Home\'?0:event.key===\'End\'?11:event.key===\'ArrowRight\'?v+1:v;this.setAttribute(\'aria-valuenow\',v);document.getElementById(\'params\').innerText=\'1:1 · \'+(v+4)+\'s\'"></div><textarea></textarea>',async page=>{await doubaoVideoAdapter(page,[],null).prepare({...request,duration_seconds:5});assert.equal(await page.getByRole('slider').getAttribute('aria-valuenow'),'1');assert.equal(await page.getByRole('textbox').inputValue(),'one building')}));
test('video restores URL checkpoint with official numeric spacing without resubmission',()=>fixture('<div data-message-id="100" class="justify-end">生成视频：生成 4 秒建筑视频，1:1，4s</div>'+result,async page=>{const saved=[];const remote=await doubaoVideoAdapter(page,[],null).reconcile({conversation_url:url},{...request,prompt:'生成4秒建筑视频，1:1，4s'},async a=>saved.push(a));assert.equal(remote.message_id,'300');assert.equal(saved[0].user_message_id,'100')}));

test('nested video counts once and markdown recovery shares image matching',()=>fixture('<div data-message-id="100" class="justify-end">生成视频：building</div><div data-message-id="300"><div class="block-video-card"><video></video></div></div>',async page=>{
 const remote=await doubaoVideoAdapter(page,[],null).reconcile(anchor,{...request,prompt:'## building'})
 assert.equal(remote.message_id,'300')
}))

/** videoThread 必须区分两种失败原因，便于下次豆包 UI 改版时针对性加固：
 *  - id 找不到（豆包可能改了 data-message-id 生成规则）→ 报"节点已不在"
 *  - id 命中但 text 与 prompt 不匹配 → 报"内容不匹配" */
test('videoThread reports node-missing vs content-mismatch separately', async()=>{
 // 场景 1：id 不存在
 await fixture('<div data-message-id="100" class="justify-end">one building</div>', async page=>{
  await assert.rejects(videoThread(page,{...anchor, user_message_id:'99999999'},'one building'),/节点已不在/)
 })
 // 场景 2：id 命中但内容不匹配
 await fixture('<div data-message-id="100" class="justify-end">完全不同的内容</div>', async page=>{
  await assert.rejects(videoThread(page,anchor,'one building'),/内容不匹配/)
 })
});

/** Identical prompts are not identities; exact task/conversation/user anchors scope the whole set. */
test('v2 video returns multiple result messages under one immutable task',()=>fixture('<div data-message-id="100" class="justify-end">rendered model metadata</div><div data-message-id="300"><div class="block-video-card">first</div></div><div data-message-id="301"><div class="block-video-card">second</div></div>',async page=>{
 const bound={...anchor,binding_version:2,local_task_id:'task-a',exclusive_empty:true}
 const adapter=doubaoVideoAdapter(page,[],null)
 const remote=await adapter.reconcile(bound,{...request,local_task_id:'task-a'})
 assert.deepEqual(remote.result_messages,[{message_id:'300',count:1},{message_id:'301',count:1}])
 await assert.rejects(adapter.reconcile(bound,{...request,local_task_id:'task-b'}),/编号不一致/)
}))
