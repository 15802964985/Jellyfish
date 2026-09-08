import { Alert, Modal, message } from 'antd'
import {
  StudioEntitiesService,
  type EntityDeleteImpactRead,
} from '../../../services/generated'
import { defaultTaskActionErrorMessage } from '../components/taskActionHelpers'

type DeletableEntityType = EntityDeleteImpactRead['entity_type']

type ConfirmEntityDeletionOptions = {
  entityType: DeletableEntityType
  entityId: string
  entityLabel: string
  entityName: string
  onDeleted: () => void | Promise<void>
}

function ImpactDetails({ impact }: { impact: EntityDeleteImpactRead }) {
  const groups = impact.groups ?? []
  if (!impact.has_relations || groups.length === 0) {
    return <div>该资产当前没有业务关联。删除后不可恢复，请确认。</div>
  }

  return (
    <div className="space-y-3">
      <Alert
        type="warning"
        showIcon
        message={`检测到 ${impact.relation_count} 项关联或随资产删除的数据`}
        description="确认后，系统会在同一数据库事务中先解除下列业务关联，再删除资产；底层上传文件仍保留在文件管理中。任一步失败都会整体回滚。"
      />
      <div className="max-h-72 overflow-auto rounded border border-gray-200 bg-gray-50 p-3">
        {groups.map((group) => {
          const items = group.items ?? []
          return (
            <div key={group.relation_type} className="mb-3 last:mb-0">
              <div className="font-medium text-gray-900">
                {group.label}（{group.count}）
              </div>
              {items.length > 0 ? (
                <ul className="mb-0 mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                  {items.map((item, index) => (
                    <li key={`${group.relation_type}-${index}`}>{item}</li>
                  ))}
                  {group.count > items.length ? (
                    <li>另有 {group.count - items.length} 项未展开</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Load the server-calculated impact before asking for confirmation. Deletion is
 * intentionally unavailable when the impact query fails, so callers cannot
 * accidentally bypass relationship inspection.
 */
export async function confirmEntityDeletion({
  entityType,
  entityId,
  entityLabel,
  entityName,
  onDeleted,
}: ConfirmEntityDeletionOptions): Promise<void> {
  const hideLoading = message.loading('正在检查资产关联…', 0)
  let impact: EntityDeleteImpactRead
  try {
    const response = await StudioEntitiesService.getEntityDeleteImpactApiV1StudioEntitiesEntityTypeEntityIdDeleteImpactGet({
      entityType,
      entityId,
    })
    if (!response.data) throw new Error('未返回删除影响数据')
    impact = response.data
  } catch (error) {
    message.error(defaultTaskActionErrorMessage(error, '无法查询资产关联，已取消删除'))
    return
  } finally {
    hideLoading()
  }

  Modal.confirm({
    title: `删除${entityLabel}「${entityName}」？`,
    width: 620,
    content: <ImpactDetails impact={impact} />,
    okText: impact.has_relations ? '解除关联并删除' : '确认删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await StudioEntitiesService.deleteEntityApiV1StudioEntitiesEntityTypeEntityIdDelete({
          entityType,
          entityId,
          unlinkRelations: true,
        })
        message.success(`已删除${entityLabel}`)
        await onDeleted()
      } catch (error) {
        message.error(defaultTaskActionErrorMessage(error, `删除${entityLabel}失败`))
        throw error
      }
    },
  })
}
