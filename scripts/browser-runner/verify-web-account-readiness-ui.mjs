/** Shared generation dialog: real read-only readiness, then isolated login/unavailable presentation. */
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const base='http://127.0.0.1:18792',api='http://127.0.0.1:8000',browser=await chromium.launch({channel:'msedge',headless:true});
let scenario='ready';const errors=[],writes=[];
try{const page=await browser.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
await page.route('**/*',async route=>{
 const r=route.request(),u=new URL(r.url());
 if(u.pathname==='/accounts-fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;await import("/src/components/__fixtures__/WebAccountsCheck.tsx");</script>'});
 if(u.pathname==='/readiness-fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/src/components/__fixtures__/WebChannelCheck.tsx"></script>'});
 if(u.pathname.startsWith('/api/')){
  if(r.method()!=='GET'){writes.push(u.pathname);return route.abort()}
  const response=await fetch(api+u.pathname+u.search);let data=await response.json();
  if(scenario!=='ready'&&u.pathname.endsWith('/accounts'))data=data.map(a=>({...a,session_state:'needs_login',active_task_id:null,readiness:{code:'needs_login',blocking:false,reason:'待登录',action:'登录'}}));
  if(scenario!=='ready'&&u.pathname.endsWith('/execution-status'))data={available:scenario==='login',eligible_account_ids:[],reasons:scenario==='blocked'?['没有可用账号，请到账号管理启用账号']:[],notices:['不应该展示的逐账号技术明细']};
  return route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(data)})
 }
 if(u.origin===base)return route.continue();return route.abort();
});
await page.goto(base+'/readiness-fixture?video');await page.getByText('平台网页',{exact:true}).click();await page.getByRole('button',{name:'平台网页生成',exact:true}).click();
const model=page.getByRole('combobox',{name:'官网实际模型'});await model.fill('Seedance 2.0 Fast');await model.press('Enter');await page.getByRole('checkbox').check();
await page.getByText('账号可用，可提交任务',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'提交后台任务',exact:true}).isEnabled());
assert.equal(await page.locator('.ant-alert-description').count(),0);
scenario='login';await page.getByText('账号待登录，可提交任务',{exact:true}).waitFor({timeout:10000});await page.getByText('请在打开的账号窗口完成登录，任务会自动继续。',{exact:true}).waitFor();assert.ok(await page.getByRole('button',{name:'提交后台任务',exact:true}).isEnabled());
scenario='blocked';await page.getByText('当前不可用',{exact:true}).waitFor({timeout:10000});assert.ok(await page.getByRole('button',{name:'提交后台任务',exact:true}).isDisabled());await page.getByRole('link',{name:'管理账号',exact:true}).waitFor();
assert.equal(await page.getByText('不应该展示的逐账号技术明细').count(),0);
scenario='login';await page.goto(base+'/accounts-fixture');await page.getByRole('columnheader',{name:'账号状态',exact:true}).waitFor();await page.locator('.ant-table-row').first().getByText('待登录',{exact:true}).waitFor();await page.locator('.ant-table-row').first().getByText('请在打开的账号窗口完成登录，任务会自动继续。',{exact:true}).waitFor();
scenario='ready';await page.locator('.ant-table-row').first().getByText('可用',{exact:true}).waitFor({timeout:10000});
assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
fs.writeFileSync('local-reports/web-account-readiness-20260923/compact-ui.json',JSON.stringify({shared_accounts_page:true,ready:true,login_wait:true,unavailable_guidance:true,errors,writes},null,2));console.log('COMPACT_ACCOUNT_STATUS_OK');
}finally{await browser.close()}
