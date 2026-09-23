import { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import { Link } from 'react-router-dom'
import { StudioWebGenerationService as Web, type WebCatalogRead, type WebModelPolicy, type WebModelEvidence, type WebAccountRead } from '../services/generated'

const sourceLabels:Record<string,string>={maintained:'已维护',runner_observed:'执行器观察',successful_receipt:'历史成功',official_example:'官网示例',local_browser_observed:'本机实测'}
/** Maintain website names by media scope; operator policy never manufactures adapter capability or free quota. */
export default function WebModels(){
 const [platform,setPlatform]=useState('doubao'),[modality,setModality]=useState<'image'|'video'>('image')
 const [platforms,setPlatforms]=useState<Record<string,{name:string}>>({}),[accounts,setAccounts]=useState<WebAccountRead[]>([])
 const [data,setData]=useState<WebCatalogRead>({revision:0,models:[]}),[loading,setLoading]=useState(true),[error,setError]=useState('')
 const [editing,setEditing]=useState<WebModelEvidence|null|undefined>(),[saving,setSaving]=useState(false),[refresh,setRefresh]=useState(0)
 const [form]=Form.useForm()
 /** Scope changes discard old responses; refresh is read-only and never opens a supplier website. */
 useEffect(()=>{let live=true;setLoading(true);setError('');setData({revision:0,models:[]})
  void Promise.all([Web.platformModelsApiV1StudioWebGenerationPlatformsPlatformModelsModalityGet({platform,modality}),Web.accountsApiV1StudioWebGenerationAccountsGet(),Web.platformsApiV1StudioWebGenerationPlatformsGet()]).then(([directory,rows,sites])=>{if(live){setData(directory);setAccounts(rows);setPlatforms(sites)}}).catch(()=>{if(live)setError('目录读取失败，请刷新重试')}).finally(()=>{if(live)setLoading(false)})
  return()=>{live=false}
 },[platform,modality,refresh])
 /** Preserve non-edited rows and use a server revision to reject competing settings writes. */
 const save=async()=>{
  try{const value=await form.validateFields();setSaving(true)
   const policy:WebModelPolicy={name:value.name.trim(),enabled:value.enabled,is_default:value.enabled&&value.is_default,note:value.note||'',excluded_account_ids:value.excluded_account_ids||[]}
   if(data.models.some(m=>m.name!==editing?.name&&m.name.toLowerCase()===policy.name.toLowerCase())){message.error('该型号已经存在，请编辑原记录');return}
   const models:WebModelPolicy[]=data.models.filter(m=>m.name!==editing?.name).map(m=>({name:m.name,enabled:m.enabled,is_default:policy.is_default?false:m.is_default,note:m.note,excluded_account_ids:m.excluded_account_ids}))
   models.push(policy)
   const updated=await Web.savePlatformModelsApiV1StudioWebGenerationPlatformsPlatformModelsModalityPut({platform,modality,requestBody:{expected_revision:data.revision??0,models}})
   setData(updated);setEditing(undefined);message.success('网页模型目录已保存；已有任务保留原型号')
  }catch(e:any){if(!e?.errorFields)message.error(typeof e?.body?.detail==='string'?e.body.detail:'保存失败，请检查输入；目录冲突时关闭编辑并刷新')}finally{setSaving(false)}
 }
 return <Card title="网页平台模型" extra={<Space wrap><Link to="/settings/web-accounts">网页平台账号</Link><Link to="/settings">系统设置</Link></Space>}>
  <Alert showIcon message="按平台和生成用途维护官网型号，与 API 模型分别管理" description="支持新增、改名、停用、默认选择和账号排除。新增型号默认仅可人工交接，自动执行需对应适配器和账号现场核验。改名保留停用的旧名称，历史任务不改写。"/>
  <Space wrap className="my-4"><Select aria-label="模型目录平台" style={{width:180}} value={platform} onChange={setPlatform} options={Object.entries(platforms).map(([value,p])=>({value,label:p.name}))}/><Select aria-label="模型目录用途" style={{width:140}} value={modality} onChange={setModality} options={[{value:'image',label:'生成图片'},{value:'video',label:'生成视频'}]}/><Button onClick={()=>setRefresh(v=>v+1)}>刷新目录与账号状态</Button><Button type="primary" disabled={loading||!!error} onClick={()=>{form.setFieldsValue({name:'',enabled:true,is_default:false,note:'',excluded_account_ids:[]});setEditing(null)}}>新增网页型号</Button></Space>
  {error&&<Alert type="error" message={error}/>}
  <Table rowKey="name" dataSource={data.models} loading={loading} scroll={{x:900}} pagination={{pageSize:8,showTotal:n=>`共 ${n} 个型号`}} columns={[
   {title:'官网型号',dataIndex:'name',render:(value,row)=><Space wrap><span title={value}>{value}</span>{row.is_default&&<Tag color="blue">默认</Tag>}</Space>},
   {title:'状态',render:(_,row)=><Tag color={row.enabled?'green':'default'}>{row.enabled?'启用':'停用'}</Tag>},
   {title:'执行方式',render:(_,row)=>row.automatic_supported?'已适配自动执行（仍需账号就绪）':'人工交接'},
   {title:'来源 / 最近观察',render:(_,row)=><>{sourceLabels[row.source||'maintained']||row.source}<div>{row.observed_at?new Date(row.observed_at).toLocaleString():'尚无观察时间'}</div></>},
   {title:'账号排除',render:(_,row)=>(row.excluded_account_ids||[]).map(id=>accounts.find(a=>a.id===id)?.display_name||id).join('、')||'未限制'},
   {title:'说明',dataIndex:'note',ellipsis:{showTitle:true}},
   {title:'操作',render:(_,row)=><Button onClick={()=>{form.setFieldsValue(row);setEditing(row)}}>编辑</Button>},
  ]}/>
  <Alert className="mt-3" type="warning" showIcon message="网页权益未实时核实，不把可选型号当成免费型号" description="刷新会重新读取本机执行器和成功任务证据，不会登录官网抓取余额，也不会产生模型费用。账号限额、会员要求可能变化；不能可靠确认时保持未知，执行器遇到验证或限制会暂停，不自动升级、换号重发。"/>
  <Modal width={620} open={editing!==undefined} title={editing?'编辑网页型号':'新增网页型号'} confirmLoading={saving} onCancel={()=>setEditing(undefined)} onOk={()=>void save()} styles={{body:{maxHeight:'65vh',overflowY:'auto'}}}>
   <Form form={form} layout="vertical"><Form.Item name="name" label="官网显示的完整模型名称" rules={[{required:true,whitespace:true,message:'请输入官网完整型号'}]} extra="图片和视频分开维护；API 型号、req_key 不等同于网页名称。"><Input maxLength={100}/></Form.Item><Space align="start"><Form.Item name="enabled" label="启用" valuePropName="checked"><Switch/></Form.Item><Form.Item name="is_default" label="本用途默认型号" valuePropName="checked"><Switch/></Form.Item></Space><Form.Item name="excluded_account_ids" label="不使用此型号的账号" extra="没有开通、权限失效等可排除；取消排除不代表自动核验通过。"><Select mode="multiple" options={accounts.filter(a=>a.platform===platform).map(a=>({value:a.id,label:a.display_name}))}/></Form.Item><Form.Item name="note" label="用途或限制说明"><Input.TextArea rows={3} maxLength={500} showCount/></Form.Item></Form>
   {editing&&<Alert message="更改名称会停用原名称并新增新名称，原任务及结果仍绑定原型号。"/>}
  </Modal>
 </Card>
}
