// app/api/compare/route.ts
// Fixed: full try/catch, Zod-validated compareCompanies output,
// no more bare crashes on Groq failure.
import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { compareCompanies } from '@/lib/groq'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { normalizeXrayResult } from '@/lib/xray-normalize'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { slugA, slugB } = body as { slugA?: string; slugB?: string }

    if (!slugA || !slugB) {
      return Response.json({ error: 'Both slugs required' }, { status: 400 })
    }

    if (slugA === slugB) {
      return Response.json({ error: 'Cannot compare a company with itself' }, { status: 400 })
    }

    // Fetch both companies in parallel
    const [{ data: compA, error: errA }, { data: compB, error: errB }] = await Promise.all([
      supabaseAdmin.from('companies').select('*').eq('slug', slugA).single(),
      supabaseAdmin.from('companies').select('*').eq('slug', slugB).single(),
    ])

    if (errA || !compA) return Response.json({ error: `Company not found: ${slugA}` }, { status: 404 })
    if (errB || !compB) return Response.json({ error: `Company not found: ${slugB}` }, { status: 404 })

    // Check compare cache
    const { data: cached } = await supabaseAdmin
      .from('compare_cache')
      .select('*')
      .or(`and(company_a_id.eq.${compA.id},company_b_id.eq.${compB.id}),and(company_a_id.eq.${compB.id},company_b_id.eq.${compA.id})`)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cached) {
      return Response.json({ ...cached.result, source: 'cache' })
    }

    const { allowed, limit, bypassed, bypassReason } = await checkRateLimit(req, '/api/compare')
    if (!allowed) return rateLimitResponse(limit)

    // Fetch both X-Ray results in parallel
    const [{ data: xrayA }, { data: xrayB }] = await Promise.all([
      supabaseAdmin.from('xray_results').select('*').eq('company_id', compA.id).single(),
      supabaseAdmin.from('xray_results').select('*').eq('company_id', compB.id).single(),
    ])

    if (!xrayA || !xrayB) {
      return Response.json({
        error: 'One or both companies have not been analyzed yet',
        needsAnalysis: [
          !xrayA ? slugA : null,
          !xrayB ? slugB : null,
        ].filter(Boolean),
      }, { status: 422 })
    }

    // Run AI comparison — now returns { result, valid, errors }
    const { result: comparison, valid, errors: validationErrors } = await compareCompanies(
      compA.name, xrayA as Record<string, unknown>,
      compB.name, xrayB as Record<string, unknown>
    )

    const result = {
      companyA:         { company: compA, xray: normalizeXrayResult(xrayA) },
      companyB:         { company: compB, xray: normalizeXrayResult(xrayB) },
      comparison,
      zodValid:         valid,
      validationErrors: valid ? undefined : validationErrors,
      source:           'fresh',
      rateLimit:        { bypassed: !!bypassed, bypassReason },
    }

    // Cache for 3 days — fire-and-forget, don't block response
    supabaseAdmin.from('compare_cache').insert({
      company_a_id: compA.id,
      company_b_id: compB.id,
      result,
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    }).then(({ error: cacheErr }) => {
      if (cacheErr) console.error('[compare] Cache write failed:', cacheErr.message)
    })

    return Response.json(result)

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/compare] Unhandled error:', message)
    return Response.json(
      { error: 'Comparison failed. Please try again.', detail: message },
      { status: 500 }
    )
  }
}
