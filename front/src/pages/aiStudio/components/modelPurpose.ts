/** Known edit-only model IDs cannot be selected as ordinary generation defaults. */
export function isVideoEditOnlyModel(model: { name: string; category: string }): boolean {
  return model.category === 'video' && ['aleph2', 'fal-ai/kling-video/o3/pro/video-to-video/edit'].includes(model.name)
}
