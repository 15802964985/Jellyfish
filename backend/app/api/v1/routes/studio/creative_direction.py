"""创作设定API：对象校验与状态解析委托业务服务。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.schemas.common import ApiResponse, success_response
from app.core.contracts.creative_direction import CreativeScope, CreativeRead, CreativeWrite, CreativeCatalog, TREATMENTS, GENRES, TAGS, FIELD_LABELS
from app.services.studio.creative_direction import read_direction, write_direction, compile_direction
from app.core.contracts.creative_direction import CreativePromptInput, CreativePromptRead
router=APIRouter()

@router.get('/catalog',response_model=ApiResponse[CreativeCatalog])
async def get_creative_catalog():
    """返回互相独立的分类与可编辑快捷组合。"""
    return success_response(CreativeCatalog(treatments=TREATMENTS,genres=GENRES,narrative_tags=TAGS,field_labels=FIELD_LABELS,
        presets={'3D修真':{'presentation':'动漫','treatment':'3D国漫','primary_genre':'玄幻修真'},
        '水墨武侠':{'presentation':'动漫','treatment':'水墨动画','primary_genre':'武侠江湖'},
        '年代重生':{'presentation':'真人写实','treatment':'复古胶片','primary_genre':'年代生活','narrative_tags':['重生']},
        '穿越古代':{'primary_genre':'古装历史','narrative_tags':['穿越']}}))

from app.core.contracts.creative_direction import TemplateContextInput, TemplateContextRead, CreativeContextOption
from app.services.studio.template_context import context_options, preview_template_context

@router.get('/context-options/{scope}',response_model=ApiResponse[list[CreativeContextOption]])
async def get_context_options(scope: CreativeScope, q: str = '', db: AsyncSession=Depends(get_db)):
    """免费查询试渲染业务对象。"""
    return success_response(await context_options(db,scope,q))

@router.post('/template-preview',response_model=ApiResponse[TemplateContextRead])
async def preview_template(body: TemplateContextInput,db: AsyncSession=Depends(get_db)):
    """不创建任务的模板上下文试渲染。"""
    return success_response(await preview_template_context(db,body))

@router.get('/{scope}/{entity_id}',response_model=ApiResponse[CreativeRead])
async def get_creative_direction(scope: CreativeScope, entity_id: str, db: AsyncSession=Depends(get_db)):
    """只读解析本层覆盖和实际生效来源。"""
    return success_response(await read_direction(db,scope,entity_id))

@router.put('/{scope}/{entity_id}',response_model=ApiResponse[CreativeRead])
async def put_creative_direction(scope: CreativeScope, entity_id: str, body: CreativeWrite, db: AsyncSession=Depends(get_db)):
    """按预期版本保存，失败由事务回滚，不触发收费生成。"""
    result=await write_direction(db,scope,entity_id,body)
    await db.commit()
    return success_response(result)


@router.post('/{scope}/{entity_id}/preview',response_model=ApiResponse[CreativePromptRead])
async def preview_creative_prompt(scope: CreativeScope, entity_id: str, body: CreativePromptInput, db: AsyncSession=Depends(get_db)):
    """与生成门禁共用编译器，预览不触发付费操作。"""
    direction=await read_direction(db,scope,entity_id)
    return success_response(CreativePromptRead(prompt=compile_direction(body.prompt,direction,body.purpose,refresh=True) or '',direction=direction))
