import { Alert, Typography } from 'antd'

const setups: Record<string, { title: string; steps: string; url: string }> = {
  minimax: {
    title: 'MiniMax / 海螺：先确认中国站与独立 API 额度',
    steps: '中国站常用 Base URL：https://api.minimax.cn/v1；已有国际账户保留其端点，不自动替换。海螺网页积分不等于 API 余额。图片当前开放文生图；视频 768P、6/10 秒，Fast 必须首帧，Hailuo-02 支持双帧。配音模型另配置 audio_endpoint（完整 /v1/t2a_v2）和 voice；不提供声音克隆。',
    url: 'https://platform.minimaxi.com/docs/api-reference/api-overview',
  },
  zhipu: {
    title: '智谱 BigModel：使用开放平台 API，不能混用 Coding Plan 地址',
    steps: 'Base URL：https://open.bigmodel.cn/api/paas/v4。先开通所选 GLM、CogView/GLM-Image、CogVideoX 的 API 权限并核对价格。当前图像仅文生图，不能传入参考素材；视频支持5/10秒及首尾帧。关闭水印另需厂商授权，不自动购买或承诺免费。',
    url: 'https://docs.bigmodel.cn/api-reference/模型-api/对话补全',
  },
  hunyuan: {
    title: '腾讯混元：本适配器使用 TokenHub 中国站',
    steps: '开通 TokenHub 并创建 API Key；Base URL：https://tokenhub.tencentmaas.com/v1。不是旧混元资源包或网页会员。hy-image-v3 最多3张参考图、单张输出；hy-video-v1.5 为5秒720p，图生只接受首帧，画幅遵循首帧。先在控制台确认模型授权、API 额度及是否开启后付费。',
    url: 'https://cloud.tencent.com/document/product/1823/130078',
  },
  jimeng: {
    title: '即梦：独立视觉 API，AK/SK 签名，不使用方舟套餐密钥',
    steps: '在火山视觉服务开通接口，使用最小权限 AK（API Key）与 SK（API Secret）。Base URL：https://visual.volcengineapi.com。图片4.0当前为2K单图文生；本地参考图公网导出尚未开放。视频3.0为720p首尾双帧、5/10秒，两帧都必须提供。网页积分/会员与此 API 独立计费。',
    url: 'https://www.volcengine.com/docs/85621/1863351',
  },
}

/** Account setup instructions appear at the decision point, without changing or purchasing anything. */
export default function DomesticProviderSetup({ providerKey }: { providerKey?: string }) {
  const setup = providerKey ? setups[providerKey] : undefined
  if (!setup) return null
  return <Alert type="info" showIcon className="mb-4" message={setup.title}
    description={<><Typography.Paragraph>{setup.steps}</Typography.Paragraph>
      <a href={setup.url} target="_blank" rel="noopener noreferrer">官方接入与开通说明</a>
      <div>本地代码及模拟测试不代表真实账户验收；首次生成可能收费，请先确认额度与价格。</div></>} />
}
