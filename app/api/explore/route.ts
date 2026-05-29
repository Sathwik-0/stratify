import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('explore_cards')
    .select('*, companies(slug, name, category)')
    .order('last_updated', { ascending: false })
  return Response.json({ cards: data || [] })
}

export async function POST(req: NextRequest) {
  const { company_name } = await req.json()
  if (!company_name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 })
  await supabaseAdmin
    .from('company_requests')
    .insert({ company_name: company_name.trim() })
    .select()
  return Response.json({ ok: true })
}
