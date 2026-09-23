"""Web products are separate from API providers; capabilities require channel-specific proof."""
from typing import Literal
WebPlatform = Literal['doubao','jimeng','kling','wanxiang','yuanbao','hailuo','zhipu']

# Official product entries audited 2026-09-13; some documentation remains unreadable.
WEB_PLATFORMS = {
    'doubao': {'name':'豆包','url':'https://www.doubao.com/chat/','status':'image_candidate'},
    'jimeng': {'name':'即梦AI','url':'https://jimeng.jianying.com/','status':'manual_or_official_api'},
    'kling': {'name':'可灵AI','url':'https://app.klingai.com/cn/','status':'awaiting_browser_validation'},
    'wanxiang': {'name':'通义万相','url':'https://tongyi.aliyun.com/wan/','status':'awaiting_browser_validation'},
    'yuanbao': {'name':'腾讯元宝','url':'https://yuanbao.tencent.com/','status':'capabilities_unverified'},
    'hailuo': {'name':'海螺AI','url':'https://hailuoai.com/','status':'capabilities_unverified'},
    'zhipu': {'name':'智谱清言','url':'https://chatglm.cn/','status':'capabilities_unverified'},
}

# These are website-visible names, never API IDs. Public examples do not prove current account access.
WEB_MODEL_EVIDENCE = {
    'doubao': {'image': [{'name':'Seedream 4.5','source':'local_browser_observed','note':'2026-09-14 本机网页原图下载与场景回填通过；其他账号权益需另核对'}]},
    'jimeng': {
        'image': [{'name':'图片 3.0','source':'official_example','note':'官网作品中显示；当前账号是否可选需核对','url':'https://jimeng.jianying.com/ai-tool/work-detail/7606423614228827419?itemType=9&workDetailType=Image'}],
        'video': [{'name':'即梦 Seedance 1.0 Fast','source':'official_example','note':'官网作品中显示；不代表当前全部型号','url':'https://jimeng.jianying.com/ai-tool/work-detail/7635546191341686026?itemType=53&workDetailType=AiVideo'}],
    },
}
