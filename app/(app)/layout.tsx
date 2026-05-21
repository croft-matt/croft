import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/nav/sidebar'
import { JobModal } from '@/components/job-modal/job-modal'
import { getRoomsTree } from '@/lib/queries/cockpit'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(name)')
    .eq('user_id', user.id)
    .single()

  const workspaceId = (member?.workspace_id as string | undefined) ?? ''
  const workspaceName =
    (member?.workspaces as { name: string } | null)?.name ?? 'Croft'

  const rooms = workspaceId ? await getRoomsTree(workspaceId) : []

  return (
    <div className="flex h-screen overflow-hidden bg-[#111111]">
      <Sidebar
        workspaceName={workspaceName}
        userName={user.email ?? ''}
        rooms={rooms}
      />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      {/* JobModal renders via createPortal into document.body — position in tree does not matter */}
      <JobModal />
    </div>
  )
}
