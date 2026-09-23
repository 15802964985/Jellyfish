import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd'
import { Link } from 'react-router-dom'
import { StudioWebGenerationService as Web, type WebDesktopStatus, type WebAccountRead } from '../services/generated'

const verificationLabels:Record<string,string>={image_candidate:'图片 / 已适配视频自动执行',manual_or_official_api:'人工交接 / 官方API',awaiting_browser_validation:'待网页流程核验',capabilities_unverified:'能力待核对'}
import { webAccountStatus } from '../components/webAccountStatus'
/** Maintain aliases and dispatch availability; credentials stay in isolated local Edge profiles. */
export default function WebAccounts() {
 const [rows,setRows]=useState<WebAccountRead[]>([])
 const [catalog,setCatalog]=useState<Record<string,{name:string;url:string;status:string}>>({})
 const [desktop,setDesktop]=useState<WebDesktopStatus>({online:false,commands:[]})
 const [statusLoaded,setStatusLoaded]=useState(false)
 const [opening,setOpening]=useState<string|null>(null)
 const launchIds=useRef<Record<string,string>>({})
 const [error,setError]=useState('')
 const [editing,setEditing]=useState<WebAccountRead|null|undefined>(undefined)
 const [saving,setSaving]=useState(false)
 const [form]=Form.useForm()
 /** Poll only lightweight account status; page navigation never cancels a task. */
 useEffect(()=>{let live=true
  const load=async()=>{try{const [data,platformData,host]=await Promise.all([Web.accountsApiV1StudioWebGenerationAccountsGet(),Web.platformsApiV1StudioWebGenerationPlatformsGet(),Web.desktopStatusApiV1StudioWebGenerationDesktopStatusGet()]);if(live){setRows(data);setCatalog(platformData);setDesktop(host);setStatusLoaded(true);setError('')}}catch{if(live)setError('账号服务暂不可用，请确认后端已启动。')}}
  let timer:ReturnType<typeof setTimeout>
  const poll=async()=>{await load();if(live)timer=setTimeout(()=>void poll(),3000)}
  void poll()
  return()=>{live=false;clearTimeout(timer)}
 },[])
 /** Explicit UI clicks queue an idempotent local action without browser URLs or account IDs copied by users. */
 const openAccount=async(row:WebAccountRead,action:'login'|'runner')=>{
  const key=row.id+':'+action;launchIds.current[key]??=crypto.randomUUID().replace(/-/g,'');setOpening(row.id)
  try{const command=await Web.desktopLaunchApiV1StudioWebGenerationAccountsAccountIdDesktopPost({accountId:row.id,requestBody:{action,request_id:launchIds.current[key]}})
   setDesktop(current=>({...current,commands:[command,...(current.commands??[]).filter(item=>item.account_id!==row.id)]}));delete launchIds.current[key];message.success('打开请求已发送，系统会自动使用该账号的独立浏览器')
  }catch(e:any){message.error(e?.body?.detail||e?.body?.message||'本机助手暂不可用，请稍后重试')}finally{setOpening(null)}
 }
 /** Save non-sensitive metadata; disabling affects new assignments only. */
 const save=async()=>{
  try{const values=await form.validateFields();setSaving(true)
   const requestBody=values
   const row=editing?await Web.updateAccountApiV1StudioWebGenerationAccountsAccountIdPatch({accountId:editing.id,requestBody}):await Web.createAccountApiV1StudioWebGenerationAccountsPost({requestBody})
   setRows(current=>[...current.filter(item=>item.id!==row.id),row]);setEditing(undefined);message.success('账号已保存');if(!editing)await openAccount(row,'login')
  }catch(e:any){if(!e?.errorFields)message.error(e?.body?.message||'保存失败')}finally{setSaving(false)}
 }
 return <Card title="网页平台账号" extra={<Space wrap><Link to="/settings/web-models">网页平台模型</Link><Link to="/web-generation">网页生成交接与官方导出</Link><Link to="/settings">返回系统设置</Link><Button type="primary" onClick={()=>{form.setFieldsValue({display_name:'',enabled:true,platform:'doubao'});setEditing(null)}}>新增账号</Button></Space>}>
  <Alert type="info" showIcon message="默认自动分配可用账号，无需逐次选择" description="自动分配优先选择可用账号，单个账号不可用不影响其他账号。待登录、待验证可先提交，人工完成后自动继续；忙碌账号可排队。具体型号在执行时核实，每账号同时执行一个任务。" />
  {/* Hide the banner until the first status query answers: initial state would otherwise
      flash "本机助手离线" for the request latency on every hard refresh. */}
  {statusLoaded&&<Alert className="mt-3" showIcon type={desktop.online?'success':'warning'} message={desktop.online?'本机助手已连接 · 新增后自动打开官网登录':'本机助手离线 · 账号操作暂不可用'} description={desktop.online?'无需复制账号编号或运行单账号脚本。每个账号使用独立窗口完成登录和自动执行，登录后持续识别状态，无需切换窗口；各平台的登录状态与自动生成能力分别显示。':'本机助手未连接，下方账号操作按钮不可用。请到项目根目录双击「启动网页本机助手.cmd」启动本机助手（只需一次，之后开机自启）；本页每 3 秒自动刷新，恢复后按钮即可用，无需重启整个项目。'}/>}
  {error&&<Alert className="my-3" type="error" message={error}/>}
  <Table className="mt-4" rowKey="id" dataSource={rows} pagination={false} scroll={{x:850}} columns={[
   {title:'账号名称',dataIndex:'display_name',render:(value:string)=><span title={value}>{value}</span>},
   {title:'平台',render:(_,row)=>catalog[row.platform]?.name||row.platform},
   {title:'对接状态',render:(_,row)=>verificationLabels[catalog[row.platform]?.status]||'待核对'},
   {title:'调度',render:(_,row)=><Tag color={row.enabled?'green':'default'}>{row.enabled?'已启用':'已停用'}</Tag>},
   {title:'账号状态',render:(_,row)=>{const status=webAccountStatus(row);return <><Tag color={status.color}>{status.label}</Tag>{status.help&&<div className="text-xs text-slate-500">{status.help}</div>}</>}},
   {title:'执行器已核实模型',render:(_,row)=><><div>图片：{row.supported_models.join('、')||'尚未核实'}</div><div>视频：{row.supported_video_models?.join('、')||'尚未核实'}</div><div>{row.observed_at?new Date(row.observed_at).toLocaleString():''}</div></>},
   {title:'当前任务',render:(_,row)=>row.active_task_id?<Link to={`/web-generation/${row.active_task_id}`}>查看原任务（保留账号）</Link>:'空闲'},
   {title:'本机窗口',render:(_,row)=>{const command=(desktop.commands??[]).find(item=>item.account_id===row.id);return <span title={command?.message}>{row.online?'执行器已连接':command?({queued:'等待打开',starting:'正在打开',opened:row.platform==='doubao'?'登录 / 执行窗口已打开':'官网窗口已打开',closed:'已关闭',failed:'打开失败'}[command.state]):'未打开'}{command?.state==='failed'&&<div>{command.message}</div>}</span>}},
   {title:'操作',render:(_,row)=>{
    // 命令态与账号在线态共同构成"忙"；两者都会让按钮看起来一样灰，但原因不同。
    const command=(desktop.commands??[]).find(item=>item.account_id===row.id)
    const pending=!!command&&['queued','starting','opened'].includes(command.state)
    /** 按优先级给出唯一禁用原因，供 tooltip 使用；顺序必须与下方 disabled 判据一致。 */
    const blocked=(extra?:string)=>{if(!desktop.online)return '本机助手离线：请到项目根目录双击「启动网页本机助手.cmd」启动本机助手（只需一次，之后开机自启），本页每 3 秒自动刷新';if(row.active_task_id)return '该账号正在执行任务，任务结束后才能操作';if(row.online)return '该账号的执行器已在线，无需重复打开';if(pending)return '该账号已有排队或打开中的命令，请等待它完成';return extra??''}
    /** 仅在有原因时包一层容器挂 tooltip：antd 的禁用按钮不派发鼠标事件，直接挂会失效。 */
    const withTip=(reason:string,node:ReactNode)=>reason?<Tooltip title={reason}><span style={{display:'inline-block'}}>{node}</span></Tooltip>:node
    const loginReason=blocked()
    const runnerReason=blocked(row.readiness?.code==='unsupported_platform'?'「启动自动执行器」暂未适配该平台，可先使用人工交接':!row.enabled?'该账号已停用，不参与自动执行':undefined)
    return <Space wrap>{withTip(loginReason,<Button disabled={!!loginReason} loading={opening===row.id} onClick={()=>void openAccount(row,'login')}>打开官网登录</Button>)}{withTip(runnerReason,<Button disabled={!!runnerReason} onClick={()=>void openAccount(row,'runner')}>启动自动执行器</Button>)}<Button onClick={()=>{form.setFieldsValue(row);setEditing(row)}}>编辑 / 连接说明</Button></Space>}},
  ]}/>
  <p className="mt-4 text-slate-500">一个平台登录账号登记一次，可用于图片和视频。型号在生成页面选择；已适配自动执行的型号按平台、账号与参数实时核验，是否可用以当前账号实际状态为准。不要在任务执行中更换官网登录账号。人工交接仅作为显式降级选项。</p>
  <Modal open={editing!==undefined} title={editing?'编辑网页账号':'新增网页平台账号'} confirmLoading={saving} onOk={()=>void save()} onCancel={()=>setEditing(undefined)}>
   <Form form={form} layout="vertical"><Form.Item name="platform" label="平台" rules={[{required:true}]}><Select disabled={!!editing} options={Object.entries(catalog).map(([value,item])=>({value,label:item.name}))}/></Form.Item><Form.Item name="display_name" label="账号备注名称" extra="仅用于识别，可随时修改；不改变配对编号、登录资料或历史任务。" rules={[{required:true,whitespace:true,message:'请填写便于识别的名称'}]}><Input maxLength={120} placeholder="例如：豆包创作账号A，无需填写手机号"/></Form.Item><Form.Item name="enabled" label="参与自动分配" valuePropName="checked"><Switch/></Form.Item></Form>
   <Alert type="info" message={editing?'保存只修改备注和调度设置，不会重新登录':'保存后自动打开该账号的官网，请在新窗口完成登录'} />
   {editing&&<Alert type="info" message="系统内部账号编号（自动传递，无需复制）" description={<><Input readOnly value={editing.id}/><p>返回列表点击“打开官网登录”或“启动自动执行器”即可。此编号只用于排查，系统会自动传递。</p></>}/>}
  </Modal>
 </Card>
}
