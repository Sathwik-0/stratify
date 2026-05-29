// ─────────────────────────────────────────────────────────────────────────────
// lib/quality-gate.ts
// Structural intelligence quality scoring.
// Replaces naive phrase-blocking with multi-factor structural assessment.
//
// Sources: Documents 4, 5, 7, and final 20 gaps
// ─────────────────────────────────────────────────────────────────────────────

import {
  ConfidenceLevel,
  ConfidenceExplanation,
  SeverityLevel,
  SOURCE_RELIABILITY,
  SOURCE_FRESHNESS_WINDOWS,
  scoreToLevel,
  detectNarrativeInflation,
  OUTPUT_CONSTRAINTS,
} from './intelligence'

// ── Token budgets per pass (Doc 7 final gap #27) ─────────────────────────────
export const TOKEN_BUDGETS = {
  pass1_classify:  500,
  pass2_cluster:   600,
  pass3_analysis:  700,
  ceo_playbook:    400,
  delta_analysis:  350,
  investment:      350,
} as const

// ── Banned phrases (retained as secondary signal, not primary gate) ───────────
const BANNED_PHRASES = [
  'users return because of convenience',
  'wins by offering fast delivery',
  'the weakness is high competition',
  'focus on user experience',
  'strong brand recognition',
  'easy to use interface',
  'seamless experience',
  'robust platform',
  'innovative solution',
  'best in class',
  'world class',
  'leverages technology',
  'user friendly',
  'industry leading',
  'cutting edge',
  'state of the art',
  'revolutionizing',
  'disrupting the market',
  'game changer',
  'holistic approach',
]

// ── Certainty words for narrative inflation check (Doc 7 final gap #18) ───────
const CERTAINTY_INFLATION_WORDS = [
  'definitely', 'certainly', 'undoubtedly', 'clearly', 'obviously', 'guaranteed',
  'will dominate', 'poised to', 'destined to',
]

// ── Structural quality scoring (Doc 4 — exact formula) ───────────────────────
// qualityScore = evidenceDensity×0.3 + specificity×0.2 + contradictionPenalty×(−0.3) + novelty×0.2
export interface StructuralQualityResult {
  qualityScore:        number    // 0–1
  evidenceDensity:     number
  specificity:         number
  contradictionPenalty: number
  novelty:             number
  violations:          string[]  // banned phrases still present
  pass:                boolean   // qualityScore >= 0.5
  inflationDetected:   boolean   // Doc 7 final gap #18
}

export function scoreStructuralQuality(output: Record<string, any>): StructuralQualityResult {
  const sections = ['money_engine', 'retention_architecture', 'moat_analysis', 'demand_quality', 'failure_surface', 'strategic_opportunity']
  const text = JSON.stringify(output).toLowerCase()

  // Evidence density: proportion of sections with non-empty evidenceRefs or evidence string
  const sectionsWithEvidence = sections.filter(s => {
    const sec = output[s]
    if (!sec) return false
    if (Array.isArray(sec.evidenceRefs) && sec.evidenceRefs.length > 0) return true
    if (typeof sec.evidence === 'string' && sec.evidence.trim().length > 3) return true
    return false
  })
  const evidenceDensity = sectionsWithEvidence.length / sections.length

  // Specificity: average headline word count, capped at 1.0 (longer = more specific)
  const headlineLengths = sections
    .map(s => output[s]?.headline ?? '')
    .filter(h => h.length > 0)
    .map(h => Math.min(h.split(' ').length / 12, 1.0))
  const specificity = headlineLengths.length > 0
    ? headlineLengths.reduce((a, b) => a + b, 0) / headlineLengths.length
    : 0.3

  // Banned phrase hits
  const violations = BANNED_PHRASES.filter(p => text.includes(p.toLowerCase()))
  const novelty = 1 - (violations.length / Math.max(BANNED_PHRASES.length, 1))

  // Contradiction penalty: if contradictions exist and are surfaced, that's GOOD
  // Penalty applies when contradictions are suppressed (no contradictions field despite multiple signals)
  const hasContradictions = Array.isArray(output.contradictions) && output.contradictions.length > 0
  const sectionCount = sections.filter(s => output[s]).length
  // Penalise if many sections but no contradictions surfaced (likely suppressed)
  const contradictionPenalty = sectionCount >= 4 && !hasContradictions ? 0.2 : 0

  const qualityScore = Math.min(1, Math.max(0,
    evidenceDensity * 0.3 +
    specificity * 0.2 -
    contradictionPenalty * 0.3 +
    novelty * 0.2
  ))

  // Narrative inflation check
  const { inflated } = detectNarrativeInflation(text)

  return {
    qualityScore,
    evidenceDensity,
    specificity,
    contradictionPenalty,
    novelty,
    violations,
    pass: qualityScore >= 0.5,
    inflationDetected: inflated,
  }
}

// Legacy export kept for backward compatibility with poll/route.ts
export function runQualityGate(output: object): { pass: boolean; violations: string[]; score: number } {
  const result = scoreStructuralQuality(output as Record<string, any>)
  return {
    pass: result.pass,
    violations: result.violations,
    score: Math.round(result.qualityScore * 100),
  }
}

// ── Confidence scoring (Doc 4 + Doc 5 + Doc 7) ────────────────────────────────
export function calculateConfidence({
  reviewCount,
  sourceCount,
  clusterCount,
  signalVariety,
  newsPresent,
  qualityGatePassed,
  dataAgeHours,
  structureValid,
  fullyGrounded,
}: {
  reviewCount:      number
  sourceCount:      number
  clusterCount:     number
  signalVariety:    number
  newsPresent:      boolean
  qualityGatePassed: boolean
  dataAgeHours:     number
  structureValid?:  boolean
  fullyGrounded?:   boolean
}): { score: number; breakdown: Record<string, number>; level: ConfidenceLevel; explanation: ConfidenceExplanation } {

  let score = 35
  const breakdown: Record<string, number> = { base: 35 }

  const reviewScore = reviewCount > 500 ? 15 : reviewCount > 200 ? 10 : reviewCount > 50 ? 5 : 0
  score += reviewScore; breakdown.review_count = reviewScore

  const sourceScore = Math.min((sourceCount - 1) * 10, 20)
  score += sourceScore; breakdown.source_count = sourceScore

  const clusterScore = clusterCount >= 5 ? 10 : clusterCount >= 4 ? 7 : clusterCount >= 3 ? 4 : 0
  score += clusterScore; breakdown.cluster_distinct = clusterScore

  const signalScore = Math.min(signalVariety * 3, 12)
  score += signalScore; breakdown.signal_variety = signalScore

  const newsScore = newsPresent ? 8 : 0
  score += newsScore; breakdown.news_present = newsScore

  const qualityScore = qualityGatePassed ? 6 : -5
  score += qualityScore; breakdown.quality_gate = qualityScore

  // Per-source freshness decay (Doc 7 final gap #6)
  const freshnessWindow = SOURCE_FRESHNESS_WINDOWS['play_store'] ?? 720
  const freshnessScore = dataAgeHours > freshnessWindow ? -15 : dataAgeHours > (freshnessWindow / 2) ? -8 : 0
  score += freshnessScore; breakdown.freshness = freshnessScore

  const structureScore = structureValid === false ? -10 : structureValid === true ? 5 : 0
  score += structureScore; breakdown.structure_valid = structureScore

  const groundingScore = fullyGrounded === false ? -12 : fullyGrounded === true ? 8 : 0
  score += groundingScore; breakdown.evidence_grounding = groundingScore

  const final = Math.min(Math.max(score, 10), 95)
  breakdown.total = final

  // freshnessScore for ConfidenceExplanation (Doc 5 formula)
  const sourceReliability = SOURCE_RELIABILITY['play_store'] ?? 0.65
  const recencyRatio = Math.max(0, 1 - (dataAgeHours / 720))
  const freshnessScoreNorm = recencyRatio * ((final / 100)) * sourceReliability

  const recencyLabel =
    dataAgeHours < 24 ? 'Fresh (< 24h)' :
    dataAgeHours < 168 ? 'Recent (< 1 week)' :
    dataAgeHours < 720 ? 'Aging (< 1 month)' : 'Stale (> 1 month)'

  const level = scoreToLevel(final)

  const explanation: ConfidenceExplanation = {
    supportingSources:   reviewCount,
    sourceDiversity:     sourceCount,
    contradictionLevel:  clusterCount >= 4 ? 'low' : 'medium',
    recency:             recencyLabel,
    corroborationLevel:  sourceCount >= 3 ? 'multi_source_verified' : sourceCount === 2 ? 'partially_verified' : 'single_source',
  }

  return { score: final, breakdown, level, explanation }
}

// ── Freshness score (Doc 5 — exact formula) ───────────────────────────────────
export function calculateFreshnessScore(dataAgeHours: number, confidence: number, sourceType: string = 'play_store'): number {
  const sourceReliability = SOURCE_RELIABILITY[sourceType] ?? 0.5
  const freshnessWindow = SOURCE_FRESHNESS_WINDOWS[sourceType] ?? 720
  const recency = Math.max(0, 1 - (dataAgeHours / freshnessWindow))
  return Math.round(recency * confidence * sourceReliability * 100) / 100
}

// ── Strategic impact scoring (Doc 5 — used for ranking) ──────────────────────
export function rankByStrategicImpact(
  insights: Array<{ severity: number; persistence: number; confidence: number; marketSize?: number }>
): number[] {
  return insights.map(i => {
    const marketSize = i.marketSize ?? 0.5
    const impact = marketSize * i.severity * i.persistence * i.confidence
    return Math.round(impact * 100) / 100
  })
}

// ── Actionability scoring (Doc 7 #23) ────────────────────────────────────────
export function calculateActionabilityScore(specificity: number, evidenceDensity: number, timeHorizon?: 'short' | 'medium' | 'long'): number {
  const horizonWeight = timeHorizon === 'short' ? 1.0 : timeHorizon === 'medium' ? 0.7 : 0.4
  return Math.round(specificity * evidenceDensity * horizonWeight * 100) / 100
}

// ── Signal uniqueness scoring (Doc 7 #24) ────────────────────────────────────
export function calculateUniquenessScore(signalText: string): number {
  const lower = signalText.toLowerCase()
  const hits = BANNED_PHRASES.filter(p => lower.includes(p.toLowerCase())).length
  return Math.max(0, Math.round((1 - hits / Math.max(BANNED_PHRASES.length, 1)) * 100) / 100)
}

// ── Priority decay (Doc 7 #17) ───────────────────────────────────────────────
export function decayWeight(ageHours: number, volatilityScore: number): number {
  // Base decay over 720 hours (1 month). Volatile signals decay faster.
  const decayRate = 0.5 + volatilityScore * 0.5  // 0.5–1.0 based on volatility
  const decay = Math.exp(-decayRate * (ageHours / 720))
  return Math.round(decay * 100) / 100
}

// ── Contradiction escalation (Doc 7 #17) ─────────────────────────────────────
import type { Contradiction, ContradictionSeverity } from './intelligence'

export function escalateContradictions(contradictions: Contradiction[]): {
  maxSeverity: ContradictionSeverity
  confidencePenalty: number
  shouldCollapseConfidence: boolean
} {
  if (contradictions.length === 0) return { maxSeverity: 'minor', confidencePenalty: 0, shouldCollapseConfidence: false }

  const hasThesisBreaking = contradictions.some(c => c.severity === 'thesis_breaking')
  const hasMajor = contradictions.some(c => c.severity === 'major')

  return {
    maxSeverity: hasThesisBreaking ? 'thesis_breaking' : hasMajor ? 'major' : 'minor',
    confidencePenalty: hasThesisBreaking ? 25 : hasMajor ? 10 : 3,
    shouldCollapseConfidence: hasThesisBreaking,  // Doc 7 #17
  }
}

// ── Source weight enforcement (Doc 7 final gap #16) ───────────────────────────
// Ensures high-reliability sources are not dominated by noisy low-reliability ones
export function enforceSourceWeighting(clusters: any[], sourceTypes: Record<string, string[]>): any[] {
  return clusters.map(cluster => {
    const sources = sourceTypes[cluster.cluster_name] ?? ['play_store']
    const avgReliability = sources.reduce((sum, s) => sum + (SOURCE_RELIABILITY[s] ?? 0.5), 0) / sources.length
    return { ...cluster, sourceReliability: avgReliability }
  }).sort((a, b) => b.sourceReliability - a.sourceReliability)
}

// ── Cross-analysis harmonization (Doc 7 #29) ─────────────────────────────────
export interface HarmonizationResult {
  consistent: boolean
  issues:     string[]
}

export function checkCrossAnalysisConsistency(
  analysis: Record<string, any>,
  ceoPlaybook?: any,
  investmentAnalysis?: any
): HarmonizationResult {
  const issues: string[] = []

  const failureRisk = analysis.failure_surface?.risk_level?.toLowerCase() ?? ''
  const moatStrength = analysis.moat_analysis?.strength?.toLowerCase() ?? ''

  // CEO actions must not contradict failure surface
  if (ceoPlaybook?.actions) {
    for (const action of ceoPlaybook.actions) {
      const actionLower = (action.action ?? '').toLowerCase()
      if (failureRisk === 'critical' && (actionLower.includes('scale') || actionLower.includes('expand aggressively'))) {
        issues.push(`CEO action "${action.action.slice(0, 40)}..." recommends scaling despite critical failure surface risk`)
      }
    }
  }

  // Investment recommendation must align with moat strength
  if (investmentAnalysis?.recommendation) {
    const rec = investmentAnalysis.recommendation
    if ((rec === 'strong_yes') && moatStrength.includes('erod')) {
      issues.push('Investment recommendation is "strong_yes" but moat analysis shows erosion')
    }
    if ((rec === 'pass') && moatStrength.includes('grow')) {
      issues.push('Investment recommendation is "pass" but moat analysis shows growing strength')
    }
  }

  return { consistent: issues.length === 0, issues }
}

// ── Section token accounting (Doc 7 final gap #12) ────────────────────────────
export function estimateSectionTokens(section: Record<string, any>): number {
  // Rough estimate: 1 token ≈ 4 characters
  const text = JSON.stringify(section)
  return Math.ceil(text.length / 4)
}

export function estimatePromptTokens(clusters: any[]): number {
  return Math.ceil(JSON.stringify(clusters).length / 4)
}

// ── Telemetry logger (Doc 7 final gap #11) ────────────────────────────────────
import type { TelemetryEvent } from './intelligence'

const telemetryLog: TelemetryEvent[] = []

export function logTelemetry(event: TelemetryEvent): void {
  telemetryLog.push(event)
  // Console log for immediate observability
  const status = event.error ? '❌' : '✅'
  console.log(`[TELEMETRY] ${status} ${event.eventType} | ${event.passName} | ${event.latencyMs}ms${event.tokenEstimate ? ` | ~${event.tokenEstimate} tokens` : ''}${event.error ? ` | ${event.error}` : ''}`)
}

export function getTelemetrySummary(): { totalLatencyMs: number; totalTokens: number; failureRate: number; events: TelemetryEvent[] } {
  const totalLatencyMs = telemetryLog.reduce((s, e) => s + e.latencyMs, 0)
  const totalTokens = telemetryLog.reduce((s, e) => s + (e.tokenEstimate ?? 0), 0)
  const failures = telemetryLog.filter(e => e.error).length
  const failureRate = telemetryLog.length > 0 ? failures / telemetryLog.length : 0
  return { totalLatencyMs, totalTokens, failureRate, events: [...telemetryLog] }
}

// ── Structure validation ───────────────────────────────────────────────────────
const REQUIRED_STRUCTURE: Record<string, string[]> = {
  money_engine:           ['headline', 'detail', 'defensibility', 'so_what_founder', 'evidence'],
  retention_architecture: ['headline', 'switching_cost', 'lock_in_mechanism', 'vulnerable_segment', 'so_what_founder', 'evidence'],
  moat_analysis:          ['headline', 'moat_type', 'strength', 'replication_cost', 'so_what_founder', 'evidence'],
  demand_quality:         ['headline', 'demand_type', 'complaint_pattern', 'unmet_need', 'so_what_founder', 'evidence'],
  failure_surface:        ['headline', 'core_assumption', 'early_signals', 'risk_level', 'so_what_investor', 'evidence'],
  strategic_opportunity:  ['headline', 'target_segment', 'gap', 'playbook', 'why_incumbent_cant_respond'],
}

export function validateStructure(output: Record<string, any>): { valid: boolean; missingFields: string[]; emptyFields: string[] } {
  const missingFields: string[] = []
  const emptyFields: string[] = []

  for (const [section, requiredKeys] of Object.entries(REQUIRED_STRUCTURE)) {
    if (!output[section] || typeof output[section] !== 'object') {
      missingFields.push(section); continue
    }
    for (const key of requiredKeys) {
      const val = output[section][key]
      if (val === undefined || val === null) {
        missingFields.push(`${section}.${key}`)
      } else if (typeof val === 'string' && val.trim().length < 3) {
        emptyFields.push(`${section}.${key}`)
      } else if (Array.isArray(val) && val.length === 0 && key === 'playbook') {
        emptyFields.push(`${section}.${key}`)
      }
    }
  }

  return { valid: missingFields.length === 0 && emptyFields.length === 0, missingFields, emptyFields }
}
