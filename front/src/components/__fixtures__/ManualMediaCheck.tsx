import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {ManualMediaButton} from '../ManualMediaButton'
import type {ManualMediaSelection} from '../../services/generated'
/** Isolated business identity switch and refresh signal, using the real adoption control. */
function Check(){const [id,setId]=useState('a'),[count,setCount]=useState(0);const kind=new URLSearchParams(location.search).get('kind') as ManualMediaSelection['target_type']||'prop';return <><button onClick={()=>setId('b')}>切换对象</button><div>刷新次数：{count}</div><ManualMediaButton target={{target_type:kind,entity_id:id,frame_type:'last'}} onAdopted={()=>setCount(n=>n+1)}/></>}
createRoot(document.getElementById('root')!).render(<Check/>);
