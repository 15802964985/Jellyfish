import assert from 'node:assert/strict'
import { chromium } from 'file:///C:/Users/Lenovo/AppData/Local/Temp/jellyfish-browser-check/node_modules/playwright/index.mjs'

/** 正式页面只读验收：允许免费预览，禁止配置写入、创建项目和模型调用。 */
async function verifyProjectStyles() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = [], forbidden = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.route('**/api/**', route => {
      const request = route.request()
      if (!['GET','OPTIONS'].includes(request.method()) && !request.url().includes('/creative-directions/') ) { forbidden.push(request.url()); return route.abort() }
      if (request.method() === 'PUT' || request.method() === 'DELETE') { forbidden.push(request.url()); return route.abort() }
      return route.continue()
    })
    const catalog = await (await page.request.get('http://127.0.0.1:8000/api/v1/studio/creative-directions/catalog')).json()
    assert.equal(catalog.data.genres.length, 10)
    assert.ok(catalog.data.treatments['动漫'].includes('3D国漫'))
    const projects = await (await page.request.get('http://127.0.0.1:8000/api/v1/studio/projects?page=1&page_size=10')).json()
    const id = projects.data.items[0].id
    await page.goto('http://127.0.0.1:7788/projects')
    await page.getByText('新建项目', { exact: true }).click()
    const modal = page.getByRole('dialog')
    await modal.getByRole('button', {name:'3D修真',exact:true}).click()
    assert.match(await modal.innerText(), /3D国漫/)
    assert.match(await modal.innerText(), /玄幻修真/)
    await modal.getByText('补充设定（可选）', {exact:true}).click()
    assert.match(await modal.innerText(), /叙事标签/)
    await modal.getByRole('button',{name:/取\s*消/}).click()
    await page.goto('http://127.0.0.1:7788/projects/'+id)
    await page.getByRole('button',{name:'项目创作设定',exact:true}).first().click()
    const drawer = page.getByRole('dialog')
    await drawer.getByText(/已保存的有效设定与来源/).click()
    assert.match(await drawer.innerText(), /都市生活/)
    assert.match(await drawer.innerText(), /旧数据设定来源/)
    await drawer.getByRole('button',{name:/关\s*闭/}).last().click()
    const response=await page.request.post('http://127.0.0.1:8000/api/v1/studio/creative-directions/project/'+id+'/preview',{data:{purpose:'video',prompt:'人物在门口停下。'}})
    assert.equal(response.status(),200)
    assert.match((await response.json()).data.prompt,/创作设定版本:/)
    assert.deepEqual(forbidden,[])
    assert.deepEqual(errors,[])
    await page.screenshot({path:'.local/creative-browser.png',fullPage:true})
    console.log('PASS 四维分类、快捷组合、独立叙事标签、项目设定来源、免费最终预览；零业务写入/模型调用/页面异常')
  } finally { await browser.close() }
}
await verifyProjectStyles()
