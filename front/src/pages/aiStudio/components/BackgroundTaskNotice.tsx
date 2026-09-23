import { Button } from 'antd'
import { useTaskUiStore } from './taskUiStore'

/** 非阻塞任务统一说明：隐藏界面不取消服务端任务，详情回到原业务查看。 */
export function BackgroundTaskNotice({active=true}: {active?:boolean}) {
  const open=useTaskUiStore(state=>state.setOpen)
  if(!active)return null
  return <div role="status" className="my-2 flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
    <span>任务在后台执行，可以关闭此窗口并继续其他工作。关闭不会取消任务。</span>
    <Button size="small" type="link" onClick={()=>open(true)}>查看任务中心</Button>
  </div>
}
