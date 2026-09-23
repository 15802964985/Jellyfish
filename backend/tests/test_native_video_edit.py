"""Offline protocol contracts: no supplier network or billable generation."""
import json
from types import SimpleNamespace
import httpx
import pytest
from app.core.contracts.video_edit import VideoEditOptions
from app.core.integrations.native_video_edit import NativeVideoEditAdapter
from app.core.integrations.video_edit_registry import CAPABILITIES, editing_base_url
from app.services.generation.video_edit_controls import selected_options, estimate_edit

@pytest.mark.asyncio
@pytest.mark.parametrize("cap", [c for c in CAPABILITIES if c.provider not in ("fal","runway")], ids=lambda c:c.model)
async def test_native_submit_poll_result_without_retry(cap):
    """Verify each protocol's source role, exact endpoint and terminal response extraction."""
    origins = {"aliyun_bailian":"https://dashscope.aliyuncs.com","kling":"https://api-beijing.klingai.com",
        "vidu":"https://api.vidu.cn","volcengine":"https://ark.cn-beijing.volces.com/api/v3","minimax":"https://api.minimax.cn"}
    paths = {"aliyun_bailian":"/api/v1/services/aigc/video-generation/video-synthesis","kling":"/omni-video/"+cap.model,
        "vidu":"/ent/v2/reference2video","volcengine":"/api/v3/contents/generations/tasks","minimax":"/v2/video_generation"}
    calls=[]
    def handle(request):
        calls.append(request)
        assert request.headers["authorization"] == ("Token " if cap.provider=="vidu" else "Bearer ")+"offline"
        if request.method=="POST":
            assert request.url.path==paths[cap.provider]
            body=json.loads(request.content)
            if cap.provider=="aliyun_bailian":
                assert body["input"]["media"][0]=={"type":"video","url":"https://media.example/source.mp4"}
                assert body["parameters"]["duration"]==0
                return httpx.Response(200,json={"output":{"task_id":"job-1"}})
            if cap.provider=="kling":
                assert body["contents"][1]["type"]=="base_video"
                assert body["settings"]["audio"]=="original"
                return httpx.Response(200,json={"code":0,"data":{"id":"job-1"}})
            if cap.provider=="vidu":
                assert body["subjects"][0]["videos"]==["https://media.example/source.mp4"]
            else:
                assert body["content"][1]["role"]=="reference_video"
                if cap.provider=="volcengine":
                    assert body["omni_reference_task_type"]=="edit"
                    assert body["duration"]==-1
            return httpx.Response(200,json={"id":"job-1"} if cap.provider=="volcengine" else {"task_id":"job-1"})
        url="https://media.example/result.mp4"
        data={"aliyun_bailian":{"output":{"task_status":"SUCCEEDED","video_url":url}},
            "kling":{"code":0,"data":[{"id":"job-1","status":"succeeded","outputs":[{"type":"video","url":url}]}]},
            "vidu":{"state":"success","creations":[{"url":url}]},
            "volcengine":{"status":"succeeded","content":{"video_url":url}},
            "minimax":{"task":{"status":"succeeded","content":{"url":url}}}}[cap.provider]
        return httpx.Response(200,json=data)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        adapter=NativeVideoEditAdapter(client,SimpleNamespace(provider=cap.provider,api_key="offline",base_url=origins[cap.provider]))
        opts=selected_options(cap,{},VideoEditOptions())
        receipt=await adapter.submit(model=cap.model,prompt="change coat",video_url="https://media.example/source.mp4",
            image_urls=["https://media.example/reference.png"],keep_audio=True,resolution=opts.resolution,seconds=opts.seconds)
        assert (await adapter.status(receipt))["status"]=="COMPLETED"
        assert await adapter.result(receipt)=="https://media.example/result.mp4"
        assert sum(r.method=="POST" for r in calls)==1
        with pytest.raises(ValueError):
            await adapter.status({"request_id":"../../other"})
        assert len(calls)==3

def test_edit_defaults_and_plan_endpoints_are_not_silently_replaced():
    """Unsupported tiers and unverified plan origins fail before billing."""
    cap=next(c for c in CAPABILITIES if c.provider=="aliyun_bailian")
    assert selected_options(cap,{},VideoEditOptions()).resolution=="720P"
    assert selected_options(cap,{"video_edit_defaults":{"resolution":"1080P"}},VideoEditOptions()).resolution=="1080P"
    with pytest.raises(ValueError):
        selected_options(cap,{},VideoEditOptions(resolution="4k"))
    with pytest.raises(ValueError):
        editing_base_url("volcengine","https://ark.cn-beijing.volces.com/api/plan/v3")
    with pytest.raises(ValueError):
        editing_base_url("aliyun_bailian","https://token-plan-cn-beijing.maas.aliyuncs.com")
    with pytest.raises(ValueError):
        editing_base_url("kling","https://api-beijing.klingai.com.evil.example")

@pytest.mark.asyncio
async def test_wan_cost_counts_input_and_output_and_unknown_is_not_free():
    """A five-second edit costs ten billed seconds; unverified tariffs remain unknown."""
    cap=next(c for c in CAPABILITIES if c.provider=="aliyun_bailian")
    quote=await estimate_edit(None,SimpleNamespace(model_name=cap.model),cap,{"seconds":5},VideoEditOptions(resolution="720P"))
    assert quote["amount"]=="6.0"
    cap=next(c for c in CAPABILITIES if c.provider=="minimax")
    quote=await estimate_edit(None,SimpleNamespace(model_name=cap.model),cap,{"seconds":5},VideoEditOptions(resolution="768P",seconds=5))
    assert quote["status"]=="unknown" and quote["amount"] is None
