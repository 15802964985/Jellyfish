/** Outbound-only desktop helper. Claims are journaled before spawn; a restarted helper never repeats an uncertain launch. */
import {readFile,writeFile,mkdir,rename,unlink,rmdir} from 'node:fs/promises';
import {createWriteStream,appendFileSync,statSync,renameSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';import {fork} from 'node:child_process';
const root=resolve(import.meta.dirname,'../../local-browser'),dir=join(root,'desktop');await mkdir(dir,{recursive:true});
const config=JSON.parse(await readFile(join(root,'runner-config.json'),'utf8')),base=new URL(config.backend_url);
if(!['localhost','127.0.0.1'].includes(base.hostname)||!['http:','https:'].includes(base.protocol))throw Error('Only local Jellyfish is supported');
/** Atomic local journal survives lost acknowledgements without replaying process creation. */
async function save(name,value){const path=join(dir,name),temp=path+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);}
// Keep each worker's console output on disk. A fork with discarded stdio once hid the real
// cause of a failed generation: the account page only showed that the process had exited,
// and nothing survived on disk to explain why.
const logDir=join(root,'logs');await mkdir(logDir,{recursive:true});
// The helper itself used to run with fully discarded output: when it died there was nothing on
// disk explaining why. Record fatal errors before exit so the supervisor can restart cleanly.
// Writes are synchronous on purpose: an async buffer would be lost if the process dies.
const hostLogPath=join(logDir,'desktop-host.log');
/** Bound diagnostic logs; rotate only these known log files, never browser profiles or receipts. */
function rotateLog(path){try{if(statSync(path).size>5*1024*1024){rmSync(path+'.1',{force:true});renameSync(path,path+'.1')}}catch(error){if(error.code!=='ENOENT')throw error}}
const hostLogWrite=line=>{try{rotateLog(hostLogPath);appendFileSync(hostLogPath,`[${new Date().toISOString()}] ${line}\n`)}catch{}};
const hostPrint=console.log.bind(console);console.log=(...args)=>{hostPrint(...args);hostLogWrite(args.map(String).join(' '))};
process.on('uncaughtException',error=>{hostLogWrite(`uncaughtException: ${error?.stack||error}`);process.exit(1)});
process.on('unhandledRejection',error=>{hostLogWrite(`unhandledRejection: ${error?.stack||error}`);process.exit(1)});
process.on('exit',code=>hostLogWrite(`process exit code=${code}`));
const lock=join(dir,'host.lock');
console.log(`助手进程已拉起，检查运行锁 pid=${process.pid}`);
try{await mkdir(lock)}catch(e){if(e.code!=='EEXIST')throw e;const owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));try{process.kill(owner.pid,0);console.log(`检测到已有助手在运行 pid=${owner.pid}，本进程退出`);process.exit(0)}catch(e){if(e.code!=='ESRCH')throw e;}await unlink(join(lock,'owner.json'));await rmdir(lock);await mkdir(lock);}
await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid}));
console.log(`本机助手已启动 pid=${process.pid}`);
let identity;try{identity=JSON.parse(await readFile(join(dir,'identity.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;identity={id:randomUUID().replaceAll('-','')};await save('identity.json',identity);}
let journal;try{journal=JSON.parse(await readFile(join(dir,'commands.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;journal={};}
// Existing children may still own authenticated profiles. Preserve uncertainty; never kill or blindly respawn them.
for(const row of Object.values(journal)){if(['starting','opened'].includes(row.state)){row.state='failed';row.message='助手已恢复，请先关闭该账号遗留浏览器窗口，再重新打开';}}
await save('commands.json',journal);
const children=new Map();let stopped=false;
process.on('SIGINT',()=>{stopped=true});process.on('SIGTERM',()=>{stopped=true});
/** Spawn only a fixed script with a validated account ID and no shell interpolation. */
async function launch(command){
 if(journal[command.command_id]){delete journal[command.command_id].reported;return;}
 if(!/^[a-f0-9]{32}$/.test(command.command_id)||!/^[a-zA-Z0-9_-]{1,64}$/.test(command.account_id)||!['login','runner'].includes(command.action))throw Error('Invalid desktop operation');
 const row={command_id:command.command_id,account_id:command.account_id,state:'starting',message:''};journal[command.command_id]=row;await save('commands.json',journal);
 if([...children.values()].some(item=>item.accountId===command.account_id)){row.state='failed';row.message='该账号已有本机窗口，请先关闭';await save('commands.json',journal);return;}
 const script=join(import.meta.dirname,command.action==='login'?'account-browser.mjs':'worker.mjs');
 // Create the per-account log stream here and keep the reference until the child exits. A fork
 // whose stdio was fully discarded once hid the real cause of a failed generation, so the exit
 // handlers below must be able to flush this log; leaving `log` undefined crashed the helper.
 const accountLog=join(logDir,`${command.account_id}.log`);rotateLog(accountLog);
 const log=createWriteStream(accountLog,{flags:'a'});
 log.on('error',()=>{});
 log.write(`\n[${new Date().toISOString()}] action=${command.action} command=${command.command_id}\n`);
 const endLog=()=>{if(!log.writableEnded)log.end()};
 const child=fork(script,[command.account_id],{cwd:resolve(import.meta.dirname,'../..'),windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
 child.stdout?.pipe(log);child.stderr?.pipe(log);
 children.set(command.command_id,{child,accountId:command.account_id});
 child.on('message',message=>{if(message?.state==='opened'){row.state='opened';row.message='窗口已打开，请在官网完成登录或验证'}else if(message?.state==='failed'){row.state='failed';row.message=String(message.reason||'浏览器未能启动，请查看执行器日志').slice(0,400)}});
 child.once('error',()=>{row.state='failed';row.message='本机进程启动失败';endLog();children.delete(command.command_id)});
 child.once('exit',code=>{if(row.state!=='failed'){row.state=code===0?'closed':'failed';row.message=code===0?'窗口已关闭；生成任务不会因此取消':'进程已退出，请检查同账号窗口是否占用；不会重复生成'}endLog();children.delete(command.command_id)});
}
try{while(!stopped){
 try{
  await save('commands.json',journal);
  const reports=Object.values(journal).filter(row=>row.state!=='starting'&&row.state!==row.reported).slice(-100).map(({command_id,state,message})=>({command_id,state,message}));
  const response=await fetch(new URL('/api/v1/studio/web-generation/desktop/poll',base),{method:'POST',headers:{authorization:`Bearer ${config.token}`,'content-type':'application/json'},body:JSON.stringify({host_id:identity.id,reports}),redirect:'error',signal:AbortSignal.timeout(15000)});
  if(response.ok){const commands=await response.json();for(const report of reports){journal[report.command_id].reported=report.state;}for(const command of commands)await launch(command);}
  else console.log('本机助手连接状态：'+response.status);
 }catch{console.log('本机助手等待 Jellyfish 服务恢复');}
 await new Promise(r=>setTimeout(r,1000));
}}finally{for(const {child} of children.values()){if(child.connected)child.disconnect();child.unref();}await save('commands.json',journal);await unlink(join(lock,'owner.json'));await rmdir(lock);}
