import { useEffect, type ReactNode } from 'react'
import { Button, notification } from 'antd'
import { FilmService, type TaskListItemRead, type TaskStatus } from '../../../services/generated'
import { useTaskUiStore } from './taskUiStore'
import { resolveTaskTitle } from './taskCopy'

const ACTIVE=new Set(['pending','running','streaming'])
const STORAGE='jellyfish_observed_background_tasks_v1'
/** 跨页面观察服务端任务；仅记录任务ID/名称，不保存提示词或替用户保存草稿。 */
export function TaskRuntimeProvider({children}:{children:ReactNode}) {
 const setServerTasks=useTaskUiStore(state=>state.setServerTasks)
 useEffect(()=>{
  let disposed=false, timer:number|undefined, loading=false
  let pending:Record<string,string>={}
  try { pending=JSON.parse(sessionStorage.getItem(STORAGE)||'{}') } catch { /* 存储不可用不阻断任务 */ }
  /** 仅已观察到的任务终态发提醒；首次加载不弹出大量旧成功记录。 */
  const settle=(id:string,status:TaskStatus)=>{
   const title=pending[id];if(!title||ACTIVE.has(status))return
   delete pending[id]
   notification.open({key:`${id}:settled`,message:`${title} · ${status==='succeeded'?'已完成':status==='failed'?'失败':'已取消'}`,
    description:'任务已结束，可继续其他工作；在任务中心回到原业务查看结果。',duration:6,placement:'bottomRight',
    btn:<Button size="small" onClick={()=>useTaskUiStore.getState().setOpen(true)}>查看任务</Button>})
   window.dispatchEvent(new CustomEvent('jellyfish:task-settled',{detail:{taskId:id,status}}))
  }
  /** 所有分页均加载；漏过最近窗口的已知任务按ID补查，网络失败保留上次状态。 */
  const load=async()=>{
   if(loading||disposed)return
   loading=true
   try{
    const items:TaskListItemRead[]=[]
    for(let page=1;;page++){
     const response=await FilmService.listTasksApiV1FilmTasksGet({recentSeconds:60,page,pageSize:50})
     if(disposed)return
     const rows=response.data?.items||[];items.push(...rows)
     if(rows.length<50 || page >= (response.data?.pagination.max_page ?? page))break
    }
    for(const task of items){
     if(ACTIVE.has(task.status))pending[task.task_id]=resolveTaskTitle(task.task_kind)
     else settle(task.task_id,task.status)
    }
    const visible=new Set(items.map(item=>item.task_id))
    for(const id of Object.keys(pending).filter(id=>!visible.has(id))){
     try{const r=await FilmService.getTaskStatusApiV1FilmTasksTaskIdStatusGet({taskId:id});if(disposed)return;if(r.data)settle(id,r.data.status)}catch{/* 保留待查询状态，不重提任务 */}
    }
    if(!disposed){setServerTasks(items);try{sessionStorage.setItem(STORAGE,JSON.stringify(pending))}catch{/* 无存储时仍可跨页跟踪 */}}
   }catch{/* 短暂断网不把运行任务清空 */}
   finally{loading=false;if(!disposed)timer=window.setTimeout(()=>void load(),Object.keys(pending).length&&document.visibilityState==='visible'?2000:10000)}
  }
  /** 收到提交提示时立即补查，避免快速任务在下一次轮询前结束。 */
  const wake=(event:Event)=>{
   const detail=(event as CustomEvent).detail
   if(detail?.taskId){pending[detail.taskId]=detail.title||'模型任务';try{sessionStorage.setItem(STORAGE,JSON.stringify(pending))}catch{/* 内存兜底 */}}
   if(timer)clearTimeout(timer);void load()
  }
  const focus=()=>{if(timer)clearTimeout(timer);void load()}
  window.addEventListener('jellyfish:task-accepted',wake);window.addEventListener('focus',focus)
  void load()
  return()=>{disposed=true;if(timer)clearTimeout(timer);window.removeEventListener('jellyfish:task-accepted',wake);window.removeEventListener('focus',focus)}
 },[setServerTasks])
 return <>{children}</>
}
