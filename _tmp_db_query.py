import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
async def go():
    e = create_async_engine(os.environ['DATABASE_URL'])
    async with e.begin() as c:
        r = await c.execute(text("SELECT id, status, payload->>'$.web_stage' as stage, payload->>'$.runner_paused' as paused, cancel_requested, finished_at FROM generation_tasks WHERE id='7a7842b110c1532592aa7fd3afaa9b56'"))
        for row in r:
            print(row)
asyncio.run(go())