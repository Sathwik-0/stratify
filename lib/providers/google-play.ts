// lib/providers/google-play.ts
// Google Play provider adapter using google-play-scraper.
// Implements ProviderAdapter — swap or add providers without touching intelligence engine.

import type {
  ProviderAdapter, ProviderQuery, ProviderResult,
  NormalizedEvidence, ProviderErrorCode,
} from './types'
import crypto from 'crypto'

const SCRAPE_TIMEOUT_MS = 90_000 // 90s hard timeout per fetch

function makeEvidenceId(appId: string, text: string): string {
  return crypto.createHash('sha256').update(`gplay:${appId}:${text.slice(0, 120)}`).digest('hex').slice(0, 16)
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

export const googlePlayProvider: ProviderAdapter = {
  id:          'google_play',
  displayName: 'Google Play Store',

  isAvailable() {
    return true // free, no auth needed
  },

  async fetch(query: ProviderQuery): Promise<ProviderResult> {
    const start = Date.now()
    const { appId, companyName, maxItems = 500, country = 'in', lang = 'en', correlationId } = query

    if (!appId) {
      return {
        providerId:   'google_play',
        appId:        '',
        evidence:     [],
        totalFetched: 0,
        durationMs:   Date.now() - start,
        error:        `No app ID provided for ${companyName}`,
        errorCode:    'app_not_found',
      }
    }

    try {
      // Dynamic import — Node.js only, never runs in edge
      const gplay = (await import('google-play-scraper')).default

      const raw = await withTimeout(
        gplay.reviews({
          appId,
          country,
          lang,
          num:      maxItems,
          sort:     2,
          throttle: 2,
        }),
        SCRAPE_TIMEOUT_MS,
        `google-play reviews(${appId})`
      )

      const data = (raw as any)?.data ?? raw ?? []
      const now  = new Date().toISOString()

      const evidence: NormalizedEvidence[] = (Array.isArray(data) ? data : [])
        .map((r: any) => {
          const text = (r.text ?? r.body ?? '').trim()
          if (text.length < 30) return null
          return {
            id:           makeEvidenceId(appId, text),
            providerId:   'google_play' as const,
            evidenceType: 'review'      as const,
            text,
            rating:       r.score ?? r.rating ?? null,
            sentiment:    null,
            publishedAt:  r.date ? new Date(r.date).toISOString() : undefined,
            retrievedAt:  now,
            metadata:     { correlationId, thumbsUp: r.thumbsUp ?? 0 },
          }
        })
        .filter(Boolean) as NormalizedEvidence[]

      if (evidence.length === 0) {
        return {
          providerId:   'google_play',
          appId,
          evidence:     [],
          totalFetched: Array.isArray(data) ? data.length : 0,
          durationMs:   Date.now() - start,
          error:        `No usable reviews found for ${appId} (${Array.isArray(data) ? data.length : 0} raw items fetched)`,
          errorCode:    'no_reviews_found',
        }
      }

      return {
        providerId:   'google_play',
        appId,
        evidence:     evidence.slice(0, maxItems),
        totalFetched: evidence.length,
        durationMs:   Date.now() - start,
      }
    } catch (err: any) {
      const isTimeout  = err.message?.includes('timed out')
      const errorCode: ProviderErrorCode = isTimeout ? 'scraper_timeout' : 'scraper_internal_error'
      return {
        providerId:   'google_play',
        appId,
        evidence:     [],
        totalFetched: 0,
        durationMs:   Date.now() - start,
        error:        err.message,
        errorCode,
      }
    }
  },
}
