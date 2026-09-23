"""Read deployment health without printing credentials or changing business state."""
import json
import subprocess


def docker(*args, source=None):
    """Capture Docker output; failed diagnostics do not expose container environment values."""
    result = subprocess.run(['docker', *args], input=source, capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError('Docker diagnostic failed: ' + result.stderr[-800:])
    return result.stdout


if __name__ == '__main__':
    rows = json.loads(docker('inspect', 'jellyfish-backend-1', 'jellyfish-redis-1'))
    environments = [{item.split('=', 1)[0]: item.split('=', 1)[1] for item in row['Config']['Env']} for row in rows]
    print(json.dumps({'backend_image': rows[0]['Image'], 'redis_requires_password': '--requirepass' in rows[1]['Config']['Cmd'],
                     'client_password_configured': bool(environments[0].get('REDIS_PASSWORD'))}))
    print(docker('exec', '-i', 'jellyfish-backend-1', '.venv/bin/python', '-', source='''
import asyncio,json
from sqlalchemy import text
from app.core.db import async_session_maker
async def main():
 async with async_session_maker() as db:
  queries={
   'revision':'SELECT version_num FROM alembic_version',
   'active_tasks':"SELECT task_kind,status,executor_type,COUNT(*) FROM generation_tasks WHERE status IN ('pending','running') GROUP BY task_kind,status,executor_type",
   'unsent_outbox':"SELECT t.task_kind,t.status,t.executor_type,COUNT(*) FROM generation_dispatch_outbox o JOIN generation_tasks t ON t.id=o.task_id WHERE o.dispatched_at IS NULL GROUP BY t.task_kind,t.status,t.executor_type",
   'recovery_phases':"SELECT t.status,JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.phase')),COUNT(*) FROM generation_recovery r JOIN generation_tasks t ON t.id=r.task_id GROUP BY t.status,JSON_UNQUOTE(JSON_EXTRACT(r.data,'$.phase'))"
  }
  for name,sql in queries.items():
   print(json.dumps({name:[list(r) for r in (await db.execute(text(sql))).all()]}))
asyncio.run(main())
from app.config import settings
import redis
client=redis.Redis.from_url(settings.celery_broker_url)
try:
 queues={k.decode():client.llen(k) for k in client.scan_iter() if client.type(k)==b'list'}
 print(json.dumps({'broker_ping':client.ping(),'queues':queues}))
 for key in queues:
  for raw in client.lrange(key,0,-1):
   message=json.loads(raw)
   print(json.dumps({'queued_task_name':message.get('headers',{}).get('task')}))
except Exception as e:
 print(json.dumps({'broker_error_type':type(e).__name__}))
'''))
