"""FastAPI 应用入口。"""

from asyncio import to_thread
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import router as api_v1_router
from app.bootstrap import bootstrap_all_registries
from app.config import settings
from app.schemas.common import ApiResponse


def _error_message(detail: object) -> str:
    """将异常 detail 转为前端可读的 message。"""
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts = []
        for item in detail:
            if isinstance(item, dict) and "msg" in item:
                loc = item.get("loc", ())
                loc_str = ".".join(str(x) for x in loc if x != "body")
                parts.append(f"{loc_str}: {item['msg']}" if loc_str else item["msg"])
            else:
                parts.append(str(item))
        return "; ".join(parts) if parts else "Validation error"
    return str(detail)


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """HTTP 异常统一为 { code, message, data: null }。"""
    from fastapi import HTTPException

    if isinstance(exc, HTTPException):
        code = exc.status_code
        message = _error_message(exc.detail)
    else:
        code = 500
        message = "Internal server error"
    body = ApiResponse[None](code=code, message=message, data=None, meta=None).model_dump()
    return JSONResponse(status_code=code, content=body)


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """422 校验异常统一为 { code: 422, message, data: null }。"""
    assert isinstance(exc, RequestValidationError)
    message = _error_message(exc.errors())
    body = ApiResponse[None](code=422, message=message, data=None, meta=None).model_dump()
    return JSONResponse(status_code=422, content=body)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化，关闭时清理。"""
    # 启动时：供应商注册 + 任务执行器注册（幂等）
    bootstrap_all_registries()
    if settings.s3_bucket_name:
        from app.core.storage import init_storage

        # boto3 是同步客户端，在线程中完成幂等 bucket 初始化，避免阻塞事件循环。
        await to_thread(init_storage)
    # Queue an expiry-aware check in the worker; application startup never waits for official websites.
    import asyncio
    import logging
    async def schedule_model_check():
        """Enqueue asynchronously; a broker outage must not prevent API startup."""
        from app.services.llm.model_governance import queue_sync
        try:
            await queue_sync()
        except Exception:
            logging.getLogger(__name__).warning("Model synchronization could not be queued; scheduled checks remain enabled")
    startup_check = asyncio.create_task(schedule_model_check())
    try:
        yield
    finally:
        if not startup_check.done():
            startup_check.cancel()



app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# 统一错误响应格式：{ code, message, data: null }
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(Exception, http_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def disable_api_response_cache(request: Request, call_next):
    """业务接口始终返回最新状态，避免浏览器复用 CRUD 列表响应。"""
    response = await call_next(request)
    if request.url.path.startswith(settings.api_v1_prefix):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response

app.include_router(api_v1_router, prefix=settings.api_v1_prefix)
# 影视技能路由同时挂到主应用，保证 /api/v1/film 一定可访问


@app.get("/health")
async def health():
    """健康检查。"""
    from app.schemas.common import success_response
    return success_response({"status": "ok"})
