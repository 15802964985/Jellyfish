import { useState, type ReactNode } from 'react'
import { Segmented, Space } from 'antd'
/** Keep API as default; changing channel changes controls, never submits or cancels a task. */
export function GenerationChannelActions({apiAction,webAction,channel,onChannelChange}:{apiAction:ReactNode;webAction:ReactNode;channel?:'api'|'web';onChannelChange?:(value:'api'|'web')=>void}) {
 const [local,setLocal]=useState<'api'|'web'>('api')
 const selected=channel??local
 return <Space wrap><Segmented aria-label="生成通道" value={selected} onChange={value=>{const next=value as 'api'|'web';setLocal(next);onChannelChange?.(next)}} options={[{value:'api',label:'API 调用'},{value:'web',label:'平台网页'}]}/>{selected==='api'?apiAction:webAction}</Space>
}
