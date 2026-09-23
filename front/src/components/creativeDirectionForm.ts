import type { CreativeFields } from '../services/generated'
/** 所有入口共用字段释义，明确用途和可填写的具体事实。 */
export const creativeHelp: Record<string,{help:string;example:string}>={
 era:{help:'故事发生的时间背景，用于服装、建筑和道具判断；不确定可留空。',example:'例如：架空古代，参考唐代生活；无现代科技'},
 geography:{help:'故事所在地区及环境，影响建筑、植被与生活细节。',example:'例如：江南水乡，临河街巷与白墙黛瓦'},
 world_rules:{help:'只写剧情已有的特殊规则及边界，不在这里补写新剧情。',example:'例如：现代都市中修炼者隐居；普通人不知道法术存在'},
 art_constraints:{help:'写画面需要保持或避免的具体特征；这些文字会进入生成与预检。',example:'例如：青灰与暖金配色；古装场景不出现塑料制品和现代路灯'},
 secondary_genres:{help:'可选，补充主题材。混搭时说明时代或世界规则，避免背景被随意拼接。',example:'例如：玄幻修真为主，都市生活为辅'},
 narrative_tags:{help:'可选，描述叙事特点。按原剧本使用，不会仅凭标签自动增加穿越或重生情节。',example:'例如：成长、悬疑；只选剧情中确实存在的特点'},
}
/** 新建项目校验完整选择；可继承对象只校验主动填写的组合。 */
export function creativeFormError(value:CreativeFields={},required=false):string {
 if(required&&(!value.presentation||!value.treatment||!value.primary_genre))return '请选择画面表现和故事主题材'
 if((value.presentation||value.treatment)&&(!value.presentation||!value.treatment))return '请完整选择画面表现，或恢复继承'
 if(value.primary_genre&&value.secondary_genres?.includes(value.primary_genre))return '辅助题材不能重复主题材'
 if(value.secondary_genres?.length&&!value.primary_genre)return '选择辅助题材前，请先确定主题材'
 if(value.secondary_genres?.length&&!value.world_rules?.trim())return '混合题材需填写融合说明：在哪个背景中，辅助题材怎样服务主要故事'
 if((value.secondary_genres?.length||0)>4)return '辅助题材最多选择4项'
 if((value.narrative_tags?.length||0)>10)return '叙事标签最多10项'
 for(const items of [value.secondary_genres,value.narrative_tags])if(items&&(items.some(x=>!x.trim())||new Set(items.map(x=>x.trim())).size!==items.length))return '多选项不能重复或为空'
 if(value.narrative_tags?.some(x=>x.trim().length>40))return '每个叙事标签最多40字'
 return ''
}
