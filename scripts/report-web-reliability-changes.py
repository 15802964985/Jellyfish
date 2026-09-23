"""Compare the pre-repair source snapshot with the dirty worktree, independent of old Git HEAD."""
import hashlib
import json
import subprocess
from pathlib import Path


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    baseline = json.loads((root / 'backups/web-reliability-20260917-175335/source-manifest.json').read_text(encoding='utf-8-sig'))
    previous = {row['path']: row['sha256'].lower() for row in baseline}
    listed = subprocess.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root, capture_output=True, check=True).stdout
    changed = []
    for name in sorted(set(listed.decode().split('\0')) - {''}):
        path = root / name
        if not path.is_file() or '.env' in path.name or path.suffix.lower()=='.sql' or name.startswith(('.codegraph/', 'local-reports/', 'local-browser/', 'backups/')):
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if previous.get(name) != digest:
            changed.append({'path': name, 'kind': 'modified' if name in previous else 'added', 'sha256': digest})
    target = root / 'local-reports/web-reliability/changes.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(changed, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'count': len(changed), 'paths': [row['path'] for row in changed]}, ensure_ascii=False, indent=2))
