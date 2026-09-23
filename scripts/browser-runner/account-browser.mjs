/** Fixed official entries; no command line, URL or profile path comes from a web request. */
import {chromium} from 'playwright';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {PLATFORM_ADAPTERS} from './platform-adapters.mjs';
const id=process.argv[2];if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id||''))throw Error('Invalid account');
const root=resolve(import.meta.dirname,'../../local-browser'),config=JSON.parse(await readFile(join(root,'runner-config.json'),'utf8'));
const base=new URL(config.backend_url);if(!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Local backend required');
const response=await fetch(new URL('/api/v1/studio/web-generation/accounts',base),{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Account lookup failed');
const account=(await response.json()).find(a=>a.id===id);
const entries={doubao:'https://www.doubao.com/chat/',jimeng:'https://jimeng.jianying.com/ai-tool/generate',kling:'https://app.klingai.com/cn/',wanxiang:'https://tongyi.aliyun.com/wan/',yuanbao:'https://yuanbao.tencent.com/',hailuo:'https://hailuoai.com/',zhipu:'https://chatglm.cn/'};
if(!account||!entries[account.platform])throw Error('Unsupported account');
const profile=resolve(root,config.profiles?.[id]||`accounts/${id}/edge`);if(!profile.toLowerCase().startsWith(root.toLowerCase()+'\\'))throw Error('Invalid profile');
// A Doubao login window becomes its own runner after login: one profile, one owner, live heartbeat.
if(PLATFORM_ADAPTERS[account.platform]){await import('./worker.mjs');process.exit(0);}
let context,timer;
/** Pair this isolated profile once and report login evidence, without claiming generation jobs. */
async function observeJimeng(page){
 const {randomUUID}=await import('node:crypto');const {jimengSessionState}=await import('./jimeng-session.mjs');
 const dir=join(root,'accounts',id);await mkdir(dir,{recursive:true});let identity;
 try{identity=JSON.parse(await readFile(join(dir,'identity.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;identity={profile_key:randomUUID()};await writeFile(join(dir,'identity.json'),JSON.stringify(identity))}
 let reporting=false;
 const report=async()=>{if(reporting)return;const official=context.pages().find(p=>!p.isClosed()&&new URL(p.url()).hostname==='jimeng.jianying.com');if(official)page=official;if(page.isClosed())return;reporting=true;try{const state=await jimengSessionState(page);if(state==='offline')await writeFile(join(dir,'login-diagnostic.json'),JSON.stringify({page:new URL(page.url()).pathname,avatar:await page.locator('img.dreamina-component-avatar').count(),account:await page.locator('button[class*="user-row"]').count(),create:await page.getByRole('button',{name:'创作',exact:true}).count(),controls:(await page.getByRole('button').allTextContents()).filter(t=>t.length<20).slice(0,30)}));const r=await fetch(new URL(`/api/v1/studio/web-generation/accounts/${id}/heartbeat`,base),{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({...identity,session_state:state,supported_models:[]}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Heartbeat rejected')}catch{ /* A temporary backend restart must not close the logged-in website. */ }finally{reporting=false}};
 await report();timer=setInterval(()=>void report(),10000);
}

try{
 context=await chromium.launchPersistentContext(profile,{channel:'msedge',chromiumSandbox:true,args:['--hide-crash-restore-bubble'],headless:false,viewport:{width:1400,height:950}});
 const close=()=>void context.close();process.once('SIGINT',close);process.once('SIGTERM',close);process.on('message',m=>{if(m==='close')close()});
 await context.pages()[0].goto(entries[account.platform],{waitUntil:'domcontentloaded'});process.send?.({state:'opened'});if(account.platform==='jimeng')await observeJimeng(context.pages()[0]);
 await new Promise(r=>context.on('close',r));
}catch{process.send?.({state:'failed',message:'浏览器未能打开，可能已被其他窗口占用；关闭同账号旧窗口后重试'});process.exitCode=1;}
finally{if(timer)clearInterval(timer);if(context)await context.close().catch(()=>{});if(process.connected)process.disconnect();}
