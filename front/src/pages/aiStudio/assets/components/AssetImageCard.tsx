import { ManualMediaButton } from '../../../../components/ManualMediaButton'
import { GenerationChannelActions } from '../../../../components/GenerationChannelActions'
import { WebResultCandidates } from '../../../../components/WebResultCandidates'
import { WebImageButton } from '../../../../components/WebImageButton'
import { StudioWebGenerationService as Web } from '../../../../services/generated'
/**
 * 资产列表中的统一展示卡片。
 *
 * 将演员、场景、道具、服装的封面、快速生成与多视角预览收敛到同一交互，
 * 详情页仍负责编辑完整的资产和图片信息。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Image, Modal, Space, Tag, message } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined, LoadingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { buildFileDownloadUrl, resolveAssetUrl } from '../utils'
import { DisplayImageCard } from './DisplayImageCard'
import { useGenerationCompletion } from '../../components/useGenerationCompletion'

type AssetImage = {
  id: number
  view_angle?: string | null
  file_id?: string | null
}

export type AssetCardAsset = {
  id: string
  name: string
  description?: string | null
  tags?: string[]
  thumbnail?: string
  view_count?: number | null
}

type AssetImageCardProps = {
  asset: AssetCardAsset
  assetType: 'actor'|'scene'|'prop'|'costume'
  assetLabel: string
  listImages: (assetId: string) => Promise<AssetImage[]>
  createImageSlot: (assetId: string, angle: string) => Promise<void>
  renderPrompt: (assetId: string, imageId: number) => Promise<{ prompt: string; images: string[] }>
  createGenerationTask: (assetId: string, imageId: number, payload: { prompt: string; images: string[] }) => Promise<string | null>
  onEdit: () => void
  onDelete: () => void
  onDetails?: () => void
}

const ANGLE_LABELS: Record<string, string> = {
  FRONT: '正面',
  LEFT: '左侧',
  RIGHT: '右侧',
  BACK: '背面',
  THREE_QUARTER: '3/4侧面',
  TOP: '俯视',
  DETAIL: '细节',
}

/** Returns the image that should represent an asset, preferring its front view. */
function preferredImage(images: AssetImage[]): AssetImage | null {
  return images.find((image) => image.view_angle === 'FRONT' && image.file_id) ?? images.find((image) => image.file_id) ?? null
}

export function AssetImageCard({
  asset,
  assetLabel,
  assetType,
  listImages,
  createImageSlot,
  renderPrompt,
  createGenerationTask,
  onEdit,
  onDelete,
  onDetails,
}: AssetImageCardProps) {
  const [channelOpen,setChannelOpen]=useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [images, setImages] = useState<AssetImage[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generationTaskId, setGenerationTaskId] = useState<string | null>(null)

  const generatedImages = useMemo(() => images.filter((image) => Boolean(image.file_id)), [images])
  const selectedImage = generatedImages.find((image) => image.id === selectedImageId) ?? preferredImage(generatedImages)

  const loadImages = useCallback(async () => {
    setImagesLoading(true)
    try {
      const nextImages = await listImages(asset.id)
      setImages(nextImages)
      const nextSelected = preferredImage(nextImages)
      setSelectedImageId(nextSelected?.id ?? null)
      return nextImages
    } catch {
      message.error(`加载${assetLabel}图片失败`)
      return []
    } finally {
      setImagesLoading(false)
    }
  }, [asset.id, assetLabel, listImages])

  useGenerationCompletion(generationTaskId, () => {}, async (status) => {
    if (status.status === 'succeeded') {
      const rows = await listImages(asset.id)
      setImages(rows)
      setSelectedImageId(preferredImage(rows)?.id ?? null)
    } else if (status.status === 'failed') {
      message.error(`${assetLabel}图片生成失败，请在任务中心查看原因`)
    }
    setGenerationTaskId(null)
  })

  useEffect(() => {
    // Load slot images as soon as the card mounts so the displayed thumbnail
    // always reflects the actual prop_images table instead of the cached
    // asset.thumbnail URL, which can be stale when a back-end regeneration
    // wrote to a non-FRONT slot (multi-angle assets, view_count > 1).
    void loadImages()
  }, [loadImages])

  useEffect(() => {
    if (previewOpen) void loadImages()
  }, [loadImages, previewOpen])

  const openPreview = () => {
    setPreviewOpen(true)
  }

  const handleQuickGenerate = async () => {
    setGenerating(true)
    try {
      let imageRows = await listImages(asset.id)
      let target = imageRows.find((image) => image.view_angle === 'FRONT') ?? imageRows[0]
      if (!target) {
        await createImageSlot(asset.id, 'FRONT')
        imageRows = await listImages(asset.id)
        target = imageRows.find((image) => image.view_angle === 'FRONT') ?? imageRows[0]
      }
      if (!target) throw new Error('无法创建正面图片槽位')

      const draft = await renderPrompt(asset.id, target.id)
      const taskId = await createGenerationTask(asset.id, target.id, draft)
      if (!taskId) throw new Error('未创建生成任务')
      setGenerationTaskId(taskId)
      message.success(`已创建${assetLabel}图片生成任务`)
      if (previewOpen) await loadImages()
    } catch {
      message.error(`创建${assetLabel}图片生成任务失败`)
    } finally {
      setGenerating(false)
    }
  }

  /** Prepare the exact front slot and rendered references without submitting an API task. */
  const prepareWeb = async () => {
    const entityId=asset.id
    let rows=await listImages(entityId)
    let target=rows.find(image=>image.view_angle==='FRONT')??rows[0]
    if(!target){await createImageSlot(entityId,'FRONT');rows=await listImages(entityId);target=rows.find(image=>image.view_angle==='FRONT')??rows[0]}
    if(!target)throw new Error('无法创建图片槽位')
    const draft=await renderPrompt(entityId,target.id)
    const version=await Web.targetApiV1StudioWebGenerationTargetsTargetTypeEntityIdSlotIdGet({targetType:assetType,entityId,slotId:target.id})
    return {target_type:assetType,entity_id:entityId,slot_id:target.id,expected_version:version.version,prompt:draft.prompt,reference_file_ids:draft.images}
  }
  const thumbnailUrl = buildFileDownloadUrl(preferredImage(images)?.file_id) || resolveAssetUrl(asset.thumbnail)

  return (
    <>
      <Modal open={channelOpen} title={`${asset.name} · 生成正面图`} onCancel={()=>setChannelOpen(false)} footer={null}>
        <p>选择本次生成通道，参考材料来自当前资产设定。</p>
        <GenerationChannelActions apiAction={<Button type="primary" loading={generating} onClick={()=>{setChannelOpen(false);void handleQuickGenerate()}}>API 生成</Button>} webAction={<WebImageButton prepare={prepareWeb} onAccepted={id=>{setChannelOpen(false);setGenerationTaskId(id)}}/>}/>
      </Modal>
      <DisplayImageCard
        title={<span className="truncate">{asset.name}</span>}
        imageUrl={thumbnailUrl}
        imageAlt={asset.name}
        placeholder={
          <div className="flex flex-col items-center gap-2">
            <span>未生成图片</span>
            <Button
              type="primary"
              size="small"
              icon={generating ? <LoadingOutlined /> : <ThunderboltOutlined />}
              loading={generating || !!generationTaskId}
              onClick={(event) => {
                event.stopPropagation()
                setChannelOpen(true)
              }}
            >
              快速生成
            </Button>
          </div>
        }
        onImageClick={openPreview}
        extra={<Tag color="blue">{assetLabel}</Tag>}
        actions={[
          <Button key="generate" type="text" size="small" icon={<ThunderboltOutlined />} loading={generating || !!generationTaskId} onClick={() => setChannelOpen(true)}>
            {thumbnailUrl ? '重新生成' : '快速生成'}
          </Button>,
          <Button key="edit" type="text" size="small" icon={<EditOutlined />} onClick={onEdit}>
            编辑
          </Button>,
          ...(onDetails ? [<Button key="detail" type="text" size="small" icon={<EyeOutlined />} onClick={onDetails}>详情</Button>] : []),
          <Button key="delete" type="text" danger size="small" icon={<DeleteOutlined />} onClick={onDelete} />,
        ]}
        meta={
          <>
            <ManualMediaButton target={{target_type:assetType,entity_id:asset.id,slot_id:preferredImage(images)?.id}} title={asset.name+' · 修改正面图'} onAdopted={async()=>{await loadImages()}}/>
            <WebResultCandidates targetType={assetType} entityId={asset.id} onAdopt={async()=>{await loadImages()}}/>
            <div className="text-xs text-gray-500 mb-2 line-clamp-2">{asset.description || '暂无描述'}</div>
            <div className="flex flex-wrap gap-1">
              {(asset.tags ?? []).slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
            </div>
          </>
        }
      />

      <Modal title={`${asset.name} · 图片预览`} open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={960}>
        {imagesLoading ? (
          <div className="h-80 flex items-center justify-center"><LoadingOutlined /></div>
        ) : generatedImages.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center gap-3 text-gray-500">
            <span>暂未生成任何视角图片</span>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={generating || !!generationTaskId} onClick={() => setChannelOpen(true)}>快速生成正面图</Button>
          </div>
        ) : (
          <Space direction="vertical" size="middle" className="w-full">
            <div className="min-h-80 flex items-center justify-center rounded-md bg-gray-50 overflow-hidden">
              {selectedImage?.file_id ? <Image preview src={buildFileDownloadUrl(selectedImage.file_id)} alt={asset.name} className="max-h-[65vh] object-contain" /> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {generatedImages.map((image) => (
                <Button key={image.id} type={selectedImage?.id === image.id ? 'primary' : 'default'} onClick={() => setSelectedImageId(image.id)}>
                  {ANGLE_LABELS[image.view_angle ?? ''] ?? image.view_angle ?? '图片'}
                </Button>
              ))}
            </div>
          </Space>
        )}
      </Modal>
    </>
  )
}
