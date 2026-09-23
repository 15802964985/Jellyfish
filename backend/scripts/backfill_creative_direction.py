"""运行：python scripts/backfill_creative_direction.py --output <报告.json> [--apply]；默认只读。"""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.core.db import async_session_maker, engine
from app.services.studio.creative_migration import backfill_directions, rollback_backfill

async def main():
    """同一事务补值；提交前先成功写出完整报告，任何异常回滚数据库。"""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--output',required=True)
    parser.add_argument('--batch-id',default='creative-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    parser.add_argument('--rollback-batch')
    args=parser.parse_args()
    async with async_session_maker() as db:
        if args.rollback_batch:
            if not args.apply: raise ValueError('回滚须显式--apply并指定精确批次')
            report={'rollback_batch':args.rollback_batch,'removed':await rollback_backfill(db,batch_id=args.rollback_batch)}
        else: report=await backfill_directions(db,batch_id=args.batch_id,apply=args.apply)
        output=Path(args.output).resolve()
        if output.exists(): raise ValueError('报告文件已存在，请使用新的精确路径，避免覆盖迁移依据')
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        if args.apply: await db.commit()
        else: await db.rollback()
        print(json.dumps({'batch':args.batch_id,'applied':args.apply,'created':len(report.get('created',[])),
            'skipped':report.get('skipped',0),'needs_review':len(report.get('needs_review',[]))},ensure_ascii=False))

async def run():
    """退出前关闭连接池，避免MySQL连接在事件循环关闭后释放。"""
    try: await main()
    finally: await engine.dispose()

if __name__=='__main__': asyncio.run(run())
