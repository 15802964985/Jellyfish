"""补齐旧版手动新建分镜遗漏的详情；默认只读检查，--apply才提交事务。"""
from __future__ import annotations
import argparse
import asyncio
import json
from sqlalchemy import select
from app.core.db import async_session_maker, engine
from app.models.studio import Shot, ShotDetail
from app.services.studio.shot_details import repair_missing_shot_details


async def main(apply: bool) -> None:
    """显示精确缺失ID或事务性补齐；保留全部现有详情与主记录。"""
    try:
        async with async_session_maker() as db:
            if apply:
                ids = await repair_missing_shot_details(db)
                await db.commit()
            else:
                ids = list((await db.execute(select(Shot.id).outerjoin(ShotDetail, ShotDetail.id == Shot.id)
                                            .where(ShotDetail.id.is_(None)).order_by(Shot.id))).scalars())
            print(json.dumps({"applied": apply, "shot_ids": ids}, ensure_ascii=False))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="提交仅缺失详情的补齐事务")
    asyncio.run(main(parser.parse_args().apply))
