/** Offline browser acceptance: all API requests are intercepted; no real configuration or paid task is written. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({channel:'msedge',headless:true})
const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true})
page.on('pageerror', error => console.error('PAGE ERROR', error.message))
let revision='r1', defaults='480p', audio=false, writes=0, failDetails=true
const spec=()=>({model_id:'test',model_name:'Seedance fixture',provider:'volcengine',revision_id:revision,
  category:'video',field:'resolution',default:defaults,options:[{value:'480p',label:'480p'},{value:'720p',label:'720p'}],
  generate_audio:{default:audio},price:null,reference_price:{currency:'CNY',rates:{'480p':'0.08','720p':'0.16'},audio_rates:{'480p':'0.16','720p':'0.32'},source:'https://www.volcengine.com/docs/82379/1544106'},
  package_reference:{currency:'AFP',rates:{'480p':'36','720p':'72'},audio_rates:{'480p':'72','720p':'144'}},notice:'offline acceptance'})
try {
 await page.route('**/api/**',async route=>{
  const req=route.request(), path=new URL(req.url()).pathname
  if(path.endsWith('/character-views'))return route.fulfill({json:{data:[{character_id:'role',name:'妈妈',views:[{file_id:'side',image_id:1,source_type:'character',source_id:'role',view_angle:'LEFT',label:'角色定妆 · 左侧'}]}]}})
  if(path.endsWith('/generation-specification'))return route.fulfill({json:{data:spec()}})
  if(path.endsWith('/generation-defaults') && req.method()==='PATCH'){
   const body=req.postDataJSON();assert.equal(body.expected_revision_id,revision)
   defaults=body.value;audio=body.generate_audio;revision='r2';writes++
   return route.fulfill({json:{data:{revision_id:revision}}})
  }
  if(path.endsWith('/film/tasks')) return route.fulfill({json:{data:{items:[],total:0,page:1,page_size:10,total_pages:0}}})
  if(path.endsWith('/call-details')){
   if(failDetails){failDetails=false;return route.fulfill({status:500,json:{detail:'offline failure'}})}
   const task=path.includes('/one/')?'one':'two'
   return route.fulfill({json:{data:{identity:{model_name:'fixture-'+task,provider_name:'Fixture'},status:'succeeded',
    snapshot:{execution_prompt:'prompt-'+task},calls:[],notice:'offline record'}}})
  }
  if(req.method()!=='GET')throw new Error('Unexpected mutation '+path)
  return route.fulfill({status:404,body:''})
 })
 await page.goto('http://127.0.0.1:5174/governance-acceptance.html')
 await page.getByRole('button',{name:/右\s*移/}).first().click()
 await page.getByRole('button',{name:'保存本帧参考',exact:true}).click()
 assert.deepEqual(JSON.parse(await page.getByTestId('saved').textContent()),{first:['b','a'],key:['b'],last:[]})
 await page.locator('.ant-select-selector').first().click()
 await page.locator('.ant-select-dropdown:visible').getByText('last',{exact:true}).click()
 assert.equal(await page.locator('input[type=checkbox]:checked').count(),0)
 await page.locator('.ant-select-selector').first().click()
 await page.locator('.ant-select-dropdown:visible').getByText('first',{exact:true}).click()
 assert.equal(await page.getByText('图1',{exact:true}).count(),1)
 await page.getByRole('button',{name:'取消全部',exact:true}).click()
 await page.getByRole('button',{name:'保存本帧参考',exact:true}).click()
 assert.deepEqual(JSON.parse(await page.getByTestId('saved').textContent()),{first:[],key:['b'],last:[]})
 await page.getByText('妈妈 · 未关联演员 · 1 张',{exact:true}).click()
 await page.getByRole('checkbox',{name:'妈妈 角色定妆 · 左侧'}).check()
 await page.getByRole('button',{name:'保存本帧参考',exact:true}).click()
 assert.deepEqual(JSON.parse(await page.getByTestId('saved').textContent()),{first:['side'],key:['b'],last:[]})
 await page.getByRole('button',{name:'详情一',exact:true}).click()
 await page.getByText('调用详情读取失败，请重试',{exact:true}).waitFor()
 await page.getByRole('button',{name:/^刷\s*新$/}).click()
 await page.getByText('prompt-one',{exact:true}).waitFor()
 const downloadPromise=page.waitForEvent('download')
 await page.getByRole('button',{name:'导出脱敏记录',exact:true}).click()
 const download=await downloadPromise
 const stream=await download.createReadStream();let content=''
 for await(const chunk of stream)content+=chunk.toString()
 assert.equal(JSON.parse(content).snapshot.execution_prompt,'prompt-one')
 await page.locator('.ant-drawer-close').click()
 await page.getByRole('button',{name:'详情二',exact:true}).click()
 await page.getByText('prompt-two',{exact:true}).waitFor()
 assert.equal(await page.getByText('prompt-one',{exact:true}).count(),0)
 await page.locator('.ant-drawer-close').click()
 await page.getByRole('button',{name:'测试整批',exact:true}).click()
 await page.getByText('生成原生音频（可能影响费用）',{exact:true}).click()
 await page.getByText('将此规格及音频设置设为该模型默认',{exact:true}).click()
 await page.getByRole('button',{name:'确认本组规格',exact:true}).click()
 await page.getByText('确认整批生成',{exact:true}).waitFor()
 assert.equal(writes,1);assert.equal(audio,true)
 assert.match(await page.getByRole('dialog').filter({hasText:'确认整批生成'}).innerText(),/720.0000 AFP/)
 await page.getByRole('button',{name:'取消整批',exact:true}).click()
 await page.getByText('cancelled',{exact:true}).waitFor()
 assert.equal(writes,1)
 const panel=page.getByRole('region',{name:'视频参数与费用',exact:true})
 await panel.getByRole('button',{name:'刷新模型参数',exact:true}).click()
 await panel.locator('.ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^720p$/}).click()
 await page.getByRole('button',{name:'测试面板选择',exact:true}).click()
 await page.getByRole('button',{name:'按此规格生成',exact:true}).click()
 await page.locator('output').filter({hasText:'720p'}).waitFor()
 await page.getByRole('button',{name:'测试任务搜索',exact:true}).click()
 await page.getByPlaceholder('搜索厂商或型号（历史冻结名称）').fill('SearchAlpha')
 await page.getByPlaceholder('搜索厂商或型号（历史冻结名称）').press('Enter')
 await page.getByText(/^未结束 /).click()
 await page.getByText('SearchAlpha',{exact:true}).waitFor()
 assert.equal(await page.getByText('SearchBeta',{exact:true}).count(),0)
 await page.getByPlaceholder('搜索厂商或型号（历史冻结名称）').fill('missing-model')
 await page.getByPlaceholder('搜索厂商或型号（历史冻结名称）').press('Enter')
 await page.getByText(/^未结束 /).click()
 assert.equal(await page.getByText('SearchAlpha',{exact:true}).count(),0)
 console.log('PASS: task search across scopes; per-frame reorder/empty/reopen, task retry/export/isolation, audio default save, batch total/cancel; provider requests 0; mocked saves 1')
}finally{
 await page.unrouteAll({behavior:'ignoreErrors'})
 await browser.close()
}
