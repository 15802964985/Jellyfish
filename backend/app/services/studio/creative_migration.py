"""旧创作数据的证据化补值：只写新设定，不改剧本、角色或历史生成事实。"""
import json
import re
from hashlib import sha256
from sqlalchemy import select
from app.models.creative_direction import CreativeDirection, CreativeDirectionRevision
from app.core.contracts.creative_direction import CreativeFields, CreativeWrite, GENRES, TAGS
from app.services.studio.creative_direction import MODELS, legacy_fields, write_direction

SOURCE_FIELDS = ('description','summary','raw_text','script_excerpt')

def propose_direction(scope, obj):
    """精确旧值映射及显式元数据声明；正文关键词只列待核对，不冒充事实。"""
    fields=legacy_fields(obj) if scope in ('project','actor','character','scene','prop','costume') else {}
    pieces=[str(getattr(obj,key,'') or '') for key in SOURCE_FIELDS]
    text='\n'.join(pieces)
    evidence=[]
    declarations={'时代':'era','地域':'geography','世界规则':'world_rules','美术约束':'art_constraints','题材':'primary_genre'}
    for label,key in declarations.items():
        matches=re.findall(r'(?m)^\s*(?:【'+label+r'】|'+label+r'[：:])\s*([^\n]+)',text)
        unique=list(dict.fromkeys(value.strip() for value in matches if value.strip()))
        if len(unique)!=1: continue
        value=unique[0]
        if key=='primary_genre' and value not in GENRES: continue
        if len(value) > (200 if key in ('era','geography') else 3000): continue
        fields[key]=value
        evidence.append({'field':key,'excerpt':label+'：'+value})
    labels=re.findall(r'(?m)^\s*(?:【叙事标签】|叙事标签[：:])\s*([^\n]+)',text)
    if len(labels)==1:
        values=[v.strip() for v in re.split('[、,，]',labels[0]) if v.strip()]
        if values and len(values)<=10 and all(len(v)<=40 for v in values):
            fields['narrative_tags']=values;evidence.append({'field':'narrative_tags','excerpt':labels[0]})
    hints=[tag for tag in ('穿越','重生','修真','仙侠','年代','悬疑') if tag in text]
    CreativeFields.model_validate(fields)
    return fields, {'method':'legacy_exact_and_explicit_text','source_sha256':sha256(text.encode()).hexdigest(),
        'legacy_style':str(getattr(obj,'style','') or ''),'legacy_visual_style':str(getattr(obj,'visual_style','') or ''),
        'evidence':evidence,'needs_review':hints if not evidence else [],
        'notice':'正文关键词未自动转换为设定；未确定的字段继续继承或留空。'}

async def backfill_directions(db, *, batch_id: str, apply: bool=False):
    """全量枚举现存业务对象；已有设定跳过，事务中幂等创建版本1。"""
    report={'batch_id':batch_id,'applied':apply,'created':[],'skipped':0,'needs_review':[]}
    existing={(row.scope,row.entity_id) for row in (await db.execute(select(CreativeDirection))).scalars().all()}
    for scope,model in MODELS.items():
        rows=(await db.execute(select(model).order_by(model.id))).scalars().all()
        for obj in rows:
            if (scope,obj.id) in existing: report['skipped']+=1;continue
            fields,provenance=propose_direction(scope,obj)
            provenance['batch_id']=batch_id
            report['created'].append({'scope':scope,'entity_id':obj.id,'overrides':fields,'provenance':provenance})
            if provenance['needs_review']: report['needs_review'].append({'scope':scope,'entity_id':obj.id,'hints':provenance['needs_review']})
            if apply:
                await write_direction(db,scope,obj.id,CreativeWrite(expected_revision=0,overrides=CreativeFields.model_validate(fields)),provenance=provenance)
    return report

async def rollback_backfill(db, *, batch_id: str):
    """只回滚该批未被后续编辑的设定，拒绝覆盖用户修改，原业务数据始终不动。"""
    rows=(await db.execute(select(CreativeDirection).with_for_update())).scalars().all()
    selected=[row for row in rows if row.data.get('provenance',{}).get('batch_id')==batch_id]
    histories=(await db.execute(select(CreativeDirectionRevision))).scalars().all()
    batch_keys={(row.scope,row.entity_id) for row in histories if row.data.get('provenance',{}).get('batch_id')==batch_id}
    if any(row.revision!=1 or (row.scope,row.entity_id) not in {(r.scope,r.entity_id) for r in selected} for row in rows if (row.scope,row.entity_id) in batch_keys):
        raise ValueError('此批设定已有后续修改，拒绝自动回滚')
    for row in selected:
        history=await db.get(CreativeDirectionRevision,(row.scope,row.entity_id,1))
        if history: await db.delete(history)
        await db.delete(row)
    await db.flush()
    return len(selected)
