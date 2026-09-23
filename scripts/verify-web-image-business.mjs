/** One end-to-end test in a dedicated scene; receipts make rerunning setup idempotent. */
import {readFile,writeFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
const receiptPath='local-browser/business-image-test.json'
let saved
try{saved=JSON.parse(await readFile(receiptPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;saved={scene_id:randomUUID(),request_id:randomUUID()};await writeFile(receiptPath,JSON.stringify(saved,null,2))}
/** Keep platform submission behind the persisted Jellyfish task queue. */
async function api(path,body){const response=await fetch('http://127.0.0.1:8000/api/v1/studio'+path,{method:body?'POST':'GET',headers:body instanceof FormData?{}:{'content-type':'application/json'},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw new Error(JSON.stringify(data));return data}
if(!saved.scene){saved.scene=(await api('/entities/scene',{id:saved.scene_id,name:'网页通道验收·楼房参考图',description:'独立验收对象，不关联已有剧本和分镜；用于验证参考图、账号、任务与原图回填。'})).data;await writeFile(receiptPath,JSON.stringify(saved,null,2))}
if(!saved.slot){const existing=await api(`/entities/scene/${saved.scene_id}/images`);saved.slot=existing.data.items[0]||(await api(`/entities/scene/${saved.scene_id}/images`,{})).data;await writeFile(receiptPath,JSON.stringify(saved,null,2))}
if(!saved.reference){const form=new FormData();form.append('file',new Blob([await readFile('local-browser/building-reference.png')],{type:'image/png'}),'building-reference.png');saved.reference=(await api('/files/upload',form)).data;await writeFile(receiptPath,JSON.stringify(saved,null,2))}
if(!saved.task){const target=await api(`/web-generation/targets/scene/${saved.scene_id}/${saved.slot.id}`);saved.task=await api('/web-generation/images',{request_id:saved.request_id,account_id:null,platform:'doubao',requested_model:'Seedream 4.5',target_type:'scene',entity_id:saved.scene_id,slot_id:saved.slot.id,expected_version:target.version,prompt:'请根据上传的楼房示意图生成一张建筑插画。保留图中一栋米黄色楼房、三列蓝色窗户、底部棕色门的位置和基本轮廓，增加柔和阳光和简单绿地。只生成一张图片，不需要文字说明。',reference_file_ids:[saved.reference.id],external_transfer_confirmed:true});await writeFile(receiptPath,JSON.stringify(saved,null,2))}
console.log(JSON.stringify({scene_id:saved.scene_id,slot_id:saved.slot.id,task:saved.task}))