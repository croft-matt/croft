import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/nav/sidebar'
import { JobModal } from '@/components/job-modal/job-modal'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { NudgeModal } from '@/components/command-palette/nudge-modal'
import { getRoomsTree } from '@/lib/queries/cockpit'
import { AppContent } from '@/components/layout/app-content'

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

  // CommandPalette only needs id and name for room navigation commands.
  const paletteRooms = rooms.map((r) => ({ id: r.id, name: r.name }))

  return (
    <div className="flex h-screen overflow-hidden bg-sidebar">
      <Sidebar rooms={rooms} />
      <AppContent>{children}</AppContent>
      {/* JobModal renders via createPortal into document.body — position in tree does not matter */}
      <JobModal />
      {/* CommandPalette renders a portal dialog, position in tree does not matter */}
      <CommandPalette rooms={paletteRooms} workspaceId={workspaceId} />
      {/* NudgeModal is independent of the palette -- both can be in the layout */}
      <NudgeModal />
    </div>
  )
}
