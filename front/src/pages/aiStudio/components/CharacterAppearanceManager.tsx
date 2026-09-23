import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Collapse, Form, Input, Modal, Select, Space, Image, message } from 'antd'
import { StudioCharacterAppearancesService as Api, StudioCreativeDirectionsService as Creative, StudioEntitiesService, type AppearanceRead, type AppearanceCreate, type CreativeContextOption } from '../../../services/generated'
import { CreativeDirectionDraftFields } from '../../../components/CreativeDirectionDraftFields'
import { MediaFilePicker } from '../files/MediaFilePicker'
import { buildFilePreviewUrl, buildFileDownloadUrl } from '../assets/utils'
const angles = [{value:'FRONT',label:'正面'},{value:'LEFT',label:'左侧'},{value:'RIGHT',label:'右侧'},{value:'BACK',label:'背面'},{value:'THREE_QUARTER',label:'四分之三侧面'},{value:'TOP',label:'俯视'},{value:'DETAIL',label:'细节'}]
/** 同一角色保存独立造型快照；生成图片后可从素材库选入，各版本互不覆盖。 */
export function CharacterAppearanceManager({characterId}:{characterId:string}) {
  const [rows,setRows]=useState<AppearanceRead[]>([]), [open,setOpen]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('')
  const [costumes,setCostumes]=useState<CreativeContextOption[]>([]), [pick,setPick]=useState(false)
  const [views,setViews]=useState<NonNullable<AppearanceCreate['views']>>([])
  const [form]=Form.useForm<AppearanceCreate>()
  /** 刷新只读版本，不改写当前角色或正在运行的任务。 */
  const load=async()=>{try {const r=await Api.getAppearancesApiV1StudioCharacterAppearancesCharactersCharacterIdGet({characterId});setRows(r.data||[])}catch{setError('造型版本加载失败，请刷新重试')}}
  useEffect(()=>{void load()},[characterId])
  /** 新版可继承当前角色或克隆旧版，但每次保存产生新版本。 */
  const create=async(row?:AppearanceRead)=>{
    setError('');setBusy(true)
    try {
      const [role,c]=await Promise.all([StudioEntitiesService.getEntityApiV1StudioEntitiesEntityTypeEntityIdGet({entityType:'character',entityId:characterId}),Creative.getContextOptionsApiV1StudioCreativeDirectionsContextOptionsScopeGet({scope:'costume'})])
      setCostumes(c.data||[]);form.resetFields();form.setFieldsValue(row?{...row.data,name:`${row.name} 新版`}:{name:'',description:String(role.data?.description||''),costume_id:role.data?.costume_id||null,creative_direction:{}})
      setViews(row?.data.views||[]);setOpen(true)
    }catch{setError('新建造型所需数据加载失败')}finally{setBusy(false)}
  }
  /** 保存时冻结已选图片；空列表不会假装已有定妆图。 */
  const save=async()=>{const values=await form.validateFields();setBusy(true);try{
    await Api.postAppearanceApiV1StudioCharacterAppearancesCharactersCharacterIdPost({characterId,requestBody:{...values,views}})
    setOpen(false);await load();message.success('造型版本已保存，在分镜人物参考目录中选用')
  }catch(e){setError((e as {body?:{detail?:string}}).body?.detail||'保存失败，草稿保留')}finally{setBusy(false)}}
  return <Card title="角色造型版本" extra={<Button loading={busy} onClick={()=>void create()}>新建造型版本</Button>}>
    <p>同一角色可保存现代、古装等不同造型。版本保存后保留原图和设定；镜头需明确选用，再逐帧勾选角度图片。演员身份不变。</p>
    {error&&<Alert type="error" message={error}/>}
    {!rows.length&&<p>尚无独立版本，目前使用角色当前定妆图。</p>}
    <Collapse items={rows.map(row=>({key:row.id,label:`${row.name} · v${row.version}`,children:<><p>{row.data.description}</p><p>服装：{row.data.costume_name||'未关联服装'}</p><Space wrap><Image.PreviewGroup>{(row.data.views||[]).map((v:{file_id:string;view_angle:string})=><div key={v.view_angle}><Image width={100} src={buildFilePreviewUrl(v.file_id)} preview={{src:buildFileDownloadUrl(v.file_id)}}/><div>{angles.find(a=>a.value===v.view_angle)?.label||v.view_angle}</div></div>)}</Image.PreviewGroup></Space><p><Button onClick={()=>void create(row)}>以此另存新版本</Button></p></>}))}/>
    <Modal title="保存同角色造型版本" open={open} width={760} onCancel={()=>setOpen(false)} onOk={()=>void save()} confirmLoading={busy} styles={{body:{maxHeight:'70vh',overflowY:'auto'}}}>
      {error&&<Alert type="error" message={error}/>}
      <Form form={form} layout="vertical"><Form.Item name="name" label="造型名称" rules={[{required:true,whitespace:true}]}><Input maxLength={120}/></Form.Item>
      <Form.Item name="description" label="本造型说明（服装、发型、适用剧情）"><Input.TextArea rows={3} maxLength={5000}/></Form.Item>
      <Form.Item name="costume_id" label="关联服装"><Select allowClear showSearch optionFilterProp="label" options={costumes}/></Form.Item>
      <Form.Item name="creative_direction" label="造型创作设定（未覆盖字段保存角色当前值）"><CreativeDirectionDraftFields/></Form.Item></Form>
      <Button disabled={views.length>=7} onClick={()=>setPick(true)}>从素材库添加造型图片</Button>
      <p>请先在角色图片区生成/上传需要的造型，再选择对应图片保存；每个角度限一张，不会自动生成或收费。</p>
      <Space wrap><Image.PreviewGroup>{views.map((v,i)=><div key={v.file_id}><Image width={110} src={buildFilePreviewUrl(v.file_id)} preview={{src:buildFileDownloadUrl(v.file_id)}}/><Select value={v.view_angle} options={angles} onChange={angle=>setViews(old=>old.map((x,j)=>j===i?{...x,view_angle:angle}:x))}/><Button onClick={()=>setViews(old=>old.filter((_,j)=>j!==i))}>移除</Button></div>)}</Image.PreviewGroup></Space>
      {pick&&<MediaFilePicker kind="image" selectedIds={views.map(v=>v.file_id)} onClose={()=>setPick(false)} onSelect={file=>{setViews(old=>[...old,{file_id:file.id,view_angle:(angles.find(a=>!old.some(v=>v.view_angle===a.value))?.value||'FRONT') as NonNullable<AppearanceCreate['views']>[number]['view_angle']}]);setPick(false)}}/>}
    </Modal>
  </Card>
}
/** 每个镜头为同角色选用一个造型；并发版本校验防止覆盖其他页面的选择。 */
export function CharacterAppearanceSelect({shotId,characterId,value,disabled,onChanged}:{shotId:string;characterId:string;value?:string|null;disabled?:boolean;onChanged:()=>void}) {
  const [rows,setRows]=useState<AppearanceRead[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const active=useRef(true)
  useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
  useEffect(()=>{let active=true;Api.getAppearancesApiV1StudioCharacterAppearancesCharactersCharacterIdGet({characterId}).then(r=>{if(active)setRows(r.data||[])}).catch(()=>{if(active)setError('造型列表加载失败')});return()=>{active=false}},[characterId,value])
  /** 选择只影响本镜头后续生成，旧图片与已生成视频保留。 */
  const change=async(next:string)=>{setBusy(true);setError('');try{await Api.putAppearanceApiV1StudioCharacterAppearancesShotsShotIdCharactersCharacterIdPut({shotId,characterId,requestBody:{appearance_id:next||null,expected_appearance_id:value||null}});if(active.current)onChanged();window.dispatchEvent(new CustomEvent('creative-direction-updated'))}catch(e){if(active.current)setError((e as {body?:{detail?:string}}).body?.detail||'选择失败，请刷新')}finally{if(active.current)setBusy(false)}}
  return <div style={{width:'100%',marginBottom:12}}><label>本镜头造型</label><Select style={{width:'100%'}} disabled={disabled||busy} value={value||''} onChange={v=>void change(v)} options={[{value:'',label:'角色当前定妆（未指定版本）'},...rows.map(r=>({value:r.id,label:`${r.name} · v${r.version}`}))]}/>{error&&<Alert type="warning" message={error}/>}</div>
}
