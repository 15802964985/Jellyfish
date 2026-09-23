import type { WebAccountRead } from '../services/generated'
/** Keep account labels and recovery guidance identical in settings and generation. */
export function webAccountStatus(account: WebAccountRead) {
 const code=!account.enabled?'disabled':account.readiness?.code||(account.active_task_id?'busy':'unknown')
 const states:Record<string,{label:string;color:string;help?:string;rank:number}>={
 ready:{label:'可用',color:'green',rank:0},signed_in:{label:'可用',color:'green',rank:0},runner_offline:{label:'可用',color:'green',rank:0},
 needs_verification:{label:'待验证',color:'blue',help:'请在打开的账号窗口完成验证，任务会自动继续。',rank:1},
 needs_login:{label:'待登录',color:'blue',help:'请在打开的账号窗口完成登录，任务会自动继续。',rank:2},
 busy:{label:'忙碌，可排队',color:'blue',help:'当前任务结束后会自动继续，无需重复提交。',rank:3},
 disabled:{label:'不可用',color:'orange',help:'请在账号设置中启用此账号，或选择其他账号。',rank:4},
 unknown:{label:'待检查',color:'default',help:'请刷新账号状态后重试。',rank:5},
 }
 return states[code]||{label:'不可用',color:'orange',help:account.readiness?.action||account.readiness?.reason||'请检查账号设置，或选择其他账号。',rank:4}
}
