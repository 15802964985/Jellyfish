/** Account page integration with all API traffic mocked: no host process or supplier requests. */
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',chromiumSandbox:true,headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
let online=true,commands=[];const launches=[],errors=[];let accounts=[{id:'a'.repeat(32),platform:'doubao',display_name:'豆包测试账号',enabled:true,supported_models:['Seedream 4.5'],online:false,session_state:'needs_login',active_task_id:null}];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname;let data={data:[],meta:{total:0}};
 if(path.startsWith('/api/')){
  if(path.endsWith('/desktop/status'))data={online,commands};
  else if(path.endsWith('/platforms'))data={doubao:{name:'豆包',status:'image_candidate',url:'https://www.doubao.com/chat/'}};
  else if(path.endsWith('/desktop')){const body=JSON.parse(req.postData());launches.push({path,...body});const accountId=path.split('/').at(-2);data={command_id:String(launches.length).repeat(32),account_id:accountId,platform:'doubao',action:body.action,state:'queued',message:''};commands=[...commands.filter(c=>c.account_id!==accountId),data]}
  else if(path.endsWith('/accounts')&&req.method()==='POST'){data={...accounts[0],...JSON.parse(req.postData()),id:'b'.repeat(32)};accounts.push(data)}
  else if(path.endsWith('/accounts'))data=accounts;
  else if(req.method()==='PATCH'&&path.includes('/accounts/')){const row=accounts.find(a=>path.endsWith(a.id));Object.assign(row,JSON.parse(req.postData()));data=row;}
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 }
 if(url.hostname==='127.0.0.1'&&url.port==='5189')return route.continue();return route.abort();
});
try{
 await page.goto('http://127.0.0.1:5189/settings/web-accounts');await page.getByText('豆包测试账号',{exact:true}).waitFor();assert.equal(launches.length,0);
 await page.getByRole('button',{name:'打开官网登录',exact:true}).click();await page.getByText('等待打开',{exact:true}).waitFor();assert.equal(launches.length,1);assert.ok(launches[0].path.includes('a'.repeat(32)));assert.equal(launches[0].action,'login');
 await page.reload();await page.getByText('等待打开',{exact:true}).waitFor();assert.equal(launches.length,1);
 commands[0].state='closed';await page.getByRole('button',{name:'编辑 / 连接说明'}).click();await page.getByLabel('账号备注名称').fill('改名测试');await page.getByRole('button',{name:'确 定',exact:true}).click();await page.getByText('改名测试',{exact:true}).waitFor();assert.equal(launches.length,1);
 await page.getByRole('button',{name:'新增账号',exact:true}).click();await page.getByLabel('账号备注名称').fill('新增自动打开');await page.getByRole('button',{name:'确 定',exact:true}).click();await page.waitForFunction(()=>document.body.innerText.includes('新增自动打开')&&!document.querySelector('.ant-modal-wrap:not([style*="display: none"])'));
 await page.getByRole('row').filter({hasText:'新增自动打开'}).getByText('等待打开',{exact:true}).waitFor();assert.equal(launches.length,2);assert.ok(launches[1].path.includes('b'.repeat(32)));
 online=false;await page.reload();await page.getByText('本机助手离线 · 账号操作暂不可用',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'打开官网登录',exact:true}).first().isDisabled(),true);assert.equal(errors.length,0);
 console.log('PASS: ID auto-transfer, create auto-open, rename unchanged, reload no launch, offline disabled');
}finally{await browser.close()}
