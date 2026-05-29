import type { NormalizedEvidence } from './types'

export interface PlayStoreFallbackApp {
  appId: string
  title: string
  summary: string
  category?: string
}

const FALLBACK_APPS: Record<string, PlayStoreFallbackApp> = {
  zepto: {
    appId: 'com.zeptoconsumerapp',
    title: 'Zepto: 10-Min Grocery Delivery',
    summary: 'Quick commerce grocery delivery app. Google Play scraper retrieval can fail for this package in some environments.',
    category: 'Quick Commerce',
  },
}

export function findPlayStoreFallbackApp(query: string): PlayStoreFallbackApp | null {
  const normalized = query.toLowerCase().trim().replace(/[^a-z0-9.]+/g, ' ')
  if (FALLBACK_APPS[normalized]) return FALLBACK_APPS[normalized]

  return Object.entries(FALLBACK_APPS).find(([key, app]) =>
    normalized.includes(key) ||
    normalized.includes(app.appId.toLowerCase()) ||
    app.title.toLowerCase().includes(normalized)
  )?.[1] ?? null
}

export function buildMetadataOnlyEvidence(params: {
  appId: string
  companyName: string
  description?: string | null
  correlationId: string
  providerError?: string | null
}): NormalizedEvidence[] {
  const now = new Date().toISOString()
  const description = params.description?.trim()
  const base = description && description.length > 20
    ? description
    : `${params.companyName} is a Google Play app. Public review retrieval failed, so this is a metadata-only fallback signal.`

  return [
    {
      id: `metadata_${params.appId.replace(/[^a-z0-9]/gi, '_')}_1`,
      providerId: 'google_play',
      evidenceType: 'signal',
      text: `Metadata-only fallback for ${params.companyName}: ${base}`,
      sentiment: null,
      retrievedAt: now,
      metadata: {
        correlationId: params.correlationId,
        fallback: true,
        fallbackReason: params.providerError ?? 'reviews_unavailable',
      },
    },
    {
      id: `metadata_${params.appId.replace(/[^a-z0-9]/gi, '_')}_2`,
      providerId: 'google_play',
      evidenceType: 'signal',
      text: `${params.companyName} analysis is limited because Google Play review retrieval failed for package ${params.appId}. Treat conclusions as low-confidence operational diagnostics.`,
      sentiment: null,
      retrievedAt: now,
      metadata: {
        correlationId: params.correlationId,
        fallback: true,
        fallbackReason: params.providerError ?? 'reviews_unavailable',
      },
    },
  ]
}
