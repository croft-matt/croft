import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/sign-in')
  }

  return user
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Returns the workspace ID for the current user.
// Uses React cache() so duplicate calls within the same request are free.
export const getWorkspaceId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single()

  return data?.workspace_id ?? null
})

// Validates redirect targets to prevent open redirect attacks.
// Only allows relative paths starting with / but not //.
export function safeRelativePath(path: string | null | undefined): string {
  if (!path) return '/'
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}
