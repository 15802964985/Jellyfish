"""Stable fingerprints identify the adapter/contracts shipped with a task, including uncommitted builds."""
from functools import lru_cache
from hashlib import sha256
from pathlib import Path


@lru_cache(maxsize=1)
def adapter_version() -> str:
    """Hash adapter and cross-layer contract sources once per process without reading credentials."""
    core = Path(__file__).resolve().parents[1]
    digest = sha256()
    for directory in ("integrations", "contracts"):
        for path in sorted((core / directory).rglob("*.py")):
            digest.update(path.relative_to(core).as_posix().encode())
            digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
    return "sha256:" + digest.hexdigest()
