'use server'

import { createClient } from '@/lib/supabase/server'

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient()

  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null) // no-op if already read
}
