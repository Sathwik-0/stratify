// lib/groq/investment-pass.ts
import { callGroq, TEMPERATURES, TOKEN_BUDGETS, budgetClusters, makeAttribution } from './client'
import { InvestmentOutputSchema, safeParseWithFallback } from '@/lib/intelligence/schemas'
import { nowISO } from '@/lib/intelligence'
import { meetsSourceDiversityMinimum } from '@/lib/intelligence/signals'
import { logTelemetry } from '@/lib/quality-gate'
import type { EvidenceRef, StrategicContext } from '@/lib/intelligence/types'
import type { InvestmentOutput } from '@/lib/intelligence/schemas'

export async function generateInvestmentAnalysis(
  companyName:      string,
  clusters:         any[],
  strategicContext: StrategicContext,
  evidenceRefs:     EvidenceRef[]
): Promise<(InvestmentOutput & { sourceDiversityMinimumMet: boolean; modelAttribution: any }) | null> {
  const diversityMet   = meetsSourceDiversityMinimum(evidenceRefs)
  const budgeted       = budgetClusters(clusters, 180)
  const clusterSummary = budgeted.map(c => `- ${c.cluster_name}: ${c.summary}`).join('\n')

  const contextBlock = `
Strategic context (your analysis MUST align — no contradictions):
- Market score: ${strategicContext.marketScore}/10 · Moat: ${strategicContext.moatScore}/10
- Growth risk: ${strategicContext.growthRisk} · Revenue impact: ${strategicContext.revenueImpactScore}
- Strongest advantage: ${strategicContext.strongestAdvantage}
- Biggest threat: ${strategicContext.biggestThreat}`

  let raw: unknown
  try {
    raw = await callGroq(
      `You are a pre-seed and seed stage investor doing rapid due diligence. You think asymmetrically — bull case and bear case, not balanced summaries. Return ONLY valid JSON. No markdown.`,
      `Company: ${companyName}
${contextBlock}

Behavioral signals:
${clusterSummary}

Source diversity met: ${diversityMet}. ${!diversityMet ? 'Single source — discount conviction accordingly.' : ''}

{
  "conviction_score": 72,
  "recommendation": "conditional_yes",
  "confidence_explanation": "Specific: why this conviction, what evidence, what would change it",
  "investor_readiness": {
    "market_clarity":       { "score": 7, "rationale": "one sentence" },
    "moat_strength":        { "score": 6, "rationale": "one sentence" },
    "scalability":          { "score": 7, "rationale": "one sentence" },
    "retention_confidence": { "score": 5, "rationale": "one sentence" },
    "founder_credibility":  { "score": 0, "rationale": "insufficient data from reviews" }
  },
  "bull_case": { "thesis": "...", "key_points": ["...", "..."], "scenario": "..." },
  "bear_case": { "thesis": "...", "key_points": ["...", "..."], "scenario": "..." }
}`,
      TEMPERATURES.investment,
      TOKEN_BUDGETS.investment,
      'investment_analysis'
    )
  } catch (e: any) {
    logTelemetry({ eventType: 'pass_failed', passName: 'investment_analysis', latencyMs: 0, error: e.message, timestamp: nowISO() })
    return null
  }

  const fallback: InvestmentOutput = {
    conviction_score:       diversityMet ? 50 : 35,
    recommendation:         'watchlist',
    confidence_explanation: 'Insufficient data quality for reliable investment assessment',
    investor_readiness:     { market_clarity: { score: 5, rationale: 'fallback' }, moat_strength: { score: 5, rationale: 'fallback' }, scalability: { score: 5, rationale: 'fallback' }, retention_confidence: { score: 5, rationale: 'fallback' }, founder_credibility: { score: 0, rationale: 'no data' } },
    bull_case: { thesis: 'Strong user base if retention improves', key_points: ['Existing scale'], scenario: 'Retention strengthens with product improvements' },
    bear_case: { thesis: 'Fragile retention leads to collapse', key_points: ['Pricing dependency'], scenario: 'Retention collapses as discounts are reduced' },
  }

  const { result, valid, errors } = safeParseWithFallback(InvestmentOutputSchema, normalizeInvestmentRaw(raw), 'investment_analysis', fallback)
  if (!valid) logTelemetry({ eventType: 'zod_validation_failed', passName: 'investment_analysis', latencyMs: 0, error: errors.slice(0, 3).join('; '), timestamp: nowISO() })

  const ir = result.investor_readiness
  const overallScore = Math.round(
    (ir.market_clarity.score + ir.moat_strength.score + ir.scalability.score + ir.retention_confidence.score + ir.founder_credibility.score) / 5
  )

  return {
    ...result,
    investor_readiness: { ...result.investor_readiness, overall_score: overallScore } as any,
    sourceDiversityMinimumMet: diversityMet,
    modelAttribution:          makeAttribution('investment', TEMPERATURES.investment),
  }
}

function normalizeInvestmentRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const normalized: any = { ...(raw as any) }
  const recommendation = String(normalized.recommendation ?? '').toLowerCase().trim()
  const recommendationMap: Record<string, InvestmentOutput['recommendation']> = {
    yes: 'strong_yes',
    strong: 'strong_yes',
    strong_yes: 'strong_yes',
    conditional: 'conditional_yes',
    conditional_yes: 'conditional_yes',
    conditional_no: 'watchlist',
    maybe: 'watchlist',
    hold: 'watchlist',
    watch: 'watchlist',
    watchlist: 'watchlist',
    no: 'pass',
    pass: 'pass',
  }

  if (recommendationMap[recommendation]) {
    normalized.recommendation = recommendationMap[recommendation]
  }

  return normalized
}
