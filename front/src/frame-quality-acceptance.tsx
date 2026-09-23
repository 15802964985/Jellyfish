/** 开发期真实组件夹具；生产入口不引用，所有请求由浏览器测试拦截。 */
import {useState,useCallback} from 'react'
import {createRoot} from 'react-dom/client'
import {FrameQualityWorkflow,type FrameApplication} from './pages/aiStudio/chapter/components/FrameQualityWorkflow'
import './index.css'
function Fixture(){
 const [scope,setScope]=useState<'first'|'key'|'last'>('first')
 const [app,setApp]=useState<FrameApplication|null>(null),[revision,setRevision]=useState('image-r1')
 const change=useCallback((value:FrameApplication|null)=>setApp(value),[])
 const context={model_revision_id:revision,reference_mode:scope,image_file_ids:['ref'],ratio:'1:1',resolution:'preview',draft_prompt:'单张原稿'}
 return <main style={{maxWidth:1000,margin:'auto',padding:24}}><button onClick={()=>{setScope('last');setApp(null)}}>切换尾帧</button><button onClick={()=>setRevision('image-r2')}>更换图片模型</button>
 <FrameQualityWorkflow key={scope} shotId="shot" scope={scope} basePrompt="单张原稿" context={context} ready application={app} outputs={[{fileId:'output-a',thumbUrl:''},{fileId:'output-b',thumbUrl:''}]} onApplication={change} onRefresh={()=>{}}/>
 <output data-testid="applied">{app?.prompt||'单张原稿'}</output></main>
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
