"""Box-guided image editing with explicit local compositing, not a claimed native mask API."""
from io import BytesIO
import base64
from PIL import Image, ImageDraw, ImageOps
from fastapi import HTTPException
from app.core.contracts.generation import ImageGenerationOperationInput
from app.core.contracts.media import ImageMediaInput

SUPPORTED = {("bfl", "flux-kontext-pro"), ("jimeng", "即梦AI-图片生成3.0"), ("jimeng", "jimeng_i2i_v30")}

def validate_region(command, revision, media):
    """Use only already implemented reference-image editing and preserve explicit source identity."""
    operation = command.request.operation_input
    if not isinstance(operation, ImageGenerationOperationInput) or operation.edit_region is None:
        return
    if (revision.provider_key, revision.model_name) not in SUPPORTED:
        raise HTTPException(422, "当前型号未接通框选修正；请明确选择即梦图片3.0或FLUX Kontext Pro，不会自动切换")
    if command.target.kind.value != "experiment_session":
        raise HTTPException(422, "框选修正当前在图片实验室提供，结果作为新文件保留")
    if operation.count != 1 or not isinstance(media, ImageMediaInput) or len(media.references) != 1:
        raise HTTPException(422, "框选修正需要且只接受一张原图、生成一张新图")

def rectangle(image, region):
    """Convert normalized coordinates to one shared pixel boundary for overlay and compositing."""
    width, height = image.size
    box = (round(region.x*width), round(region.y*height), min(width,round((region.x+region.width)*width)), min(height,round((region.y+region.height)*height)))
    if box[2]-box[0] < 8 or box[3]-box[1] < 8:
        raise ValueError("框选区域至少需要8×8像素")
    return box

def annotate_source(content, region):
    """Mark the user-selected rectangle in the actual provider input, leaving the source file untouched."""
    image = ImageOps.exif_transpose(Image.open(BytesIO(content))).convert("RGB")
    box = rectangle(image, region)
    ImageDraw.Draw(image).rectangle(box, outline="red", width=max(2, round(min(image.size)/300)))
    output=BytesIO(); image.save(output,format="PNG")
    return output.getvalue()

def composite_region(source, generated, region):
    """Preserve original pixels outside the selected area and reject incompatible output proportions."""
    original = ImageOps.exif_transpose(Image.open(BytesIO(source))).convert("RGB")
    edited = ImageOps.exif_transpose(Image.open(BytesIO(generated))).convert("RGB")
    if abs((edited.width/edited.height)/(original.width/original.height)-1) > .03:
        raise ValueError("编辑结果比例与原图不匹配，未合成；请核对生成比例")
    edited=edited.resize(original.size,Image.Resampling.LANCZOS)
    box=rectangle(original,region)
    original.paste(edited.crop(box),box[:2])
    output=BytesIO(); original.save(output,format="PNG")
    return output.getvalue()

async def compose_result(db, task_id, snapshot, result):
    """Keep the original task/reference association and return a new composite image candidate."""
    region=snapshot.operation_input.edit_region
    if region is None:
        return result
    from app.services.generation.files import FileResolver
    from app.core.contracts.image_generation import ImageGenerationResult, ImageItem
    import httpx
    source=await FileResolver(db).resolve_task_reference(task_id=task_id,reference=snapshot.media.references[0])
    image=result.images[0]
    if image.b64_json:
        raw=image.b64_json.split(",",1)[-1] if image.b64_json.startswith("data:") else image.b64_json
        content=base64.b64decode(raw)
    else:
        async with httpx.AsyncClient(timeout=120) as client:
            response=await client.get(image.url); response.raise_for_status(); content=response.content
    composite=composite_region(source.content,content,region)
    return ImageGenerationResult(images=[ImageItem(b64_json=base64.b64encode(composite).decode())],
        provider=result.provider,provider_task_id=result.provider_task_id,status=result.status)
