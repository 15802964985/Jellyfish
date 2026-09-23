/** Development-only fixture; never imported by the production entry. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PreparationAssetDialog, type PreparationAssetTarget } from './pages/aiStudio/shots/components/PreparationAssetDialog'
import { ChapterShotAssetConfirmation } from './pages/aiStudio/shots/components/ChapterShotAssetConfirmation'
import { VideoEditPanel } from './pages/aiStudio/chapter/components/VideoEditPanel'
import './index.css'
/** Mount real controls; the acceptance runner intercepts every API. */
function Fixture() {
 const [target,setTarget]=useState<PreparationAssetTarget>()
 const [saved,setSaved]=useState(false)
 return <div style={{padding:20,maxWidth:900}}><ChapterShotAssetConfirmation projectId="p"
 extraction={{state:'not_extracted',asset_candidate_total:0,dialogue_candidate_total:0} as any}
 unionAssets={{scene:[],actor:[{name:'妈妈',kind:'actor',status:'new',candidateId:1,description:'较长的提取内容需要完整展示'}],prop:[],costume:[]}}
 expandedKinds={{scene:false,actor:false,prop:false,costume:false}} candidateActionIds={{}}
 existenceByKindName={{scene:{},actor:{'妈妈':{name:'妈妈',exists:true,linked_to_project:true,matched_name:'妈妈',thumbnail:'/api/photo',asset_id:'mother'}},prop:{},costume:{}}}
 onToggleExpanded={()=>{}} onIgnoreCandidate={()=>{}} onHandleNewAsset={setTarget} onCreateAsset={kind=>setTarget({kind,name:'',create:true})} />
 {target && <PreparationAssetDialog target={target} projectId="p" chapterId="c" shotId="s" visualStyle="现实" style="真人都市"
 onClose={()=>setTarget(undefined)} onSaved={()=>setSaved(true)} />}
 {saved && <output>已关联当前镜头</output>}
 <VideoEditPanel shotId="s" currentFileId="source" onAdopted={async()=>{}} /></div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
