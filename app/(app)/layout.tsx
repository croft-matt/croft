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
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  const workspaceId = (member?.workspace_id as string | undefined) ?? ''
  const rooms = workspaceId ? await getRoomsTree(workspaceId) : []

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar">
      <Sidebar rooms={rooms} />
      <div className="flex flex-1 flex-col py-2 pr-2 min-h-0">
        <main className="flex-1 bg-background border border-border rounded-3xl overflow-y-auto">
          {children}
        </main>
      </div>
      {/* JobModal renders via createPortal into document.body — position in tree does not matter */}
      <JobModal />
    </div>
  )
}
