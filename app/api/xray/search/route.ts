// app/api/xray/search/route.ts
// Replaced Apify search with google-play-scraper (free, no API key needed).
// Returns clean 404 if app not found — no fake fallback IDs.
export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { searchApp } from '@/lib/scraper'
import { getXrayFreshness } from '@/lib/xray-cache'

export async function POST(req: NextRequest) {
  try {
    const { companyName } = await req.json()
    if (!companyName?.trim()) {
      return Response.json({ error: 'Company name required' }, { status: 400 })
    }

    const name = companyName.trim()
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    // 1. Check if already in DB
    const { data: existing } = await supabaseAdmin
      .from('companies')
      .select('*')
      .eq('slug', slug)
      .single()

    if (existing) {
      const { data: cached } = await supabaseAdmin
        .from('xray_results')
        .select('id, created_at, generated_at')
        .eq('company_id', existing.id)
        .single()

      return Response.json({
        found: true,
        company: existing,
        isNew: false,
        existingAnalysis: !!cached,
        analyzedAt: cached ? getXrayFreshness(cached).analyzedAt : null,
        freshness: cached ? getXrayFreshness(cached) : null,
      })
    }

    // 2. Search Play Store using google-play-scraper (free, no API key)
    const appInfo = await searchApp(name)

    const appId     = appInfo?.appId ?? null
    const foundName = appInfo?.title ?? name

    // 3. No fake fallback IDs — if not found, return clean 404
    if (!appId) {
      return Response.json({
        found: false,
        error: `Could not find "${name}" on Google Play Store. Try the exact app name.`,
        isNew: false,
      }, { status: 404 })
    }

    // 4. Insert new company into DB
    const { data: newCompany, error } = await supabaseAdmin
      .from('companies')
      .insert({
        slug,
        name:           foundName,
        category:       'Consumer App',
        app_id_android: appId,
        description:    `${foundName} — added via user search`,
        is_custom:      true,
      })
      .select()
      .single()

    if (error) throw error

    return Response.json({ found: true, company: newCompany, isNew: true })

  } catch (err: any) {
    console.error('[search] error:', err)
    return Response.json({ error: 'Search failed' }, { status: 500 })
  }
}
