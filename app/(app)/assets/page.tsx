import { requireUser, getWorkspaceId } from '@/lib/auth/helpers'
import { getWorkspaceAssetsGrouped } from '@/lib/queries/assets'
import { AssetsGrid } from '@/components/assets/assets-grid'

export default async function AssetsPage() {
  await requireUser()
  const workspaceId = await getWorkspaceId()

  const groups = workspaceId
    ? await getWorkspaceAssetsGrouped(workspaceId)
    : []

  const total = groups.reduce((sum, g) => sum + g.assets.length, 0)

  return (
    <div className="px-8 py-8">
      <AssetsGrid groups={groups} total={total} />
    </div>
  )
}
