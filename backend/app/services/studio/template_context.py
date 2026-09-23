"""模板管理免费试渲染，复用业务模板引擎与创作设定编译器。"""
from sqlalchemy import select, cast, String
from fastapi import HTTPException
from langchain_core.prompts import PromptTemplate as LcPromptTemplate
from app.models.studio import Project, Chapter, Shot, Actor, Character, Scene, Prop, Costume, PromptTemplate
from app.services.studio.creative_direction import read_direction, compile_direction
from app.services.studio.image_tasks import render_prompt_template_content
from app.core.contracts.creative_direction import CreativeContextOption, TemplateContextRead
MODELS={'project':Project,'chapter':Chapter,'shot':Shot,'actor':Actor,'character':Character,'scene':Scene,'prop':Prop,'costume':Costume}

async def context_options(db, scope, q):
    """按名称查询有限对象列表；显示类型与短ID避免同名对象混淆。"""
    model=MODELS.get(scope)
    if model is None: return []
    name=getattr(model,'name',None)
    if name is None: name=model.title
    stmt=select(model.id,name).order_by(name,model.id).limit(50)
    if q: stmt=stmt.where(name.contains(q))
    return [CreativeContextOption(value=identifier,label=f'{name} · {identifier[:8]}') for identifier,name in (await db.execute(stmt)).all()]

async def preview_template_context(db, body):
    """加载当前业务事实后试填变量；缺失变量显式列出，不收费也不保存。"""
    template=await db.get(PromptTemplate,body.template_id)
    if not template: raise HTTPException(404,'模板不存在')
    direction=await read_direction(db,body.scope,body.entity_id)
    model=MODELS.get(body.scope)
    entity=await db.get(model,body.entity_id) if model else None
    variables=dict(template.variable_defaults or {})
    variables.update({k:str(v) for k,v in direction.effective.items() if v is not None})
    variables.update(visual_style=direction.effective.get('presentation') or '',style=direction.effective.get('treatment') or '')
    if entity:
        for field in ('name','title','description','script_excerpt','raw_text','condensed_text'):
            value=getattr(entity,field,None)
            if value is not None: variables[field]=str(value)
    category=str(getattr(template.category,'value',template.category))
    purpose='frame' if category.startswith('frame_') else 'video' if category=='video_prompt' else 'script' if category=='storyboard_prompt' else 'asset'
    if body.scope=='shot':
        from app.services.studio.shot_video_prompt_pack import build_shot_video_prompt_pack, _pack_variables
        pack=await build_shot_video_prompt_pack(db,shot_id=body.entity_id)
        variables.update({k:str(v) for k,v in _pack_variables(pack).items() if v is not None})
        variables.setdefault('prompt',getattr(entity,'script_excerpt','') or getattr(entity,'title',''))
    variables.update(body.variables)
    required=LcPromptTemplate.from_template(template.content,template_format='jinja2').input_variables
    missing=[key for key in required if not str(variables.get(key,'')).strip()]
    rendered=render_prompt_template_content(template.content,variables=variables)
    return TemplateContextRead(prompt=compile_direction(rendered,direction,purpose,refresh=True) or '', direction=direction,
        template_version=template.version,variables=variables,missing=missing)
