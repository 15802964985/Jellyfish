"""Explicit editing protocols, separate from text/image-to-video generation capability."""
from app.core.integrations.fal_video_edit import FalVideoEditAdapter
from app.core.integrations.runway_video_edit import RunwayVideoEditAdapter

VIDEO_EDIT_ADAPTERS = {'fal': FalVideoEditAdapter, 'runway': RunwayVideoEditAdapter}
VIDEO_EDIT_MODELS = {'fal': 'fal-ai/kling-video/o3/pro/video-to-video/edit', 'runway': 'aleph2'}
VIDEO_EDIT_ORIGINS = {'fal': 'https://queue.fal.run', 'runway': 'https://api.dev.runwayml.com'}
