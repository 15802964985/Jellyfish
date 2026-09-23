"""Durable media execution: accepted HTTP replies are replayed locally, never resubmitted."""
import asyncio
import json
import time
from contextlib import asynccontextmanager
from hashlib import sha256
from uuid import uuid4
import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.core import storage
from app.core.db import async_session_maker
from app.core.contracts.generation_recovery import media_recovery
from app.models.generation_recovery import GenerationRecovery
from app.models.task import GenerationTask
from app.models.generation_calls import GenerationCall

MEDIA_KINDS = {"image_generation", "video_generation"}

class MediaRecovery:
    """One leased task owns its receipts; raw responses stay in private object storage."""
    def __init__(self, task_id, token):
        """Bind all checkpoint keys to an existing task and worker lease."""
        self.task_id, self.token = task_id, token
        self.last_call_key = None
        self.prefix = "generation-recovery/" + sha256(task_id.encode()).hexdigest()

    async def update(self, callback):
        """Serialize checkpoint changes and fail closed when another worker owns the lease."""
        async with async_session_maker() as db:
            row = (await db.execute(select(GenerationRecovery).where(GenerationRecovery.task_id == self.task_id).with_for_update())).scalar_one()
            data = dict(row.data)
            if data.get("owner") != self.token:
                raise RuntimeError("恢复任务执行权已变化，请刷新状态")
            value = callback(data)
            row.data = data
            await db.commit()
            return value

    async def before_http(self, request):
        """Persist sending before any mutating request; known polling POSTs remain read operations."""
        if request.method != "POST" or request.url.params.get("Action") == "CVSync2AsyncGetResult":
            return None
        from app.core.integrations.traced_http import sanitize
        try:
            body = sanitize(json.loads(request.content))
        except (ValueError, httpx.RequestNotRead):
            # Multipart streams cannot be fingerprinted safely; a task owns only one submit to this route.
            body = request.extensions.get("audit_form", {"multipart": True})
        route = request.url.copy_with(query=None)
        identity = str(route) + "?Action=" + request.url.params.get("Action", "")
        key = sha256(identity.encode()).hexdigest()
        fingerprint = sha256(json.dumps(body,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        def begin(data):
            """An uncertain submit is never considered permission to submit again."""
            calls = dict(data.get("calls", {}))
            previous = calls.get(key)
            if previous:
                if previous["fingerprint"] != fingerprint:
                    raise RuntimeError("恢复输入与原提交不一致，禁止重新收费提交")
                if not previous.get("response_key"):
                    raise RuntimeError("原提交是否受理尚不确定，请核对厂商记录；系统不会重复提交")
                return previous
            calls[key] = {"fingerprint": fingerprint, "state": "sending"}
            data.update(calls=calls, phase="submitting")
            return None
        previous = await self.update(begin)
        self.last_call_key = key
        request.extensions["recovery_key"] = key
        if previous:
            content = await storage.download_file(key=previous["response_key"])
            return httpx.Response(previous["status_code"], content=content,
                headers={"content-type": previous.get("content_type", "application/json")}, request=request)
        return None

    async def after_http(self, request, response):
        """Save complete nonstreaming replies before adapter polling; failure leaves an explicit uncertain receipt."""
        key = request.extensions.get("recovery_key")
        if not key:
            return
        object_key = self.prefix + "/http-" + key + ".json"
        await storage.upload_file(key=object_key, data=response.content, content_type="application/octet-stream")
        def accepted(data):
            """Keep source status without inferring success from HTTP 200 alone."""
            calls = dict(data.get("calls", {}))
            calls[key] = {**calls[key], "response_key": object_key, "status_code": response.status_code,
                "content_type": response.headers.get("content-type", "application/json"), "state": "received"}
            data.update(calls=calls, phase="waiting")
        await self.update(accepted)

    async def confirm_receipt(self, task_id):
        """Associate adapter-validated task identity with its durable creation response."""
        key = self.last_call_key
        def confirm(data):
            """Never upgrade an absent or unsuccessful HTTP receipt to resumable."""
            calls = dict(data.get("calls", {}))
            call = calls.get(key, {})
            if call.get("response_key") and 200 <= call.get("status_code", 0) < 300:
                calls[key] = {**call, "validated_task_id": task_id}
                data.update(calls=calls)
        await self.update(confirm)

    async def load_result(self):
        """Reload a completed provider result to retry only artifact storage/publication."""
        key = await self.update(lambda data: data.get("result_key"))
        return json.loads(await storage.download_file(key=key)) if key else None

    async def save_result(self, result):
        """Stage provider outputs, including base64 results, before the business archive transaction."""
        key = self.prefix + "/result.json"
        await storage.upload_file(key=key, data=json.dumps(result,ensure_ascii=False).encode(),content_type="application/octet-stream")
        await self.update(lambda data: data.update(result_key=key, phase="archiving"))

    async def heartbeat(self):
        """Renew the lease independently of long provider polling or downloads."""
        while True:
            await asyncio.sleep(30)
            await self.update(lambda data: data.update(lease_until=time.time()+120))

    async def finish(self):
        """Release ownership; remove only this task's temporary copies after committed artifact success."""
        async with async_session_maker() as db:
            task = await db.get(GenerationTask,self.task_id)
            success = task is not None and task.status == "succeeded"
        def release(data):
            """Collect exact owned temporary keys, retaining receipts for unfinished work."""
            keys = [v["response_key"] for v in data.get("calls",{}).values() if v.get("response_key")]
            if data.get("result_key"): keys.append(data["result_key"])
            data["lease_until"] = 0
            if success: data["phase"] = "completed"
            return keys if success else []
        keys = await self.update(release)
        for key in keys:
            try:
                await storage.delete_file(key=key)
            except Exception:
                # Cleanup failure cannot turn a committed generation into failure; keys remain auditable.
                import logging
                logging.getLogger(__name__).warning("Recovery temporary cleanup pending for task %s", self.task_id)


@asynccontextmanager
async def recovery_execution(task_id):
    """Claim a media worker once; a duplicate delivery never changes the real task's status."""
    token = uuid4().hex
    async with async_session_maker() as db:
        task = await db.get(GenerationTask,task_id)
        if task is None or task.status in {"succeeded","cancelled"} or task.cancel_requested:
            yield False
            return
        row = await db.get(GenerationRecovery,task_id)
        if row is None:
            # Older tasks lack a durable reply; never interpret missing checkpoints as a fresh submission.
            previous = (await db.execute(select(GenerationCall.id).where(
                GenerationCall.task_id == task_id, GenerationCall.method == "POST").limit(1))).scalar_one_or_none()
            if previous is not None:
                raise RuntimeError("历史任务已有提交记录但无恢复回执，禁止重复提交，请核对厂商任务")
            try:
                async with db.begin_nested():
                    db.add(GenerationRecovery(task_id=task_id,data={}))
                    await db.flush()
            except IntegrityError:
                pass
        row = (await db.execute(select(GenerationRecovery).where(GenerationRecovery.task_id==task_id).with_for_update())).scalar_one()
        if row.data.get("lease_until",0) > time.time():
            yield False
            return
        row.data = {**row.data,"owner":token,"lease_until":time.time()+120,"queued_until":0}
        await db.commit()
    recovery = MediaRecovery(task_id,token)
    context = media_recovery.set(recovery)
    worker = asyncio.current_task()
    async def guard_lease():
        """Stop local execution if lease renewal fails, preventing two live publishers."""
        try:
            await recovery.heartbeat()
        except asyncio.CancelledError:
            raise
        except Exception:
            if worker is not None:
                worker.cancel("恢复执行权续约失败，已停止本地执行")
            raise
    heartbeat = asyncio.create_task(guard_lease())
    try:
        yield True
    finally:
        heartbeat.cancel()
        await asyncio.gather(heartbeat,return_exceptions=True)
        try:
            await recovery.finish()
        except Exception:
            # Lease expiry permits later recovery; finalization must not overwrite committed success.
            import logging
            logging.getLogger(__name__).exception("Recovery finalization pending for task %s", task_id)
        finally:
            media_recovery.reset(context)


async def recovery_status(db, task_id):
    """Expose only phases and allowed actions, never cached bodies or signed URLs."""
    task = await db.get(GenerationTask,task_id)
    if task is None or task.visibility == "hidden":
        raise HTTPException(404,"任务不存在")
    row = await db.get(GenerationRecovery,task_id)
    data = row.data if row else {}
    known = bool(data.get("result_key") or data.get("calls") and all(v.get("response_key") and v.get("validated_task_id") and 200 <= v.get("status_code",0) < 300 for v in data["calls"].values()))
    busy = data.get("lease_until",0) > time.time() or data.get("queued_until",0) > time.time()
    resumable = known and not busy and task.status not in {"succeeded","cancelled","pending"} and not task.cancel_requested
    return {"phase":data.get("phase","not_recorded"),"can_resume":bool(resumable),
        "action":"仅补归档" if data.get("result_key") else "继续查询原任务",
        "notice":"恢复沿用原任务和已保存回执，不重新提交生成。历史无回执或提交结果不确定时不能自动恢复。"}


async def resume_generation(db,task_id):
    """Queue safe recovery only, rejecting concurrent/unknown/terminal submissions."""
    row = (await db.execute(select(GenerationRecovery).where(GenerationRecovery.task_id==task_id).with_for_update())).scalar_one_or_none()
    state = await recovery_status(db,task_id)
    if row is None or not state["can_resume"]:
        raise HTTPException(409,"当前任务不可恢复，请刷新状态；不会重新提交生成")
    row.data = {**row.data,"queued_until":time.time()+120}
    await db.commit()
    from app.tasks.execute_task import enqueue_task_execution
    await asyncio.to_thread(enqueue_task_execution,task_id)
    return {"status":"queued","task_id":task_id}


async def recover_interrupted_media():
    """Requeue only interrupted running tasks with durable replies; failed tasks require explicit recovery."""
    queued=[]
    async with async_session_maker() as db:
        rows=(await db.execute(select(GenerationRecovery.task_id).join(GenerationTask,GenerationTask.id==GenerationRecovery.task_id)
            .where(GenerationTask.status=="running",GenerationTask.task_kind.in_(MEDIA_KINDS)))).scalars().all()
        for task_id in rows:
            state=await recovery_status(db,task_id)
            if state["can_resume"]:
                try:
                    await resume_generation(db,task_id)
                    queued.append(task_id)
                except HTTPException:
                    await db.rollback()
    return queued
