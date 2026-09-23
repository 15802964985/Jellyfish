"""造型版本API，只处理输入和事务，业务规则在service。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_db
from app.schemas.common import ApiResponse, success_response
from app.core.contracts.character_appearances import AppearanceCreate, AppearanceRead, AppearanceSelection
from app.services.studio.character_appearances import list_appearances,create_appearance,select_appearance
router=APIRouter()

@router.get('/characters/{character_id}',response_model=ApiResponse[list[AppearanceRead]])
async def get_appearances(character_id:str,db:AsyncSession=Depends(get_db)):
    """读取同角色造型版本。"""
    return success_response(await list_appearances(db,character_id))

@router.post('/characters/{character_id}',response_model=ApiResponse[AppearanceRead])
async def post_appearance(character_id:str,body:AppearanceCreate,db:AsyncSession=Depends(get_db)):
    """保存新版本，不改写旧图或角色。"""
    result=await create_appearance(db,character_id,body);await db.commit();return success_response(result)

@router.put('/shots/{shot_id}/characters/{character_id}',response_model=ApiResponse[dict])
async def put_appearance(shot_id:str,character_id:str,body:AppearanceSelection,db:AsyncSession=Depends(get_db)):
    """更新本镜头选用版本。"""
    result=await select_appearance(db,shot_id,character_id,body);await db.commit();return success_response(result)
