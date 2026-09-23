/** Read only visible Jimeng login evidence; never equate a login with generation support. */
export async function jimengSessionState(page){
 if(new URL(page.url()).hostname!=='jimeng.jianying.com')return 'offline'
 for(const node of await page.locator('[id*="captcha"],iframe[src*="captcha"]').all())if(await node.isVisible())return 'needs_verification'
 for(const label of ['手机号登录','扫码登录','登录即梦','登录 / 注册'])if(await page.getByText(label,{exact:true}).first().isVisible())return 'needs_login'
 const account=page.locator('button[class*="user-row"]')
 // Responsive layouts retain a hidden avatar; inspect visible instances, not the first DOM match.
 if(await account.count()===1&&await page.getByRole('button',{name:'创作',exact:true}).isVisible()){
  for(const avatar of await page.locator('img.dreamina-component-avatar').all())if(await avatar.isVisible())return 'signed_in'
 }
 return 'offline'
}
