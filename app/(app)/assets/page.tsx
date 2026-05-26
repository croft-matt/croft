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
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-foreground">Assets</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {total} {total === 1 ? 'file' : 'files'} across your workspace
        </p>
      </div>

      <AssetsGrid groups={groups} total={total} />
    </div>
  )
}
