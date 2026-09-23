/** Verify the deployed read-only inventory entry, filters and failure state without Docker mutations. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({channel:'msedge',headless:true})
try {
 const page = await browser.newPage({viewport:{width:1440,height:950}})
 await page.route('**/api/**', route => ['GET','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort())
 await page.goto('http://127.0.0.1:7788/settings')
 await page.getByRole('button',{name:'Docker 镜像清单',exact:true}).click()
 await page.getByText('采集时间：',{exact:false}).waitFor()
 assert.ok(await page.locator('.ant-table-tbody tr').count())
 await page.getByRole('textbox',{name:'搜索镜像'}).fill('不存在的镜像123456')
 await page.getByText('暂无数据',{exact:true}).waitFor()
 await page.getByRole('textbox',{name:'搜索镜像'}).fill('')
 await page.locator('.ant-select[aria-label="引用状态"] .ant-select-selector').click()
 await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').filter({hasText:/^运行中引用$/}).click()
 for(const status of await page.locator('.ant-table-tbody .ant-tag').allTextContents()) assert.equal(status,'运行中引用')
 await page.route('**/local-inventory/docker-images.json',route=>route.fulfill({status:503,body:'Unavailable'}))
 await page.getByRole('button',{name:'刷新清单'}).click()
 await page.getByText('下方保留上次结果，不代表当前状态。',{exact:true}).waitFor()
 await page.unroute('**/local-inventory/docker-images.json')
 await page.getByRole('button',{name:'刷新清单'}).click()
 await page.getByText('下方保留上次结果，不代表当前状态。',{exact:true}).waitFor({state:'hidden'})
 await page.screenshot({path:process.env.TEMP+'/jellyfish-docker-web.png'})
 assert.equal((await page.request.get('http://127.0.0.1:7788/local-inventory/docker-images-preview.png')).status(),404)
 console.log('PASS: settings entry, inventory, search, status, refresh/error/recovery and other report paths blocked')
} finally { await browser.close() }
