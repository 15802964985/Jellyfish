"""Regression: model import must commit before HTTP success is sent."""
from fastapi.testclient import TestClient

from app.api.v1.routes import llm
from app.dependencies import get_db
from app.schemas.llm import ProviderModelImportResult
from tests.support.llm_api_app import build_llm_only_app


def test_model_import_commits_before_response_start(monkeypatch):
    """Observe ASGI response timing, not merely state after TestClient returns."""
    app = build_llm_only_app()
    committed = []
    observations = []

    async def database():
        yield object()
        committed.append(True)

    async def import_models(*args, **kwargs):
        return ProviderModelImportResult(created=[], skipped=[])

    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(llm, "import_provider_models_service", import_models)

    async def observed_app(scope, receive, send):
        async def observed_send(message):
            if message["type"] == "http.response.start":
                observations.append(bool(committed))
            await send(message)
        await app(scope, receive, observed_send)

    with TestClient(observed_app) as client:
        response = client.post('/api/v1/llm/providers/example/models/import', json={
            'models': [{'name': 'test-audio', 'category': 'audio'}],
        })
    assert response.status_code == 200, response.text
    assert observations == [True]
