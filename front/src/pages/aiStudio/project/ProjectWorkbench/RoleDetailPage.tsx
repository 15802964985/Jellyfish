import { useNavigate, useParams } from 'react-router-dom'
import { AssetEditPageBase } from '../../assets/components/AssetEditPageBase'
import { CharacterAppearanceManager } from '../../components/CharacterAppearanceManager'
import { RoleActorPanel } from './RoleActorPanel'
import { assetAdapters } from '../../assets/assetAdapters'

export default function RoleDetailPage() {
  const navigate = useNavigate()
  const { projectId, characterId } = useParams<{ projectId: string; characterId: string }>()
  const adapter = assetAdapters.character

  if (!characterId) {
    return null
  }

  return (
    <AssetEditPageBase<any, any>
      assetId={characterId}
      {...adapter}
      extraContent={<><RoleActorPanel key={characterId} characterId={characterId} projectId={projectId} /><CharacterAppearanceManager key={`appearance:${characterId}`} characterId={characterId}/></>}
      backTo={projectId ? `/projects/${projectId}?tab=roles` : adapter.backTo}
      onNavigate={(to, replace) => navigate(to, replace ? { replace: true } : undefined)}
    />
  )
}
