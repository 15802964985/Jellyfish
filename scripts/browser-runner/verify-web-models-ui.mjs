/** Exercise real React catalogs and live readiness with every business/platform request mocked. */
import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const base=process.env.JELLYFISH_TEST_URL||'http://127.0.0.1:5189'
const browser=await chromium.launch({channel:'msedge',chromiumSandbox:true,headless:true})
const page=await browser.newPage({viewport:{width:1366,height:900}})
const errors=[],writes=[];let ready=false,revision=0
let models=[{name:'Seedream 4.5',enabled:true,is_default:true,note:'图片核验',source:'runner_observed',automatic_supported:true,excluded_account_ids:[]}]
const accounts=[{id:'a',platform:'doubao',display_name:'测试账号',enabled:true,supported_models:['Seedream 4.5'],session_state:'ready',online:true}]
page.on('pageerror',e=>errors.push(e.message))
await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),path=url.pathname
 if(path==='/settings/web-models')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/src/components/__fixtures__/WebModelsCheck.tsx"></script>'})
 if(path==='/channel-fixture')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/src/components/__fixtures__/WebChannelCheck.tsx"></script>'})
 if(path.startsWith('/api/')){
  let data={data:[],meta:{total:0}}
  if(path.endsWith('/platforms'))data={doubao:{name:'豆包'},jimeng:{name:'即梦AI'}}
  else if(path.endsWith('/accounts'))data=accounts
  else if(path.includes('/models/')){
   if(req.method()==='PUT'){
    const body=JSON.parse(req.postData());writes.push(body)
    assert.equal(body.expected_revision,revision);revision++
    const names=new Set(body.models.map(m=>m.name));models=[...body.models,...models.filter(m=>!names.has(m.name)).map(m=>({...m,enabled:false,is_default:false}))]
   }
   data={revision,models:path.endsWith('/video')?[]:models}
  }else if(path.endsWith('/execution-status')){
   const available=ready&&url.searchParams.get('model')==='Seedream 4.5'
   data={available,reasons:available?[]:['图片执行器离线，请启动图片执行器'],eligible_account_ids:available?['a']:[],cost_notice:'网页权益未实时核实'}
  }else if(req.method()!=='GET')throw Error('Unexpected mutation '+path)
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 }
 if(url.origin===base)return route.continue();return route.abort()
})
/** Select an Ant control by its accessible label and exact visible option. */
async function choose(label,text){
 await page.locator('.ant-select').filter({has:page.getByRole('combobox',{name:label,exact:true})}).click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(text,{exact:true}).click()
}
try{
 await page.goto(base+'/settings/web-models',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:/编\s*辑/,exact:true}).waitFor()
 await page.getByRole('button',{name:/编\s*辑/,exact:true}).click()
 await page.getByLabel('官网显示的完整模型名称').fill('新网页图片型号')
 await page.getByRole('button',{name:'确 定',exact:true}).click()
 await page.getByRole('row').filter({hasText:'新网页图片型号'}).waitFor();assert.equal(writes.length,1)
 assert.equal(writes[0].models[0].name,'新网页图片型号')
 await page.reload({waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('row').filter({hasText:'新网页图片型号'}).waitFor();assert.equal(writes.length,1)
 await choose('模型目录用途','生成视频');await page.getByText('暂无数据',{exact:true}).waitFor()
 // Returning to a generation dialog must use its media-scoped default, not an API default.
 models=[{name:'Seedream 4.5',enabled:true,is_default:true,note:'图片核验',source:'runner_observed',automatic_supported:true,excluded_account_ids:[]}]
 await page.goto(base+'/channel-fixture',{waitUntil:'domcontentloaded',timeout:60000});await page.getByText('平台网页',{exact:true}).click()
 await page.getByRole('button',{name:'平台网页生成',exact:true}).click()
 await page.getByLabel('提交不可用原因').waitFor()
 assert.ok(await page.locator('.ant-select-selection-item').filter({hasText:'Seedream 4.5'}).count())
 const prompt=page.getByRole('textbox',{name:'交接提示词'});await prompt.fill('我的未保存提示词')
 ready=true;await page.getByText('本机执行器已就绪',{exact:true}).waitFor({timeout:12000})
 assert.equal(await prompt.inputValue(),'我的未保存提示词')
 assert.ok(await page.locator('.ant-select-selection-item').filter({hasText:'本机执行器 · 自动执行（优先）'}).count())
 ready=false;await page.getByLabel('提交不可用原因').waitFor({timeout:12000})
 await page.getByRole('checkbox').check();assert.equal(await page.getByRole('button',{name:'提交后台任务',exact:true}).isDisabled(),true)
 await page.setViewportSize({width:540,height:850})
 const button=await page.getByRole('button',{name:/关\s*闭/,exact:true}).boundingBox();assert.ok(button&&button.y+button.height<=850)
 await page.screenshot({path:new URL('../../.local/web-models-dialog.png',import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:')})
 assert.equal(writes.length,1);assert.deepEqual(errors,[])
 console.log('PASS catalog rename/persistence/media isolation; default; live offline/ready; draft retained; no implicit generation; small-screen footer')
}catch(error){console.log('PAGE_ERRORS',errors);console.log('PAGE_TEXT',(await page.locator('body').innerText()).slice(0,1500));throw error}finally{await browser.close()}
