/** 离线验收夹具：真实后台任务组件，API由浏览器拦截，生产入口不引用。 */
import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {TextExperimentMode} from './pages/aiStudio/experiment/modes/TextExperimentMode'
import {TaskRuntimeProvider} from './pages/aiStudio/components/TaskRuntimeProvider'
import {useTaskUiStore} from './pages/aiStudio/components/taskUiStore'
import {ChapterRawTextEditorModal} from './pages/aiStudio/chapter/components/ChapterRawTextEditorModal'
import './index.css'
/** 模拟页面切换和同页面不同会话，保留全局任务运行时。 */
function Fixture(){
 const [session,setSession]=useState('a'),[visible,setVisible]=useState(true)
 const [rawOpen,setRawOpen]=useState(false)
 const tasks=useTaskUiStore(state=>state.serverItems)
 return <main style={{maxWidth:900,margin:'auto',padding:24}}>
 <button onClick={()=>setVisible(v=>!v)}>切换其他页面</button>
 <button onClick={()=>{setSession(v=>v==='a'?'b':'a');setVisible(true)}}>切换会话</button>
 <button onClick={()=>setRawOpen(true)}>打开章节编辑</button><ChapterRawTextEditorModal open={rawOpen} onClose={()=>setRawOpen(false)} chapterId="chapter-a"/>
 <output data-testid="session">{session}</output><output data-testid="tasks">{Object.keys(tasks).length}</output>
 {visible?<TextExperimentMode key={session} sessionId={session} ensureSession={async()=>({id:session,lab_type:'text',title:session,created_at:'',updated_at:''})} onClearSession={async()=>{}} render={parts=><><output data-testid="blocked">{String(parts.disabled)}</output>{parts.extra}{parts.history}{parts.composer}</>}/>:<p>其他页面可以正常工作</p>}
 </main>
}
createRoot(document.getElementById('root')!).render(<TaskRuntimeProvider><Fixture/></TaskRuntimeProvider>)
