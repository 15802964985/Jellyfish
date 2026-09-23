import {doubaoImageAdapter,openImageEntry} from './doubao-adapter.mjs'
import {doubaoVideoAdapter,observeVideoModels} from './doubao-video.mjs'
import {dismissAnnouncements,sessionBlocker} from './doubao-session.mjs'

/** Website-specific discovery; probing never submits or substitutes a model. */
async function discoverDoubao(page){
 const found=[]
 try{const image=await openImageEntry(page);if(image)found.push(image)}catch{}
 try{await page.goto('https://www.doubao.com/chat/',{waitUntil:'domcontentloaded'});found.push(...await observeVideoModels(page))}catch{}
 return [...new Set(found)]
}

/** Only verified adapters may own an automatic worker; account catalog entries alone do not enable one. */
export const PLATFORM_ADAPTERS={doubao:{
 home:'https://www.doubao.com/chat/',
 conversation: /^https:\/\/www\.doubao\.com\/chat\/\d+$/,
 discover:discoverDoubao,
 dismiss:dismissAnnouncements,
 blocker:sessionBlocker,
 image:doubaoImageAdapter,
 video:doubaoVideoAdapter,
}}
