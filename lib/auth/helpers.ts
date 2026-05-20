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

// Validates redirect targets to prevent open redirect attacks.
// Only allows relative paths starting with / but not //.
export function safeRelativePath(path: string | null | undefined): string {
  if (!path) return '/'
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/'
}
