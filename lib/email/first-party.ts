import type { SupabaseClient } from '@supabase/supabase-js'

export type EmailSource = 'inbound' | 'user_cc' | 'user_direct'

// Determines how an email arrived at Croft's inbound address.
//
// An email is first-party if its from address matches a connected email account
// in the workspace. The position of Croft's receiving address (in `to` vs `cc`)
// distinguishes user_direct from user_cc:
//
//   user_direct : Matt emailed Croft directly. Croft is in `to`.
//   user_cc     : Matt sent an email to a third party and CC'd Croft. Croft is in `cc`.
//   inbound     : Email from a third party. Normal pipeline.
//
// croftAddress is the address that triggered routing -- either workspaces.receiving_address
// (Path 1, Gmail forwarding) or CROFT_FIRST_PARTY_ADDRESS (Path 2, friendly address).
export async function detectSource(
  workspaceId: string,
  fromAddress: string,
  toAddresses: string[],
  ccAddresses: string[],
  croftAddress: string,
  supabase: SupabaseClient
): Promise<EmailSource> {
  const { data: account } = await supabase
    .from('email_accounts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email_address', fromAddress)
    .maybeSingle()

  if (!account) return 'inbound'

  const croft = croftAddress.toLowerCase()
  if (toAddresses.includes(croft)) return 'user_direct'
  if (ccAddresses.includes(croft)) return 'user_cc'

  // from is a connected user but Croft's address is in neither to nor cc
  // (e.g. BCC, or a misconfigured payload). Fall back to inbound -- conservative.
  return 'inbound'
}
