import test from 'node:test'
import assert from 'node:assert/strict'
import {promptMatches} from './doubao-messages.mjs'
import {confirmationMatches} from './doubao-video.mjs'

test('presentation normalization retains business meaning and rejects arbitrary surrounding text',()=>{
 assert.ok(promptMatches('生成图片：生成内容\n妈妈穿**蓝色**衣服','## 生成内容\n妈妈穿蓝色衣服'))
 for(const text of ['不要妈妈穿蓝色衣服','妈妈穿红色衣服','妈妈穿蓝色衣服并换背景'])assert.equal(promptMatches(text,'妈妈穿蓝色衣服'),false)
 assert.equal(promptMatches('a b','a > b'),false)
 assert.equal(promptMatches('14秒','4秒'),false)
})
test('strips trailing parameter suffixes (aspect/duration/model) so user-typed messages still bind',()=>{
 // 用户经常在 prompt 末尾追加参数说明：执行器应剥离后再匹配业务提示词。
 assert.ok(promptMatches('生成视频：生成一个4秒日落视频，16:9，4s','生成一个4秒日落视频'))
 assert.ok(promptMatches('生成视频：生成一个4秒的日出视频，16:9','生成一个4秒的日出视频'))
 assert.ok(promptMatches('生成视频：生成一个4秒日落视频，4秒','生成一个4秒日落视频'))
 assert.ok(promptMatches('生成视频：生成一个4秒日落视频，16:9，4s，Seedance 2.0 Mini','生成一个4秒日落视频'))
 // 拒绝路径不变：内容篡改、否定词、prompt 中混入不被接受的子串仍不被允许。
 for(const text of [
  '生成视频：不要生成4秒日出视频，16:9，4s',
  '生成视频：生成一个4秒日落视频但加滤镜，16:9，4s',
  '别的文字，生成一个4秒日落视频，16:9，4s',
 ])assert.equal(promptMatches(text,'生成一个4秒日落视频'),false)
 // promptMatches 只负责文本一致；aspect / duration / model 数值差异由
 // confirmationMatches 在 prepare / waitVideo 阶段独立校验（见下行 assertion）。
 const req={requested_model:'Seedance 2.0 Mini',aspect_ratio:'16:9',duration_seconds:4}
 assert.equal(promptMatches('生成视频：生成一个4秒日落视频，16:9，14s','生成一个4秒日落视频'),true)
 assert.equal(confirmationMatches('Seedance 2.0 Mini 16:9 14秒',req),false)
})
test('confirmation requires all exact specifications and accepts display formatting only',()=>{
 const request={requested_model:'Seedance 2.0 Mini',aspect_ratio:'1:1',duration_seconds:4}
 assert.ok(confirmationMatches('Seedance 2.0 Mini 1 ： 1 4 秒',request))
 for(const text of ['Seedance 2.0 Mini 1:1 14秒','Seedance 2.0 Mini 16:9 4s','Seedance 2.0 Mini 1:1','Seedance 2.0 Fast 1:1 4秒'])assert.equal(confirmationMatches(text,request),false)
})
