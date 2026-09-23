"""统一创作设定解析、逐字段继承、版本保存和用途编译。"""
import json
from hashlib import sha256
from fastapi import HTTPException
from sqlalchemy import select
from app.core.contracts.creative_direction import CreativeRead, CreativeWrite, CreativeFields, TREATMENTS, FIELD_LABELS
from app.models.creative_direction import CreativeDirection, CreativeDirectionRevision
from app.models.studio import Project, Chapter, Shot, Actor, Character, Scene, Prop, Costume, FileItem
from app.models.experiment_sessions import ExperimentSession

MODELS = {'project': Project, 'chapter': Chapter, 'shot': Shot, 'actor': Actor, 'character': Character,
          'scene': Scene, 'prop': Prop, 'costume': Costume, 'lab': ExperimentSession}

def legacy_fields(obj) -> dict:
    """精确转换旧值；3D不猜国漫，未知旧值保留来源待核对。"""
    raw = getattr(obj, 'style', '')
    style = getattr(raw, 'value', raw)
    visual = getattr(obj, 'visual_style', '')
    visual = getattr(visual, 'value', visual)
    out = {'presentation': '动漫' if visual == '动漫' else '真人写实'} if visual else {}
    mapping = {'真人都市': ('影视写实','都市生活'), '真人科幻': ('影视写实','科幻未来'),
        '真人古装': ('影视写实','古装历史'), '动漫科幻': (None,'科幻未来'),
        '动漫3D': ('3D动画',None), '国漫': (None,None), '水墨画': ('水墨动画',None),
        '真人玄幻修真': ('影视写实','玄幻修真'), '真人仙侠': ('影视写实','仙侠'),
        '动漫玄幻修真': (None,'玄幻修真'), '动漫仙侠': (None,'仙侠'),
        '动漫古装': (None,'古装历史'), '动漫武侠': (None,'武侠江湖'),
        '动漫国风神话': (None,'东方神话'), '动漫末世科幻': (None,'末世生存')}
    if style in mapping:
        treatment, genre = mapping[style]
        if treatment: out['treatment'] = treatment
        if genre: out['primary_genre'] = genre
    if style in ('真人穿越','动漫穿越'): out['narrative_tags'] = ['穿越']
    return out

async def owner(db, scope: str, entity_id: str, *, lock=False):
    """校验范围中的对象存在；不允许以任意ID存入孤立设定。"""
    if scope == 'global':
        if entity_id != 'system': raise HTTPException(422, '全局设定ID必须为system')
        return None
    model = MODELS.get(scope)
    if model is None: raise HTTPException(422, '未知创作设定范围')
    row = (await db.execute(select(model).where(model.id == entity_id).with_for_update())).scalar_one_or_none() if lock else await db.get(model, entity_id)
    if row is None: raise HTTPException(404, '创作设定所属对象不存在')
    return row

def merge_layers(layers):
    """逐字段覆盖并保留来源；null是显式清空，父级表示形式变化不静默挪用旧画风。"""
    effective, sources, warnings = {}, {}, []
    for scope, entity_id, revision, fields in layers:
        before = effective.get('presentation')
        effective.update(fields)
        for key in fields: sources[key] = {'scope':scope,'entity_id':entity_id,'revision':revision}
        if 'presentation' in fields and before != fields['presentation'] and 'treatment' not in fields:
            treatment = effective.get('treatment')
            if treatment and treatment not in TREATMENTS.get(effective.get('presentation'), []):
                effective['treatment'] = None
                sources['treatment'] = {'scope':scope,'entity_id':entity_id,'revision':revision}
                warnings.append('表现形式已改变，原画面风格不适用，请选择本层画面风格。')
    if effective.get('treatment') and effective['treatment'] not in TREATMENTS.get(effective.get('presentation'), []):
        warnings.append('画面风格与继承的表现形式冲突，请修正后生成。')
    if effective.get('primary_genre') in (effective.get('secondary_genres') or []):
        warnings.append('辅助题材重复主题材，请删除重复项。')
    if effective.get('secondary_genres') and not (effective.get('era') or effective.get('world_rules')):
        warnings.append('已选择混合题材；建议说明时代或世界规则中的融合方式，避免模型自行拼接不同背景。')
    return effective, sources, warnings

async def read_direction(db, scope: str, entity_id: str) -> CreativeRead:
    """解析global→project→chapter→shot；资产独立，实验室仅显式关联项目。"""
    obj = await owner(db, scope, entity_id)
    row = await db.get(CreativeDirection, (scope,entity_id))
    data = row.data if row else {}
    chain = [('global','system',None)]
    project_id = None
    if scope == 'shot':
        chapter = await owner(db,'chapter',obj.chapter_id)
        project_id = chapter.project_id
        chain += [('project',project_id,await owner(db,'project',project_id)),('chapter',chapter.id,chapter)]
    elif scope in ('chapter','character'):
        project_id = obj.project_id
        if project_id: chain += [('project',project_id,await owner(db,'project',project_id))]
    elif scope == 'lab' and data.get('project_id'):
        project_id = data['project_id']
        chain += [('project',project_id,await owner(db,'project',project_id))]
    elif scope == 'project': project_id = entity_id
    if scope != 'global': chain.append((scope,entity_id,obj))
    layers = []
    for layer_scope, layer_id, layer_obj in chain:
        record = row if (layer_scope,layer_id)==(scope,entity_id) else await db.get(CreativeDirection,(layer_scope,layer_id))
        if record:
            fields = record.data.get('overrides',{})
        else:
            fields = legacy_fields(layer_obj) if layer_obj and layer_scope in ('project','actor','character','scene','prop','costume') else {}
        layers.append((layer_scope,layer_id,record.revision if record else 0,fields))
    effective,sources,warnings = merge_layers(layers)
    appearances = {}
    if scope == 'shot':
        from app.services.studio.character_appearances import appearance_context
        appearances = await appearance_context(db, entity_id)
    fingerprint = sha256(json.dumps({'effective':effective,'sources':sources,'appearances':appearances},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return CreativeRead(scope=scope,entity_id=entity_id,revision=row.revision if row else 0,
        overrides=data.get('overrides',legacy_fields(obj) if obj and scope in ('project','actor','character','scene','prop','costume') else {}),
        inherited=merge_layers(layers[:-1])[0],effective=effective,sources=sources,fingerprint=fingerprint,
        appearances=appearances,warnings=warnings,provenance=data.get('provenance',{}),project_id=project_id)

async def write_direction(db, scope: str, entity_id: str, body: CreativeWrite, *, provenance=None):
    """串行保存本对象设定并记录不可变修订；版本冲突返回409。"""
    await owner(db,scope,entity_id,lock=True)
    row = (await db.execute(select(CreativeDirection).where(CreativeDirection.scope==scope,
        CreativeDirection.entity_id==entity_id).with_for_update())).scalar_one_or_none()
    revision = row.revision if row else 0
    if revision != body.expected_revision: raise HTTPException(409,'创作设定已被其他页面修改，请刷新后重试')
    fields = body.overrides.model_dump(exclude_unset=True)
    if scope=='global' and set(fields)-{'general_rules'}: raise HTTPException(422,'全局仅设置通用质量规则，不能强制所有项目题材')
    if body.project_id:
        if scope != 'lab': raise HTTPException(422,'只有实验室可显式关联项目')
        await owner(db,'project',body.project_id)
    for fid in fields.get('reference_file_ids') or []:
        file = await db.get(FileItem, fid)
        if file is None: raise HTTPException(422, '设定参考文件不存在')
        if str(getattr(file.type, 'value', file.type)) != 'image': raise HTTPException(422, '设定参考只支持图片，请选择图片文件')
    data = {'overrides':fields,'project_id':body.project_id,'provenance':provenance or {'method':'user'}}
    if row is None:
        row=CreativeDirection(scope=scope,entity_id=entity_id,revision=1,data=data);db.add(row)
    else: row.revision=revision+1;row.data=data
    db.add(CreativeDirectionRevision(scope=scope,entity_id=entity_id,revision=revision+1,data=data))
    await db.flush()
    result=await read_direction(db,scope,entity_id)
    if provenance is None and result.effective.get('secondary_genres'):
        if not result.effective.get('primary_genre'): raise HTTPException(422,'选择辅助题材前，请先确定主题材')
        if not (result.effective.get('world_rules') or '').strip(): raise HTTPException(422,'混合题材必须填写世界规则，说明统一背景与主辅题材的融合方式')
    if result.effective.get('primary_genre') in (result.effective.get('secondary_genres') or []): raise HTTPException(422,'辅助题材不能重复继承后的主题材')
    if provenance is None and scope!='global' and any(key in fields for key in ('presentation','treatment')) and not all(result.effective.get(key) for key in ('presentation','treatment')):
        raise HTTPException(422,'请完整选择表现形式和画面风格，或恢复继承')
    if scope=='project' and 'primary_genre' in fields and not result.effective.get('primary_genre'): raise HTTPException(422,'项目主题材不能为空')
    if any('冲突' in message for message in result.warnings): raise HTTPException(422,'画面风格与继承的表现形式冲突')
    return result

def direction_prompt(direction: CreativeRead, purpose: str) -> str:
    """按用途编译明确创作事实，不补造剧情，不把设定参考冒充实际送图。"""
    lines=[]
    for key,value in direction.effective.items():
        if value is None or value=='' or value==[] or key=='reference_file_ids': continue
        lines.append(f'{FIELD_LABELS[key]}：'+('、'.join(value) if isinstance(value,list) else str(value)))
    for character_id, appearance in direction.appearances.items():
        fields = {key:value for key,value in appearance.get('creative_direction',{}).items() if key!='general_rules' and key!='reference_file_ids'}
        lines.append('本镜头角色造型（同一角色身份不变，服装以此版本为准）：'+json.dumps({'character_id':character_id,'version':appearance['version'],'name':appearance['name'],'description':appearance.get('description'),'costume':appearance.get('costume_name'),'costume_description':appearance.get('costume_description'),'direction':fields},ensure_ascii=False))
    if not lines: return ''
    if direction.effective.get('secondary_genres'):
        lines.append('混合题材以主题材为主，辅助题材仅按世界规则补充；核对时代、科技与超自然规则是否矛盾，不自行拼接背景。融合说明是待核对依据，不自动证明无冲突。')
    if purpose=='asset':
        lines.append('资产基准图以清晰身份、轮廓、材质和服装为主；三视图保持同一人物，避免氛围光遮挡五官。胶片等后期质感不得破坏辨识。')
    elif purpose=='frame': lines.append('单帧只表现当前构图与瞬间状态，不将穿越等叙事标签自行演成额外剧情。')
    elif purpose=='video': lines.append('保持镜头内人物、服装与空间连续；时代或造型变化仅按当前剧本明确要求表现。')
    else: lines.append('设定为上下文；尊重原文，不因题材/标签新增角色、穿越事件或修炼境界。')
    lines.append('如用户本次要求与上述设定冲突，需明确核对；不能以风格标签替代实际参考图或改变已确认剧情。')
    return '【创作设定】\n'+'\n'.join(lines)


async def direction_for_target(db, target):
    """从已校验生成目标解析设定归属，禁止使用当前页面的其他对象。"""
    kind = target.kind.value
    if kind in ('shot_video','shot_video_edit','shot_frame_slot','shot_detail'):
        return await read_direction(db,'shot',target.entity_id)
    if kind == 'experiment_session': return await read_direction(db,'lab',target.entity_id)
    if kind == 'asset_image_slot':
        from app.models.studio_asset_images import ActorImage, CharacterImage, SceneImage, PropImage, CostumeImage
        for model,scope in [(ActorImage,'actor'),(CharacterImage,'character'),(SceneImage,'scene'),(PropImage,'prop'),(CostumeImage,'costume')]:
            slot=await db.get(model,int(target.slot_id))
            if slot is not None and getattr(slot,scope+'_id')==target.entity_id:
                return await read_direction(db,scope,target.entity_id)
    return None

def compile_direction(prompt: str | None, direction: CreativeRead | None, purpose: str, *, refresh: bool = False) -> str | None:
    """校验用户文本与设定冲突，复用完整同版本区块；刷新只替换系统生成区。"""
    if direction is None: return prompt
    if direction.effective.get('secondary_genres'):
        if not direction.effective.get('primary_genre') or direction.effective.get('primary_genre') in direction.effective['secondary_genres']:
            raise HTTPException(422,'请修正创作设定：先选择主题材，辅助题材不能重复主题材')
        if not (direction.effective.get('world_rules') or '').strip():
            raise HTTPException(422,'请先完善创作设定中的混合题材说明（世界规则），再预览和生成')
    import re
    original = prompt or ''
    pattern = r'【创作设定版本:[^】]+】.*?【结束创作设定】'
    blocks = re.findall(pattern, original, flags=re.S)
    user_text = re.sub(pattern, '', original, flags=re.S).strip()
    if '【创作设定版本:' in user_text:
        raise HTTPException(422, '创作设定区不完整，请重新获取提示词预览')
    text = direction_prompt(direction, purpose)
    expected = f'【创作设定版本:{direction.fingerprint}:{purpose}】\n{text}\n【结束创作设定】' if text else ''
    # 即使已有系统区块，也要检查区块外用户新写的显式设定，避免绕过冲突校验。
    for key in ('presentation', 'treatment', 'primary_genre', 'era'):
        configured = direction.effective.get(key)
        if not configured: continue
        declarations = re.findall(r'(?m)^\s*'+re.escape(FIELD_LABELS[key])+r'[：:]\s*([^\n]+)', user_text)
        if any(value.strip() != configured for value in declarations):
            raise HTTPException(422, f'{FIELD_LABELS[key]}与本次提示词显式声明不一致，请修改本层覆盖或提示词后预览')
    if blocks and not refresh:
        if blocks != [expected]:
            raise HTTPException(409, '创作设定已变化或设定区被改动，请重新预览；需要特例请修改本层创作设定')
        return prompt
    return (user_text + ('\n\n' + expected if expected else '')).strip()


async def delete_owned_directions(db, obj):
    """随业务对象删除本层及级联子对象的设定，避免孤立配置被新对象复用。"""
    from sqlalchemy import delete
    scope = next((key for key, model in MODELS.items() if isinstance(obj, model)), None)
    if scope is None: return
    targets = [(scope, [obj.id])]
    if scope == 'project':
        chapter_ids = list((await db.execute(select(Chapter.id).where(Chapter.project_id == obj.id))).scalars())
        character_ids = list((await db.execute(select(Character.id).where(Character.project_id == obj.id))).scalars())
        targets.extend([('chapter', chapter_ids), ('character', character_ids)])
    elif scope == 'chapter': chapter_ids = [obj.id]
    else: chapter_ids = []
    if chapter_ids:
        shot_ids = list((await db.execute(select(Shot.id).where(Shot.chapter_id.in_(chapter_ids)))).scalars())
        targets.append(('shot', shot_ids))
    for target_scope, ids in targets:
        if not ids: continue
        for model in (CreativeDirectionRevision, CreativeDirection):
            await db.execute(delete(model).where(model.scope == target_scope, model.entity_id.in_(ids)))
