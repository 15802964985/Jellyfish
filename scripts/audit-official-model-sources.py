"""Read registered public documentation only; never load credentials or call generation APIs."""
import asyncio, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.bootstrap import bootstrap_all_registries
from app.services.llm.provider_registry import list_registered_providers
from app.core.integrations.model_catalog import builtin_provider_catalog
from app.services.llm.official_sources import build_source_plan
from app.services.llm.documentation import fetch_official_document
async def main():
    """Persist bounded source-read evidence for every registered provider and catalogue model."""
    bootstrap_all_registries()
    specs = {s.key:s for s in list_registered_providers()}
    scope=[]
    for key in specs:
        catalog=builtin_provider_catalog(key)
        for m in catalog.models if catalog else []:
            scope.append(dict(provider=key,category=str(getattr(m.category,"value",m.category)),model=m.name,configured_ids=[]))
    plan=build_source_plan(scope,specs)
    semaphore=asyncio.Semaphore(4)
    async def read(url,targets):
        """Limit concurrent official page reads and retain exact provider/model ownership."""
        async with semaphore:
            ev=await fetch_official_document(url)
            print(ev.status, url, flush=True)
            return dict(source=url,status=ev.status,message=ev.message,checked_at=ev.fetched_at,sha256=ev.content_sha256,text=ev.text,targets=targets)
    rows=await asyncio.gather(*(read(u,t) for u,t in plan.items()))
    out=Path(".local/model-source-audit-20260912.json")
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(dict(providers=list(specs),scope=scope,sources=rows),ensure_ascii=False,indent=2),encoding="utf-8")
    print("REPORT",out,"providers",len(specs),"sources",len(rows),"fetched",sum(r["status"]=="fetched" for r in rows))
asyncio.run(main())
