// lib/groq/pass2-cluster.ts
import { callGroq, TEMPERATURES, TOKEN_BUDGETS } from './client'
import { Pass2OutputSchema, safeParseWithFallback } from '@/lib/intelligence/schemas'
import { nowISO } from '@/lib/intelligence'
import { logTelemetry } from '@/lib/quality-gate'
import type { Pass2Output } from '@/lib/intelligence/schemas'

export async function clusterSignals(signals: any[], companyName: string): Promise<Pass2Output> {
  const signalText = signals
    .slice(0, 50)
    .map(s => `[${s.signal_type}] ${(s.key_phrase || s.text || '').slice(0, 60)}`)
    .join('\n')

  let raw: unknown
  try {
    raw = await callGroq(
      `You are a behavioral pattern analyst for pre-seed and seed investor due diligence. Find non-obvious clusters. Return ONLY valid JSON array. No markdown.`,
      `Company: ${companyName}

Signals:
${signalText}

Return 4-5 specific behavioral clusters. Each cluster must have a SPECIFIC non-generic name.
[{
  "cluster_name": "Discount-Driven Retention",
  "percentage": 34,
  "signal_types": ["retention","pricing"],
  "summary": "Users only re-order when coupons are available — price-conditional loyalty",
  "evidence_count": 28,
  "business_implication": "Retention is price-dependent, not habit-driven",
  "trend": "rising",
  "confidence": 0.78
}]`,
      TEMPERATURES.cluster,
      TOKEN_BUDGETS.pass2_cluster,
      'pass2_cluster'
    )
  } catch (e: any) {
    logTelemetry({ eventType: 'pass_failed', passName: 'pass2_cluster', latencyMs: 0, error: e.message, timestamp: nowISO() })
    return []
  }

  const FALLBACK: Pass2Output = []
  const { result, valid, errors } = safeParseWithFallback(Pass2OutputSchema, raw, 'pass2_cluster', FALLBACK)
  if (!valid) {
    logTelemetry({ eventType: 'zod_validation_failed', passName: 'pass2_cluster', latencyMs: 0, error: errors.slice(0, 3).join('; '), timestamp: nowISO() })
  }
  return result.map(r => ({ ...r, confidence: r.confidence ?? 0.7, signal_types: r.signal_types ?? [], evidence_count: r.evidence_count ?? 0, trend: r.trend ?? 'unknown' })).slice(0, 5)
}
