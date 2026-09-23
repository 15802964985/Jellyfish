"""Verify the candidate migration against the explicitly isolated restored database."""
import json
import subprocess
from pathlib import Path


def run(*args):
    """Capture only verification output; all commands target the named isolated database."""
    result = subprocess.run(['docker', *args], capture_output=True, text=True, encoding='utf-8', check=True)
    return result.stdout


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    shared = ['run', '--rm', '--network', 'jellyfish_default', '-e',
              'DATABASE_URL=mysql+aiomysql://root:isolated-reliability-only@jellyfish-reliability-verify-20260917:3306/jellyfish_verify',
              '-e', 'DEBUG=false', '-e', 'PYTHONPATH=/app', '-v',
              str(root / 'backend/scripts/database_fingerprint.py') + ':/verify/fingerprint.py:ro', 'jellyfish-backend']
    before = json.loads(run(*shared, '.venv/bin/python', '/verify/fingerprint.py'))
    run(*shared, '.venv/bin/python', '-m', 'app.scripts.migrate_database')
    after = json.loads(run(*shared, '.venv/bin/python', '/verify/fingerprint.py'))
    if before != after:
        raise RuntimeError('Unexpected isolated database changes')
    report = {'tables_unchanged': len(before), 'fingerprints': after}
    target = root / 'local-reports/web-reliability/migration.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'tables_unchanged': len(before), 'report': str(target)}))
