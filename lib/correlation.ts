// lib/correlation.ts
// Deterministic correlation ID generation for pipeline tracing.
// Format: strat_{slug}_{timestamp}_{random4}

import crypto from 'crypto'

export function generateCorrelationId(slug: string): string {
  const ts     = Date.now().toString(36)
  const rand   = crypto.randomBytes(2).toString('hex')
  const clean  = slug.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()
  return `strat_${clean}_${ts}_${rand}`
}

export function parseCorrelationId(id: string): { slug?: string; timestamp?: Date } {
  try {
    const parts = id.split('_')
    if (parts.length < 4) return {}
    return {
      slug:      parts[1],
      timestamp: new Date(parseInt(parts[2], 36)),
    }
  } catch {
    return {}
  }
}
