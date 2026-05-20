import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Service-role client: bypasses RLS.
// Only use in server-side admin operations: webhooks, cron jobs, Trigger.dev jobs.
// Never expose to client code or pass to the browser.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
