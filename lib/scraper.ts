// lib/scraper.ts
// Thin compatibility shim — delegates to the provider layer.
// The google-play provider (lib/providers/google-play.ts) holds the real logic.
// Keep this file for any legacy imports that still reference lib/scraper directly.
export const runtime = 'nodejs'

import { googlePlayProvider } from '@/lib/providers/google-play'
import { generateCorrelationId } from '@/lib/correlation'

export interface Review  { text: string; rating: number | null }
export interface AppInfo { appId: string; title: string; summary?: string; score?: number; reviews?: number }

export async function searchApp(companyName: string): Promise<AppInfo | null> {
  try {
    const gplay = (await import('google-play-scraper')).default
    const results = await gplay.search({ term: companyName, num: 5, country: 'in', lang: 'en', throttle: 1 })
    if (!results?.length) return null
    const lower = companyName.toLowerCase()
    const best  = results.find((r: any) => r.title?.toLowerCase().includes(lower) || lower.includes(r.title?.toLowerCase() ?? '')) ?? results[0]
    return { appId: best.appId, title: best.title, summary: best.summary, score: best.score, reviews: (best as any).reviews }
  } catch (err) {
    console.error('[scraper] searchApp failed:', err)
    return null
  }
}

export async function fetchReviews(appId: string, count = 500): Promise<Review[]> {
  const corrId = generateCorrelationId(appId)
  const result = await googlePlayProvider.fetch({ appId, companyName: appId, maxItems: count, correlationId: corrId })
  if (result.errorCode || result.evidence.length === 0) return []
  return result.evidence.map(e => ({ text: e.text, rating: e.rating ?? null }))
}

export async function fetchAppInfo(appId: string): Promise<AppInfo | null> {
  try {
    const gplay = (await import('google-play-scraper')).default
    const app = await gplay.app({ appId, country: 'in', lang: 'en' })
    return { appId: app.appId, title: app.title, summary: app.summary, score: app.score, reviews: app.reviews }
  } catch (err) {
    console.error(`[scraper] fetchAppInfo failed for ${appId}:`, err)
    return null
  }
}
