// lib/groq/pass1-classify.ts
import { callGroq, TEMPERATURES, TOKEN_BUDGETS } from './client'
import { Pass1OutputSchema, safeParseWithFallback } from '@/lib/intelligence/schemas'
import { nowISO } from '@/lib/intelligence'
import { logTelemetry } from '@/lib/quality-gate'
import type { Pass1Output } from '@/lib/intelligence/schemas'

export async function classifySignals(texts: string[]): Promise<Pass1Output> {
  const fallback = classifySignalsLocally(texts)
  const sample = texts
    .slice(0, 45)
    .map((t, i) => `${i + 1}. ${compactReview(t, 70)}`)
    .join('\n')

  let raw: unknown
  try {
    raw = await callGroq(
      `You are a signal classifier for an investor-grade business intelligence platform. Classify reviews precisely. Return ONLY a JSON array. No markdown.`,
      `Signal types: retention | churn | pricing | trust | competitor | strategic

Reviews:
${sample}

Return JSON array (max 35 items):
[{
  "text": "short text under 60 chars",
  "signal_type": "retention",
  "key_phrase": "specific memorable phrase",
  "confidence": 0.8
}]`,
      TEMPERATURES.classify,
      TOKEN_BUDGETS.pass1_classify,
      'pass1_classify'
    )
  } catch (e: any) {
    logTelemetry({ eventType: 'pass_failed', passName: 'pass1_classify', latencyMs: 0, error: e.message, timestamp: nowISO() })
    logTelemetry({ eventType: 'fallback_used', passName: 'pass1_classify', latencyMs: 0, error: `local_classifier_used:${fallback.length}`, timestamp: nowISO() })
    return fallback
  }

  // Doc 8 #1 - Zod validation immediately after parse
  const { result, valid, errors } = safeParseWithFallback(Pass1OutputSchema, raw, 'pass1_classify', fallback)
  if (!valid) {
    logTelemetry({ eventType: 'zod_validation_failed', passName: 'pass1_classify', latencyMs: 0, error: errors.slice(0, 3).join('; '), timestamp: nowISO() })
  }

  const normalized = result.map(r => ({ ...r, confidence: r.confidence ?? 0.7 })).slice(0, 50)
  if (texts.length > 0 && normalized.length === 0) {
    logTelemetry({ eventType: 'fallback_used', passName: 'pass1_classify', latencyMs: 0, error: `empty_model_output_local_classifier_used:${fallback.length}`, timestamp: nowISO() })
    return fallback
  }
  return normalized
}

function compactReview(text: string, limit: number) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

function classifySignalsLocally(texts: string[]): Pass1Output {
  const buckets: Array<{ signal_type: Pass1Output[number]['signal_type']; keywords: string[]; phrase: string; confidence: number }> = [
    { signal_type: 'trust', keywords: ['fraud', 'scam', 'kyc', 'blocked', 'security', 'safe', 'trust', 'support', 'refund', 'failed'], phrase: 'trust and support friction', confidence: 0.68 },
    { signal_type: 'churn', keywords: ['uninstall', 'switch', 'worst', 'bad', 'crash', 'not working', 'bug', 'slow', 'hang', 'issue'], phrase: 'usage-breaking friction', confidence: 0.64 },
    { signal_type: 'pricing', keywords: ['fee', 'fees', 'price', 'charge', 'charges', 'cost', 'expensive', 'discount', 'cashback', 'commission'], phrase: 'pricing sensitivity', confidence: 0.64 },
    { signal_type: 'competitor', keywords: ['better than', 'paytm', 'gpay', 'google pay', 'amazon', 'swiggy', 'zomato', 'zepto', 'cred', 'competitor'], phrase: 'competitive comparison', confidence: 0.62 },
    { signal_type: 'retention', keywords: ['love', 'best', 'easy', 'fast', 'useful', 'smooth', 'daily', 'always', 'good app', 'excellent'], phrase: 'habit and satisfaction', confidence: 0.66 },
    { signal_type: 'strategic', keywords: ['business', 'merchant', 'delivery', 'loan', 'upi', 'payment', 'wallet', 'order', 'subscription', 'premium'], phrase: 'business model signal', confidence: 0.61 },
  ]

  const signals: Pass1Output = []
  for (const text of texts) {
    const cleaned = compactReview(text, 120)
    if (!cleaned) continue
    const lower = cleaned.toLowerCase()
    const match = buckets.find(bucket => bucket.keywords.some(keyword => lower.includes(keyword)))
    const bucket = match ?? { signal_type: 'strategic' as const, phrase: 'generic usage signal', confidence: 0.52 }
    signals.push({
      text: compactReview(cleaned, 60),
      signal_type: bucket.signal_type,
      key_phrase: bucket.phrase,
      confidence: bucket.confidence,
    })
    if (signals.length >= 45) break
  }

  return signals
}
