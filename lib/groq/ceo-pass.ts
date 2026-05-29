// lib/groq/ceo-pass.ts
import { callGroq, TEMPERATURES, TOKEN_BUDGETS, budgetClusters, makeAttribution } from './client'
import { CeoPlaybookOutputSchema, safeParseWithFallback } from '@/lib/intelligence/schemas'
import { nowISO, OUTPUT_CONSTRAINTS } from '@/lib/intelligence'
import { logTelemetry } from '@/lib/quality-gate'
import type { StrategicContext } from '@/lib/intelligence/types'
import type { CeoPlaybookOutput } from '@/lib/intelligence/schemas'

export async function generateCeoPlaybook(
  companyName:     string,
  clusters:        any[],
  strategicContext: StrategicContext
): Promise<(CeoPlaybookOutput & { groundedIn: string[]; strategicContext: StrategicContext; modelAttribution: any }) | null> {
  const budgeted = budgetClusters(clusters, 200)
  const clusterSummary = budgeted.map(c => `- ${c.cluster_name}: ${c.summary}`).join('\n')

  const contextBlock = `
Strategic context (your recommendations MUST align — no contradictions):
- Market score: ${strategicContext.marketScore}/10
- Moat score: ${strategicContext.moatScore}/10
- Growth risk: ${strategicContext.growthRisk}
- Pricing weakness: ${strategicContext.pricingWeakness}
- Retention risk: ${strategicContext.retentionRisk}
- Revenue impact score: ${strategicContext.revenueImpactScore}
- Strongest advantage: ${strategicContext.strongestAdvantage}
- Biggest threat: ${strategicContext.biggestThreat}
- Confidence: ${strategicContext.confidenceLevel}`

  let raw: unknown
  try {
    raw = await callGroq(
      `You are an operating partner at a top-tier VC firm. You give opinionated, specific, resource-aware recommendations. Never give generic advice. Never contradict the strategic context provided. Return ONLY valid JSON. No markdown.`,
      `Company: ${companyName}
${contextBlock}

Behavioral clusters:
${clusterSummary}

Resource constraints (HARD):
- 6 months runway · 8 engineers · No enterprise sales team · B2C focused

Return EXACTLY 3 actions, ranked by leverage (1=highest). Tie each to a specific cluster.
{
  "headline": "If I were CEO of ${companyName} for 90 days...",
  "context": "One sentence framing why these 3 actions",
  "actions": [
    { "rank": 1, "timeframe": "0-30 days", "action": "Imperative: specific thing", "rationale": "Grounded in [cluster]: why", "impact": "high", "evidenceRef": "cluster name" },
    { "rank": 2, "timeframe": "30-60 days", "action": "Imperative", "rationale": "Grounded in [cluster]: why", "impact": "high", "evidenceRef": "cluster name" },
    { "rank": 3, "timeframe": "60-90 days", "action": "Imperative", "rationale": "Grounded in [cluster]: why", "impact": "medium", "evidenceRef": "cluster name" }
  ],
  "biggest_risk_ignored": "What most CEOs in this position miss",
  "unfair_advantage": "One thing no competitor can copy quickly"
}`,
      TEMPERATURES.ceo,
      TOKEN_BUDGETS.ceo_playbook,
      'ceo_playbook'
    )
  } catch (e: any) {
    logTelemetry({ eventType: 'pass_failed', passName: 'ceo_playbook', latencyMs: 0, error: e.message, timestamp: nowISO() })
    return null
  }

  const { result, valid, errors } = safeParseWithFallback(CeoPlaybookOutputSchema, raw, 'ceo_playbook', {
    headline: `If I were CEO of ${companyName} for 90 days...`,
    context:  'Based on available signal data',
    actions:  [{ rank: 1, timeframe: '0-30 days', action: 'Audit pricing dependency', rationale: 'Address dominant retention risk', impact: 'high' as const, evidenceRef: clusters[0]?.cluster_name ?? 'signals' }],
    biggest_risk_ignored: 'Retention fragility masked by growth metrics',
    unfair_advantage:     'Existing user base trust',
  })
  if (!valid) logTelemetry({ eventType: 'zod_validation_failed', passName: 'ceo_playbook', latencyMs: 0, error: errors.slice(0, 3).join('; '), timestamp: nowISO() })

  return {
    ...result,
    actions:           result.actions.slice(0, OUTPUT_CONSTRAINTS.maxCeoActions),
    groundedIn:        budgeted.map((c: any) => c.cluster_name),
    strategicContext,
    modelAttribution:  makeAttribution('ceo', TEMPERATURES.ceo),
  }
}
