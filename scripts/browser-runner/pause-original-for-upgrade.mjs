/** Migrate one existing local task into persistent pause without submitting or cancelling it. */
import {readFile,writeFile,copyFile,rename} from 'node:fs/promises'
import {resolve,join} from 'node:path'
const account=process.argv[2]
if(!/^[a-zA-Z0-9_-]{1,64}$/.test(account||''))throw Error('An exact account is required')
const root=resolve(import.meta.dirname,'../../local-browser'),dir=join(root,'accounts',account)
const path=join(dir,'current.json'),current=JSON.parse(await readFile(path,'utf8'))
const config=JSON.parse(await readFile(join(root,'runner-config.json'),'utf8')),base=new URL(config.backend_url)
if(!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Only local backend supported')
if(!current?.task)throw Error('No active local task')
const receipt=JSON.parse(await readFile(join(dir,'receipts',current.task.task_id+'.json'),'utf8'))
if(!['submitting','submission_unknown','submitted','downloaded'].includes(receipt.stage))throw Error('Task is not an interrupted original')
const headers={authorization:`Bearer ${config.token}`,'x-web-account':account,'x-task-token':current.task.token,'content-type':'application/json'}
/** Read the current recovery version and persist a pause through the ordinary ownership-checked API. */
async function api(suffix,body){const response=await fetch(new URL(`/api/v1/studio/web-generation/tasks/${current.task.task_id}/${suffix}`,base),{method:'POST',headers,body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Pause migration rejected: '+response.status);return response.json()}
const status=await api('resume')
if(status.status!=='running')throw Error('Task is no longer running')
const epoch=status.recovery_epoch||0
await api('stage',{stage:'needs_user',paused:true,recovery_epoch:epoch,reason:'旧执行器升级前已暂停，官网受理仍待核对。原账号与回执保留；可恢复原任务或显式取消，不自动重发。',...(receipt.remote||{})})
await copyFile(path,join(dir,'current.before-reliability-upgrade.json'),1)
current.recovery={epoch,held:true,prepareFailures:0,collectFailures:10}
await writeFile(path+'.upgrade.tmp',JSON.stringify(current,null,2));await rename(path+'.upgrade.tmp',path)
console.log(JSON.stringify({task_id:current.task.task_id,paused:true,receipt_stage:receipt.stage,new_submission:false}))
