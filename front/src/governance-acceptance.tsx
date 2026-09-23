/** Development-only acceptance fixture; production build entry never imports this module. */
import { BrowserRouter } from 'react-router-dom'
import { TaskCenter } from './pages/aiStudio/components/TaskCenter'
import { useTaskUiStore } from './pages/aiStudio/components/taskUiStore'
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Space, Select } from 'antd'
import { FrameReferenceSelector } from './pages/aiStudio/chapter/components/FrameReferenceSelector'
import { TaskCallDetails } from './pages/aiStudio/components/TaskCallDetails'
import { GenerationOptionsPanel } from './pages/aiStudio/components/GenerationOptionsPanel'
import { reviewGenerationBatch, reviewGenerationRequest, type GenerationChoice } from './pages/aiStudio/components/GenerationParameterDialog'
import type { GenerationSubmitRequest } from './services/generated'

/** Exercise actual reusable controls with browser-intercepted APIs, never a provider or production write. */
function Fixture() {
  const [frame, setFrame] = useState('first')
  const [saved, setSaved] = useState<Record<string,string[]>>({ first:['a','b'], key:['b'], last:[] })
  const [selected, setSelected] = useState(saved.first)
  const [task, setTask] = useState<string|null>(null)
  const [choice, setChoice] = useState<GenerationChoice | null>(null)
  const [result, setResult] = useState('')
  const request: GenerationSubmitRequest = { model_id:'test', execution_prompt:'offline only',
    media:{frames:{first:null,last:null,keys:[]},subjects:[]},
    operation_input:{kind:'video_generation',ratio:'16:9',seconds:5} }
  return <Space direction="vertical">
    <Select aria-label="测试帧" value={frame} options={['first','key','last'].map(value=>({value,label:value}))}
      onChange={value=>{setFrame(value);setSelected(saved[value])}} />
    <FrameReferenceSelector shotId="fixture-shot" selected={selected} candidates={['a','b']} names={new Map([['a','参考A'],['b','参考B']])}
      disabled={false} saving={false} onChange={setSelected} onAdd={()=>{}} onRestore={()=>setSelected(['a','b'])}
      onSave={()=>setSaved({...saved,[frame]:selected})} />
    <pre data-testid="saved">{JSON.stringify(saved)}</pre>
    <Button onClick={()=>setTask('one')}>详情一</Button><Button onClick={()=>setTask('two')}>详情二</Button>
    <TaskCallDetails taskId={task} onClose={()=>setTask(null)} />
    <Button onClick={()=>void reviewGenerationBatch([request,request]).then(()=>setResult('confirmed')).catch(()=>setResult('cancelled'))}>测试整批</Button>
    <GenerationOptionsPanel category="video" modelId="test" ratio="16:9" quantity={5} onChange={setChoice} />
    <Button onClick={()=>void reviewGenerationRequest(request, undefined, choice).then(value=>setResult(String((value.operation_input as {resolution?:string}).resolution)))}>测试面板选择</Button>
    <output>{result}</output>
    <Button onClick={()=>{
      for (const [id, name] of [['search-a','SearchAlpha'],['search-b','SearchBeta']]) useTaskUiStore.getState().upsertTask({taskId:id,title:name,modelName:name,providerName:'Fixture',status:'pending',progress:0,cancelRequested:false})
      useTaskUiStore.getState().setOpen(true)
    }}>测试任务搜索</Button>
    <TaskCenter />
  </Space>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><Fixture /></BrowserRouter></React.StrictMode>)
