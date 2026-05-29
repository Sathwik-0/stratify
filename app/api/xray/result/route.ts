import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { normalizeXrayResult } from '@/lib/xray-normalize'
import { getXrayFreshness } from '@/lib/xray-cache'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return Response.json({ error: 'slug required' }, { status: 400 })

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!company) return Response.json({ error: 'Not found' }, { status: 404 })

  const { data: result } = await supabaseAdmin
    .from('xray_results')
    .select('*')
    .eq('company_id', company.id)
    .single()

  return Response.json({
    company,
    result: normalizeXrayResult(result),
    freshness: getXrayFreshness(result),
  })
}
