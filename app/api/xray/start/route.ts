// app/api/xray/start/route.ts
// THE PRIMARY FIX: uses Next.js 16 stable after() to keep execution alive
// after Response is returned on Vercel serverless.
//
// Root cause of timeout: the old fire-and-forget .catch() pattern is killed
// by serverless the moment Response.json() returns. after() guarantees the
// background work runs to completion even after response is sent.
//
// State machine: scraping → scraped (poll route triggers AI pipeline)
export const runtime = 'nodejs'

import { after }        from 'next/server'
import { NextRequest }  from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { fetchEvidence }        from '@/lib/providers/orchestrator'
import { getDefaultProviders }  from '@/lib/providers/registry'
import { generateCorrelationId } from '@/lib/correlation'
import { getXrayFreshness, type RefreshPolicy } from '@/lib/xray-cache'
import type { PipelineErrorCode } from '@/lib/providers/types'

export async function POST(req: NextRequest) {
  try {
    const { slug, forceRefresh = false, refreshPolicy = 'standard' } = await req.json()
    if (!slug) return Response.json({ error: 'slug required' }, { status: 400 })
    const policy = normalizeRefreshPolicy(forceRefresh ? 'force' : refreshPolicy)

    const { data: company, error: compErr } = await supabaseAdmin
      .from('companies').select('*').eq('slug', slug).single()

    if (compErr || !company) {
      return Response.json({ error: 'Company not found' }, { status: 404 })
    }

    // Completed reports should open instantly and never consume rate-limit quota.
    // Future refresh modes can opt into a new analysis with forceRefresh.
    const { data: cached } = await supabaseAdmin
      .from('xray_results').select('id, created_at, generated_at')
      .eq('company_id', company.id).single()

    if (cached && !forceRefresh) {
      const freshness = getXrayFreshness(cached, policy)
      return Response.json({
        jobId: null,
        cached: true,
        slug,
        analyzedAt: freshness.analyzedAt,
        freshness,
        refresh: {
          forceRefreshAvailable: true,
          requestedPolicy: policy,
        },
      })
    }

    // Dedup — return existing active job
    const { data: existingJob } = await supabaseAdmin
      .from('jobs').select('id, status')
      .eq('company_id', company.id)
      .in('status', ['pending', 'scraping', 'scraped', 'classifying', 'analyzing'])
      .order('created_at', { ascending: false })
      .limit(1).single()

    if (existingJob) {
      return Response.json({ jobId: existingJob.id, cached: false, slug })
    }

    const { allowed, limit, bypassed, bypassReason } = await checkRateLimit(req, '/api/xray/start')
    if (!allowed) return rateLimitResponse(limit)

    const correlationId = generateCorrelationId(slug)

    // Create job with correlation ID
    const { data: job, error: jobErr } = await supabaseAdmin
      .from('jobs').insert({
        company_id:       company.id,
        status:           'scraping',
        current_step:     'Collecting Play Store reviews...',
        progress_percent: 10,
        timeout_at:       new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        metadata:         { correlationId, source: 'google_play' },
      }).select().single()

    if (jobErr || !job) throw new Error('Failed to create job')

    // KEY FIX: after() keeps Vercel serverless alive until scraping completes.
    // This replaces the broken fire-and-forget .catch() pattern.
    after(async () => {
      await scrapeAndStore({
        jobId:         job.id,
        appId:         company.app_id_android,
        companyName:   company.name,
        correlationId,
      })
    })

    return Response.json({
      jobId: job.id,
      cached: false,
      slug,
      rateLimit: { bypassed: !!bypassed, bypassReason },
      refresh: { forceRefresh, requestedPolicy: policy },
    })

  } catch (err: any) {
    console.error('[start] error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

function normalizeRefreshPolicy(value: unknown): RefreshPolicy {
  return value === 'premium' || value === 'force' ? value : 'standard'
}

interface ScrapeParams {
  jobId:         string
  appId:         string
  companyName:   string
  correlationId: string
}

async function scrapeAndStore({ jobId, appId, companyName, correlationId }: ScrapeParams) {
  const scrapeStart = Date.now()

  try {
    if (!appId) {
      await failJob(jobId, 'app_not_found',
        `No Google Play app ID found for "${companyName}". Search for the exact app name first.`,
        correlationId
      )
      return
    }

    console.log(`[scrape:${correlationId}] Starting — appId=${appId}`)

    const orchestration = await fetchEvidence(
      getDefaultProviders(),
      { appId, companyName, maxItems: 500, country: 'in', lang: 'en' },
      correlationId
    )

    const durationMs = Date.now() - scrapeStart
    console.log(`[scrape:${correlationId}] Done — ${orchestration.evidence.length} items in ${durationMs}ms`)

    // All providers returned errors
    if (orchestration.evidence.length === 0) {
      const primaryError = orchestration.errors[0]
      const code         = primaryError?.code ?? 'no_reviews_found'
      const msg          = buildUserFacingError(code, appId, companyName)

      await failJob(jobId, code, msg, correlationId, {
        providerErrors: orchestration.errors,
        durationMs,
        appId,
      })
      return
    }

    // Normalize to the review shape the poll route expects
    const reviews = orchestration.evidence.map(e => ({
      text:   e.text,
      rating: e.rating ?? null,
    }))

    await supabaseAdmin.from('jobs').update({
      status:           'scraped',
      current_step:     `Extracted ${reviews.length} reviews. Starting AI analysis...`,
      progress_percent: 30,
      metadata: {
        correlationId,
        reviews,
        review_count:    reviews.length,
        scraped_at:      new Date().toISOString(),
        scrape_duration: durationMs,
        source:          'google_play',
        provider_results: orchestration.providerResults.map(r => ({
          providerId:   r.providerId,
          totalFetched: r.totalFetched,
          durationMs:   r.durationMs,
          error:        r.error,
          errorCode:    r.errorCode,
        })),
      },
    }).eq('id', jobId)

  } catch (err: any) {
    console.error(`[scrape:${correlationId}] Unhandled error:`, err)
    const code = err.message?.includes('timed out') ? 'scraper_timeout' : 'scraper_internal_error'
    await failJob(jobId, code, err.message, correlationId)
  }
}

async function failJob(
  jobId:         string,
  code:          PipelineErrorCode,
  message:       string,
  correlationId: string,
  meta?:         Record<string, unknown>
) {
  try {
    await supabaseAdmin.from('jobs').update({
      status:        'failed',
      error_message: message,
      completed_at:  new Date().toISOString(),
      metadata: {
        correlationId,
        error_code:  code,
        failed_at:   new Date().toISOString(),
        ...meta,
      },
    }).eq('id', jobId)
  } catch (e) {
    console.error(`[scrape:${correlationId}] Failed to persist error to DB:`, e)
  }
}

function buildUserFacingError(code: PipelineErrorCode, appId: string, companyName: string): string {
  const map: Record<string, string> = {
    app_not_found:          `Could not find "${companyName}" on Google Play. Try searching with the exact app name.`,
    no_reviews_found:       `"${companyName}" (${appId}) has no public reviews on Google Play, or they are restricted.`,
    scraper_timeout:        `Google Play took too long to respond for "${companyName}". This is usually temporary — try again in a few minutes.`,
    rate_limited:           `Google Play is rate-limiting requests. Wait 2–3 minutes and try again.`,
    scraper_internal_error: `Scraping failed for "${companyName}". The app may have restricted reviews or an unusual app ID.`,
  }
  return map[code] ?? `Intelligence extraction failed for "${companyName}". Try again or use a different app name.`
}
