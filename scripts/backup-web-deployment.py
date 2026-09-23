"""Capture a consistent database dump and rollback image identities before deployment."""
import hashlib
import json
import subprocess
from datetime import datetime
from pathlib import Path


def run(*args, **kwargs):
    """Fail on incomplete snapshots; do not print secrets or SQL contents."""
    return subprocess.run(['docker', *args], check=True, capture_output=True, **kwargs)


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    target = root / 'backups' / ('web-deployment-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    target.mkdir(parents=True)
    dump = run('exec', 'jellyfish-mysql-1', 'sh', '-c',
               'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --events --no-tablespaces "$MYSQL_DATABASE"').stdout
    if len(dump) < 1000 or b'Dump completed' not in dump:
        raise RuntimeError('Incomplete database snapshot')
    (target / 'database.sql').write_bytes(dump)
    summary = {'database_bytes': len(dump), 'database_sha256': hashlib.sha256(dump).hexdigest(), 'images': {}}
    for service in ['backend', 'front', 'celery-worker', 'celery-beat', 'backend-migrate']:
        row = json.loads(run('inspect', f'jellyfish-{service}-1').stdout)[0]
        tag = f'jellyfish-{service}:rollback-reliability-20260917'
        # Capture the backend's deployed hotfix layer too; its source image may have been pruned.
        try:
            if service == 'backend':
                run('commit', f'jellyfish-{service}-1', tag)
            else:
                run('tag', row['Image'], tag)
        except subprocess.CalledProcessError:
            # Missing old content layers can prevent commit even while a container still runs.
            archive = target / (service + '-rootfs.tar')
            run('export', '-o', str(archive), f'jellyfish-{service}-1')
            changes = ['--change', 'WORKDIR ' + (row['Config']['WorkingDir'] or '/')]
            for key in ['Cmd', 'Entrypoint']:
                if row['Config'].get(key):
                    changes += ['--change', key.upper() + ' ' + json.dumps(row['Config'][key])]
            # Only runtime-independent defaults belong in rollback images; Compose supplies credentials.
            for env in row['Config']['Env']:
                if env.split('=', 1)[0] in ['PATH', 'PYTHONUNBUFFERED', 'UV_NO_SYNC', 'PYTHONDONTWRITEBYTECODE']:
                    changes += ['--change', 'ENV ' + env]
            run('import', *changes, str(archive), tag)
        summary['images'][service] = {'id': row['Image'], 'rollback_tag': tag}
    (target / 'manifest.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps({'backup': str(target), **summary}, indent=2))
