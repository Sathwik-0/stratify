// lib/intelligence/index.ts — barrel export
export * from './types'
export * from './schemas'
export * from './signals'
export * from './delta'

import { scoreToLevel, REVENUE_IMPACT_WEIGHTS, type ConfidenceLevel, type StrategicContext, type HorizonRisks } from './types'
import { resolveSignalId } from './signals'

export function nowISO(): string { return new Date().toISOString() }

export function normalizeCompanyName(raw: string): string {
  const ALIASES: Record<string, string> = {
    'swiggy india':'Swiggy','swiggy pvt ltd':'Swiggy','swiggy pvt':'Swiggy',
    'zomato india':'Zomato','zomato pvt':'Zomato','zerodha broking':'Zerodha',
    'phonepe pvt':'PhonePe','phonepe india':'PhonePe','cred fintech':'CRED',
    'meesho online':'Meesho','groww securities':'Groww','groww invest':'Groww',
  }
  return ALIASES[raw.toLowerCase().trim()] ?? raw.trim()
}

export function deriveStrategicContext(companyName: string, analysis: any, confidenceScore: number): StrategicContext {
  const moatStrength = (analysis.moat_analysis?.strength ?? '').toLowerCase()
  const riskLevel    = (analysis.failure_surface?.risk_level ?? 'medium').toLowerCase()
  const demandType   = (analysis.demand_quality?.demand_type ?? '').toLowerCase()
  const dominantSignal = analysis.money_engine?.evidence ? resolveSignalId(analysis.money_engine.evidence) : 'unknown_signal'
  const growthRisk: StrategicContext['growthRisk'] =
    riskLevel === 'critical' ? 'critical' : riskLevel === 'high' ? 'high' : riskLevel === 'medium' ? 'medium' : 'low'
  return {
    companyName,
    marketScore:        analysis.moat_analysis?.defensibility ?? 5,
    moatScore:          moatStrength.includes('grow') ? 7 : moatStrength.includes('erod') ? 3 : 5,
    growthRisk,
    pricingWeakness:    demandType.includes('discount') ? 'severe' : demandType.includes('habit') ? 'none' : 'moderate',
    retentionRisk:      riskLevel === 'high' || riskLevel === 'critical' ? 'high' : 'medium',
    strongestAdvantage: analysis.moat_analysis?.headline ?? 'Scale advantage',
    biggestThreat:      analysis.failure_surface?.headline ?? 'Competitive pressure',
    confidenceLevel:    scoreToLevel(confidenceScore),
    revenueImpactScore: REVENUE_IMPACT_WEIGHTS[dominantSignal] ?? 0.5,
  }
}

export function categoriseHorizonRisks(analysis: Record<string, any>): HorizonRisks {
  const short: string[] = [], medium: string[] = [], long: string[] = []
  if (analysis.failure_surface?.early_signals)       short.push(analysis.failure_surface.early_signals)
  if (analysis.retention_architecture?.vulnerable_segment) medium.push(`Vulnerable segment: ${analysis.retention_architecture.vulnerable_segment}`)
  if (analysis.demand_quality?.complaint_pattern)    short.push(analysis.demand_quality.complaint_pattern)
  if (analysis.demand_quality?.unmet_need)           medium.push(analysis.demand_quality.unmet_need)
  if ((analysis.moat_analysis?.strength ?? '').toLowerCase().includes('erod')) long.push(analysis.moat_analysis.headline ?? 'Moat erosion risk')
  if (analysis.moat_analysis?.replication_cost)     long.push(`Replication risk: ${analysis.moat_analysis.replication_cost}`)
  if (analysis.strategic_opportunity?.why_incumbent_cant_respond) medium.push(analysis.strategic_opportunity.why_incumbent_cant_respond)
  return { short, medium, long }
}

export function detectNarrativeInflation(text: string): { inflated: boolean; phrases: string[] } {
  const PHRASES = ['will dominate','poised to lead','game-changing','revolutionary','unprecedented growth','clearly winning','undoubtedly','certainly will','guaranteed to']
  const lower = text.toLowerCase()
  const found = PHRASES.filter(p => lower.includes(p))
  return { inflated: found.length > 0, phrases: found }
}

export function repairJSON(raw: string): { parsed: unknown; repaired: boolean; error?: string } {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim()
  const fb = cleaned.indexOf('{'), fb2 = cleaned.indexOf('[')
  let start = -1
  if (fb !== -1 && (fb2 === -1 || fb < fb2)) start = fb
  else if (fb2 !== -1) start = fb2
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
  if (start === -1 || end === -1) return { parsed: null, repaired: false, error: 'No JSON boundaries found' }
  const jsonStr = cleaned.slice(start, end + 1)
  try { return { parsed: JSON.parse(jsonStr), repaired: false } } catch {
    try {
      const fixed = jsonStr.replace(/,\s*}/g,'}').replace(/,\s*]/g,']').replace(/([{,]\s*)(\w+):/g,'$1"$2":')
      return { parsed: JSON.parse(fixed), repaired: true }
    } catch (e2: any) { return { parsed: null, repaired: false, error: `Repair failed: ${e2.message}` } }
  }
}
