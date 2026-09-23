import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Button } from 'antd'
import { WebResultCandidates } from '../WebResultCandidates'
/** Isolated object navigation fixture; never imported by the production application. */
function Fixture(){const [entity,setEntity]=useState('asset-a');return <><Button onClick={()=>setEntity(entity==='asset-a'?'asset-b':'asset-a')}>切换对象</Button><WebResultCandidates targetType="prop" entityId={entity} slotId={7}/></>}
createRoot(document.getElementById('root')!).render(<Fixture/>)
