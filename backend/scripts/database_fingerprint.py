"""Read table contents for before/after migration integrity; never expose row values."""
import asyncio
import hashlib
import json
from sqlalchemy import text
from app.core.db import async_session_maker, close_db


async def fingerprint():
    """Hash canonical sorted rows in every table under a read-only consistent transaction."""
    async with async_session_maker() as db:
        await db.execute(text('SET TRANSACTION READ ONLY'))
        names = (await db.execute(text('SHOW TABLES'))).scalars().all()
        result = {}
        for name in sorted(names):
            rows = (await db.execute(text('SELECT * FROM `' + name.replace('`', '``') + '`'))).all()
            encoded = sorted(json.dumps(list(row), default=str, ensure_ascii=False, separators=(',', ':')) for row in rows)
            result[name] = {'count': len(rows), 'sha256': hashlib.sha256('\n'.join(encoded).encode()).hexdigest()}
        print(json.dumps(result, sort_keys=True))
    await close_db()


if __name__ == '__main__':
    asyncio.run(fingerprint())
