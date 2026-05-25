'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

export async function updateThemePreference(
  theme: 'light' | 'dark' | 'system'
) {
  const user = await requireUser()
  const supabase = await createClient()

  await supabase
    .from('workspace_members')
    .update({ theme_preference: theme })
    .eq('user_id', user.id)

  revalidatePath('/settings/appearance')
}
