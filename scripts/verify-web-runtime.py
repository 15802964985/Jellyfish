"""Read-only verification of deployed source, schema and service image consistency."""
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.request import urlopen


def docker(*args, source=None):
    """Read fixed container metadata without exposing environments or credentials."""
    return subprocess.run(['docker', *args], input=source, capture_output=True, text=True, encoding='utf-8', check=True).stdout


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    names = ['backend', 'celery-worker', 'celery-beat', 'backend-migrate', 'front']
    rows = json.loads(docker('inspect', *[f'jellyfish-{name}-1' for name in names]))
    assert len({row['Image'] for row in rows[:4]}) == 1
    assert rows[3]['State']['ExitCode'] == 0
    local = {str(path.relative_to(root / 'backend')).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest() for path in (root / 'backend/app').rglob('*.py')}
    remote = json.loads(docker('exec', '-i', 'jellyfish-backend-1', '.venv/bin/python', '-', source="from pathlib import Path\nimport hashlib,json\nprint(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('app').rglob('*.py')}))"))
    assert local == remote, 'Deployed application source differs from worktree'
    schema = json.load(urlopen('http://127.0.0.1:8000/openapi.json'))
    assert schema == json.loads((root / 'front/openapi.json').read_text(encoding='utf-8')), 'Generated schema differs from deployed backend'
    assert urlopen('http://127.0.0.1:7788').status == 200
    desktop = json.load(urlopen('http://127.0.0.1:8000/api/v1/studio/web-generation/desktop/status'))
    assert desktop['online']
    report = {'source_files_identical': len(local), 'schema_identical': True, 'desktop_online': True,
              'services': {name: {'image': row['Image'], 'status': row['State']['Status'], 'started': row['State']['StartedAt']} for name, row in zip(names, rows)}}
    target = root / 'local-reports/web-reliability/runtime.json'
    target.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
