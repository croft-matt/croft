import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function signOut(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const origin = new URL(request.url).origin
  return NextResponse.redirect(`${origin}/sign-in`, { status: 302 })
}

export async function GET(request: NextRequest) {
  return signOut(request)
}

export async function POST(request: NextRequest) {
  return signOut(request)
}
