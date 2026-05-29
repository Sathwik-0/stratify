// ─────────────────────────────────────────────────────────────────────────────
// lib/intelligence/types.ts
// Core TypeScript types. No logic — pure contracts.
// Split from lib/intelligence.ts per Doc 8 file-splitting requirement.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 'intelligence-v1' as const
export type SchemaVersion = typeof SCHEMA_VERSION

// ── Source maps ───────────────────────────────────────────────────────────────
export const SOURCE_RELIABILITY: Record<string, number> = {
  sec_filing:    0.98,
  earnings_call: 0.92,
  official_site: 0.90,
  g2_reviews:    0.70,
  play_store:    0.65,
  app_store:     0.65,
  glassdoor:     0.60,
  news:          0.55,
  linkedin:      0.50,
  reddit:        0.45,
  twitter:       0.35,
  unknown:       0.30,
}

export const SOURCE_FRESHNESS_WINDOWS: Record<string, number> = {
  sec_filing:    2160,
  earnings_call: 2160,
  official_site:  720,
  g2_reviews:     720,
  play_store:     720,
  app_store:      720,
  glassdoor:      720,
  news:           336,
  linkedin:       168,
  reddit:          72,
  twitter:         24,
  unknown:        168,
}

// ── Confidence ────────────────────────────────────────────────────────────────
export type ConfidenceLevel = 'verified' | 'moderate' | 'weak_evidence' | 'insufficient_data'

export function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 75) return 'verified'
  if (score >= 50) return 'moderate'
  if (score >= 30) return 'weak_evidence'
  return 'insufficient_data'
}

// ── Severity ──────────────────────────────────────────────────────────────────
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low'

export const SEVERITY_DEFINITIONS: Record<SeverityLevel, string> = {
  critical: 'Existential company threat',
  high:     'Major growth blocker',
  medium:   'Optimization issue',
  low:      'Minor inefficiency',
}

// Revenue impact weighting per signal type (Doc 9 #16)
export const REVENUE_IMPACT_WEIGHTS: Record<string, number> = {
  pricing_fragility:    0.95,
  churn_risk:           0.90,
  retention_strength:   0.85,
  competitive_pressure: 0.75,
  trust_degradation:    0.70,
  delivery_quality:     0.55,
  activation_friction:  0.50,
  enterprise_traction:  0.80,
  moat_weakness:        0.85,
  unknown_signal:       0.40,
}

// ── Evidence ──────────────────────────────────────────────────────────────────
export interface EvidenceRef {
  evidenceId:      string
  sourceType:      'website' | 'review' | 'linkedin' | 'reddit' | 'news' | 'sec_filing' | 'play_store' | 'glassdoor' | 'twitter' | 'unknown'
  sourceName:      string
  confidence:      number
  url?:            string
  extractedClaim:  string
  timestamp?:      string
}

export interface CompressedEvidence {
  canonicalClaim:          string
  supportingEvidenceCount: number
  corroborationLevel:      'single_source' | 'partially_verified' | 'multi_source_verified'
  refs:                    EvidenceRef[]
}

// ── Contradiction ─────────────────────────────────────────────────────────────
export type ContradictionType = 'growth_vs_sentiment' | 'pricing_vs_retention' | 'hype_vs_usage' | 'quality_vs_churn' | 'moat_vs_competition'
export type ContradictionSeverity = 'minor' | 'major' | 'thesis_breaking'

export interface Contradiction {
  signalA:           string
  signalB:           string
  contradictionType: ContradictionType
  severity:          ContradictionSeverity
}

// ── Resolved confidence direction (Doc 9 #17) ─────────────────────────────────
export type ConfidenceConflictResolution = 'positive_wins' | 'negative_wins' | 'neutral' | 'conflicted'

export interface ResolvedConfidence {
  direction:   ConfidenceConflictResolution
  finalScore:  number
  explanation: string
}

export function resolveConfidenceConflict(
  positiveConf: number,
  negativeConf: number,
  positiveSeverity: SeverityLevel,
  negativeSeverity: SeverityLevel
): ResolvedConfidence {
  const severityWeight: Record<SeverityLevel, number> = { critical: 1.0, high: 0.8, medium: 0.5, low: 0.2 }
  const posWeight = positiveConf * severityWeight[positiveSeverity]
  const negWeight = negativeConf * severityWeight[negativeSeverity]
  const diff = posWeight - negWeight

  if (diff > 0.2) return { direction: 'positive_wins', finalScore: positiveConf, explanation: 'Positive evidence outweighs negative by sufficient margin' }
  if (diff < -0.2) return { direction: 'negative_wins', finalScore: negativeConf, explanation: 'Negative evidence dominates — confidence reduced' }
  if (Math.abs(diff) <= 0.1) return { direction: 'conflicted', finalScore: Math.min(positiveConf, negativeConf) * 0.7, explanation: 'Conflicting signals — confidence discounted' }
  return { direction: 'neutral', finalScore: (positiveConf + negativeConf) / 2, explanation: 'Evidence partially balanced' }
}

// ── Structured unknowns ───────────────────────────────────────────────────────
export type UnknownType = 'market_data_missing' | 'financials_missing' | 'retention_unclear' | 'enterprise_presence_unknown' | 'pricing_data_missing' | 'competitive_set_unclear'

export interface StructuredUnknown {
  area:        string
  unknownType: UnknownType
  impact:      'high' | 'medium' | 'low'
}

// ── Confidence explanation ────────────────────────────────────────────────────
export interface ConfidenceExplanation {
  supportingSources:   number
  sourceDiversity:     number
  contradictionLevel:  'low' | 'medium' | 'high'
  recency:             string
  corroborationLevel:  'single_source' | 'partially_verified' | 'multi_source_verified'
}

// ── Meta confidence (Doc 9 #27 — self-awareness) ─────────────────────────────
export interface MetaConfidence {
  retrievalQuality:     number   // 0–1: how good is the source data
  sourceDiversity:      number   // 0–1: variety of source types
  contradictionSeverity: number  // 0–1: how conflicted the signals are (lower = worse)
  unknownDensity:       number   // 0–1: proportion of unknowns (lower = worse)
  hallucinationLikelihood: number // 0–1: estimated risk of fabrication
  overallMetaScore:     number   // weighted composite
}

export function computeMetaConfidence(params: {
  sourceCount: number
  sourceTypes: string[]
  contradictions: Contradiction[]
  unknowns: StructuredUnknown[]
  reviewCount: number
  qualityScore: number
}): MetaConfidence {
  const retrievalQuality = Math.min(params.reviewCount / 300, 1.0)
  const sourceDiversity  = Math.min(params.sourceTypes.length / 5, 1.0)
  const contradictionSeverity = params.contradictions.length === 0 ? 1.0
    : params.contradictions.some(c => c.severity === 'thesis_breaking') ? 0.2
    : params.contradictions.some(c => c.severity === 'major') ? 0.5 : 0.8
  const unknownDensity = Math.max(0, 1 - (params.unknowns.filter(u => u.impact === 'high').length / 3))
  const hallucinationLikelihood = params.reviewCount < 30 ? 0.7 : params.reviewCount < 100 ? 0.4 : 0.2
  const overallMetaScore = Math.round(
    (retrievalQuality * 0.25 + sourceDiversity * 0.2 + contradictionSeverity * 0.2 +
     unknownDensity * 0.15 + (1 - hallucinationLikelihood) * 0.2) * 100
  ) / 100

  return { retrievalQuality, sourceDiversity, contradictionSeverity, unknownDensity, hallucinationLikelihood, overallMetaScore }
}

// ── Model attribution ─────────────────────────────────────────────────────────
export interface ModelAttribution {
  model:         string
  provider:      string
  temperature:   number
  promptVersion: string
}

// ── Entity resolution (Doc 9 #13) ────────────────────────────────────────────
export interface CanonicalEntity {
  canonicalEntityId: string    // stable UUID or slug
  canonicalName:     string
  aliases:           string[]
  subsidiaries:      string[]
  parentCompanyId?:  string
  sector:            string
}

// Static entity map — grows over time, migrated to DB in Phase 2
export const ENTITY_RESOLUTION_MAP: Record<string, CanonicalEntity> = {
  swiggy: {
    canonicalEntityId: 'entity_swiggy',
    canonicalName:     'Swiggy',
    aliases:           ['swiggy india', 'swiggy pvt ltd', 'swiggy pvt'],
    subsidiaries:      ['Instamart'],
    sector:            'food_delivery',
  },
  zomato: {
    canonicalEntityId: 'entity_zomato',
    canonicalName:     'Zomato',
    aliases:           ['zomato india', 'zomato pvt', 'eternal', 'blinkit parent'],
    subsidiaries:      ['Blinkit', 'Hyperpure'],
    sector:            'food_delivery',
  },
  zerodha: {
    canonicalEntityId: 'entity_zerodha',
    canonicalName:     'Zerodha',
    aliases:           ['zerodha broking', 'zerodha pvt'],
    subsidiaries:      ['Coin', 'Kite'],
    sector:            'fintech_trading',
  },
  phonepe: {
    canonicalEntityId: 'entity_phonepe',
    canonicalName:     'PhonePe',
    aliases:           ['phonepe pvt', 'phonepe india'],
    subsidiaries:      ['Pincode', 'Share.Market'],
    sector:            'fintech_payments',
  },
  cred: {
    canonicalEntityId: 'entity_cred',
    canonicalName:     'CRED',
    aliases:           ['cred fintech', 'cred club'],
    subsidiaries:      ['CRED Pay', 'CRED Travel'],
    sector:            'fintech_rewards',
  },
  meesho: {
    canonicalEntityId: 'entity_meesho',
    canonicalName:     'Meesho',
    aliases:           ['meesho online', 'meesho supply'],
    subsidiaries:      [],
    sector:            'social_commerce',
  },
  groww: {
    canonicalEntityId: 'entity_groww',
    canonicalName:     'Groww',
    aliases:           ['groww securities', 'groww invest'],
    subsidiaries:      [],
    sector:            'fintech_investing',
  },
}

export function resolveEntity(rawName: string): CanonicalEntity | null {
  const lower = rawName.toLowerCase().trim()
  for (const entity of Object.values(ENTITY_RESOLUTION_MAP)) {
    if (entity.canonicalName.toLowerCase() === lower) return entity
    if (entity.aliases.some(a => a.toLowerCase() === lower)) return entity
  }
  return null
}

// ── Temporal signal (Doc 9 #11) ───────────────────────────────────────────────
export interface TemporalDataPoint {
  timestamp:  string   // ISO8601 UTC
  score:      number   // 0–100 signal strength
  confidence: number   // 0–1
  sourceHash: string   // retrieval context hash for this snapshot
}

export interface TemporalSignal {
  signalId:         string
  companyId:        string
  historicalValues: TemporalDataPoint[]
  trendDirection:   'rising' | 'stable' | 'declining'
  acceleration:     number   // positive = speeding up, negative = slowing
  lastUpdatedAt:    string   // ISO8601 UTC
}

export function computeAcceleration(points: TemporalDataPoint[]): { trend: 'rising' | 'stable' | 'declining'; acceleration: number } {
  if (points.length < 2) return { trend: 'stable', acceleration: 0 }
  const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const recent = sorted.slice(-3)
  if (recent.length < 2) return { trend: 'stable', acceleration: 0 }
  const deltas = recent.slice(1).map((p, i) => p.score - recent[i].score)
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const trend = avgDelta > 2 ? 'rising' : avgDelta < -2 ? 'declining' : 'stable'
  return { trend, acceleration: Math.round(avgDelta * 100) / 100 }
}

// ── Effective signal weight (Doc 9 #12 — decay × persistence × recency × corroboration) ──
export function computeEffectiveSignalWeight(params: {
  baseScore:      number    // 0–1
  ageHours:       number
  volatility:     number    // 0–1
  corroboration:  'single_source' | 'partially_verified' | 'multi_source_verified'
  persistence:    number    // 0–1
}): number {
  const corrobWeight = params.corroboration === 'multi_source_verified' ? 1.0
    : params.corroboration === 'partially_verified' ? 0.75 : 0.5

  // Decay faster for volatile signals
  const decayRate = 0.5 + params.volatility * 0.5
  const recency = Math.exp(-decayRate * (params.ageHours / 720))

  return Math.round(params.baseScore * params.persistence * recency * corrobWeight * 100) / 100
}

// ── Prediction outcome hook (Doc 9 #15) ───────────────────────────────────────
export interface PredictionOutcome {
  predictionId:    string
  companyId:       string
  predictedEvent:  string
  generatedAt:     string   // ISO8601 UTC
  targetTimeframe: string   // e.g. "Q3 2025"
  resolvedAt?:     string
  outcome?:        'correct' | 'incorrect' | 'partially_correct' | 'pending'
  verificationNote?: string
}

// ── Strategic context ─────────────────────────────────────────────────────────
export interface StrategicContext {
  companyName:        string
  canonicalEntityId?: string   // resolved entity ID
  marketScore:        number
  moatScore:          number
  growthRisk:         'low' | 'medium' | 'high' | 'critical'
  pricingWeakness:    'none' | 'moderate' | 'severe'
  retentionRisk:      'low' | 'medium' | 'high'
  strongestAdvantage: string
  biggestThreat:      string
  confidenceLevel:    ConfidenceLevel
  revenueImpactScore: number   // Doc 9 #16
}

// ── Horizon risks ─────────────────────────────────────────────────────────────
export interface HorizonRisks {
  short:  string[]
  medium: string[]
  long:   string[]
}

// ── Provenance ────────────────────────────────────────────────────────────────
export interface ProvenanceChain {
  sourceEvidenceIds:   string[]
  intermediateSignals: string[]
  transformations:     string[]
  generatedByPass:     string
}

// ── Output constraints ────────────────────────────────────────────────────────
export const OUTPUT_CONSTRAINTS = {
  maxEvidenceRefsPerSection: 5,
  maxContradictionsPerResult: 6,
  maxUnknownAreas:            5,
  maxCeoActions:              3,
  maxWatchListItems:          5,
  maxLineageSteps:            6,
  maxSourceDominance:         0.4,   // Doc 9 #22: no source > 40% of evidence
} as const

// ── Telemetry ─────────────────────────────────────────────────────────────────
export interface TelemetryEvent {
  eventType:    'pass_complete' | 'pass_failed' | 'fallback_used' | 'json_repaired' | 'quality_gate_failed' | 'silent_failure_detected' | 'zod_validation_failed' | 'retrieval_poisoning_detected'
  passName:     string
  latencyMs:    number
  tokenEstimate?: number
  error?:       string
  timestamp:    string
}

// ── Retry classification ──────────────────────────────────────────────────────
export type RetryClass = 'retryable' | 'non_retryable'

export function classifyError(error: any): { retryClass: RetryClass; reason: string } {
  const msg    = error?.message?.toLowerCase() ?? ''
  const status = error?.status ?? 0
  if (status === 429 || msg.includes('rate_limit') || msg.includes('rate limit'))
    return { retryClass: 'retryable', reason: 'rate_limit' }
  if (msg.includes('timeout') || msg.includes('timed out') || status === 503 || status === 502)
    return { retryClass: 'retryable', reason: 'timeout' }
  if (msg.includes('malformed') || msg.includes('insufficient data') || msg.includes('schema mismatch'))
    return { retryClass: 'non_retryable', reason: 'data_quality' }
  if (error instanceof SyntaxError || msg.includes('json'))
    return { retryClass: 'retryable', reason: 'malformed_json' }
  return { retryClass: 'retryable', reason: 'transient' }
}

// ── Signal Threshold Gates (Doc 6 #2 — narrative inflation prevention) ────────
// Minimum evidence requirements before a strategic conclusion is allowed.
// Prevents "3 pricing complaints → retention collapse" false narratives.
export interface SignalThresholdResult {
  allowed:          boolean
  blockedSections:  string[]
  reason?:          string
}

export const SIGNAL_THRESHOLDS = {
  minEvidenceCount:      5,    // Minimum raw reviews supporting a signal
  minSourceDiversity:    1,    // Minimum distinct source types (single-source = play_store only is ok but flagged)
  minCorroboration:      0.4,  // Minimum corroboration score before strategic conclusion
  minClusterCount:       2,    // Minimum meaningful clusters before full 6-force analysis
  maxGenericClusterRatio: 0.5, // If > 50% of clusters are generic, flag thin data
} as const

// ── Confidence Stratification (Doc 7 #19) ─────────────────────────────────────
// Separates evidence confidence from synthesis confidence.
// "Strong evidence + weak synthesis" ≠ "weak evidence + confident writing"
export interface StratifiedConfidence {
  evidenceConfidence:   number  // How well-grounded are the raw facts (0–1)
  reasoningConfidence:  number  // How well does reasoning connect evidence to claims (0–1)
  synthesisConfidence:  number  // How reliable is the final strategic narrative (0–1)
  overallConfidence:    number  // Weighted composite
}

// ── Intelligence Lifecycle TTL (Doc 7 #14) ────────────────────────────────────
export interface IntelligenceLifecycle {
  createdAt:         string
  lastValidatedAt?:  string
  expiresAt?:        string
  decayRate:         number   // 0–1: higher = decays faster
  refreshPriority:   number   // 0–1: higher = refresh sooner
}

// Signal-specific TTL windows in hours
export const SIGNAL_TTL_HOURS: Record<string, number> = {
  reddit_outrage:       168,   // 7 days
  pricing_backlash:     720,   // 30 days
  retention_weakness:   2160,  // 90 days
  weak_moat:            4320,  // 180 days
  regulatory_risk:      8760,  // 365 days
  default:              720,   // 30 days
}

// ── Signal Taxonomy (Doc 7 #41–42, Doc 8) ─────────────────────────────────────
export interface SignalTaxonomyNode {
  signalId:        string
  parentSignal?:   string
  childSignals?:   string[]
  domain:          'monetization' | 'retention' | 'competitive' | 'operational' | 'trust' | 'growth'
  deprecated?:     boolean
  deprecatedAt?:   string
  replacementSignal?: string
  deprecationReason?: string
  definition:      string
  inclusionCriteria: string[]
  exclusionCriteria: string[]
}

export const SIGNAL_TAXONOMY: SignalTaxonomyNode[] = [
  {
    signalId: 'monetization_risk',
    domain: 'monetization',
    definition: 'Any signal indicating fragility or weakness in the revenue model',
    inclusionCriteria: ['revenue model concerns', 'pricing weakness', 'monetization friction'],
    exclusionCriteria: ['feature requests unrelated to pricing'],
    childSignals: ['pricing_fragility', 'coupon_dependency', 'enterprise_price_resistance'],
  },
  {
    signalId: 'pricing_fragility',
    parentSignal: 'monetization_risk',
    domain: 'monetization',
    definition: 'Users exhibit high price sensitivity; churn or dissatisfaction directly linked to price increases',
    inclusionCriteria: ['complaints about price increases', 'switching due to cost', 'pricing unfair'],
    exclusionCriteria: ['general feature dissatisfaction not tied to price'],
  },
  {
    signalId: 'coupon_dependency',
    parentSignal: 'monetization_risk',
    domain: 'monetization',
    definition: 'Retention is artificially sustained by discounts, coupons, or cashback rather than product value',
    inclusionCriteria: ['coupon usage driving repeat purchases', 'churn when discounts removed'],
    exclusionCriteria: ['occasional promotional satisfaction'],
  },
  {
    signalId: 'retention_strength',
    domain: 'retention',
    definition: 'Users exhibit genuine habit-based or value-based retention independent of discounts',
    inclusionCriteria: ['long-term usage patterns', 'high switching cost mentions', 'loyalty signals'],
    exclusionCriteria: ['continued usage primarily driven by cashback or coupons'],
  },
  {
    signalId: 'churn_risk',
    domain: 'retention',
    definition: 'Signals indicating elevated likelihood of user departure',
    inclusionCriteria: ['explicit churn intent', 'frustration escalation', 'competitor comparison with intent to switch'],
    exclusionCriteria: ['general complaints without departure intent'],
  },
  {
    signalId: 'competitive_pressure',
    domain: 'competitive',
    definition: 'External competitor activity threatening market position',
    inclusionCriteria: ['competitor name mentions with favorable comparison', 'feature gap vs competitor'],
    exclusionCriteria: ['general market discussion without direct comparison'],
  },
  {
    signalId: 'moat_weakness',
    domain: 'competitive',
    definition: 'Evidence that competitive advantages are eroding or replicable',
    inclusionCriteria: ['moat erosion patterns', 'easy substitution mentions', 'commodity perception'],
    exclusionCriteria: ['general competitive market commentary'],
  },
  {
    signalId: 'trust_degradation',
    domain: 'trust',
    definition: 'Loss of user trust in the platform, brand, or business practices',
    inclusionCriteria: ['fraud allegations', 'billing disputes', 'support failure leading to trust loss'],
    exclusionCriteria: ['isolated bad experiences without trust framing'],
  },
]

// ── EvaluationMode (Doc 6 #3) ─────────────────────────────────────────────────
export type EvaluationMode = 'investor' | 'founder' | 'competitor' | 'analyst'

export const EVALUATION_MODE_WEIGHTS: Record<EvaluationMode, {
  sourceWeights:   Record<string, number>
  signalPriority:  string[]
  synthesisStyle:  'concise' | 'detailed' | 'evidence_heavy'
}> = {
  investor: {
    sourceWeights:  { sec_filing: 1.2, earnings_call: 1.1, play_store: 0.8, reddit: 0.6 },
    signalPriority: ['monetization_risk', 'moat_weakness', 'churn_risk', 'competitive_pressure'],
    synthesisStyle: 'concise',
  },
  founder: {
    sourceWeights:  { play_store: 1.0, reddit: 0.9, glassdoor: 0.8 },
    signalPriority: ['retention_strength', 'churn_risk', 'competitive_pressure', 'trust_degradation'],
    synthesisStyle: 'detailed',
  },
  competitor: {
    sourceWeights:  { play_store: 1.0, reddit: 1.0, news: 0.9 },
    signalPriority: ['competitive_pressure', 'moat_weakness', 'pricing_fragility', 'churn_risk'],
    synthesisStyle: 'concise',
  },
  analyst: {
    sourceWeights:  { sec_filing: 1.3, earnings_call: 1.2, play_store: 0.7, reddit: 0.5 },
    signalPriority: ['monetization_risk', 'pricing_fragility', 'retention_strength', 'moat_weakness'],
    synthesisStyle: 'evidence_heavy',
  },
}

// ── StressScenario (Doc 7 #13 — counterfactual structure) ─────────────────────
export interface StressScenario {
  scenarioId:     string
  scenario:       string  // "If subsidies disappeared..."
  expectedImpact: string  // "Retention would likely fall by X"
  affectedSignals: string[]
  confidence:     number
  severity:       'low' | 'medium' | 'high' | 'critical'
}

export const STANDARD_STRESS_SCENARIOS: Omit<StressScenario, 'confidence' | 'expectedImpact' | 'affectedSignals'>[] = [
  { scenarioId: 'subsidy_removal',    scenario: 'If all subsidies and discounts were removed', severity: 'high' },
  { scenarioId: 'cac_doubling',       scenario: 'If customer acquisition cost doubled', severity: 'high' },
  { scenarioId: 'competitor_copycat', scenario: 'If top competitor copied core product feature', severity: 'medium' },
  { scenarioId: 'pricing_increase',   scenario: 'If pricing increased by 15–20%', severity: 'medium' },
  { scenarioId: 'funding_winter',     scenario: 'If fundraising environment tightened for 18 months', severity: 'high' },
  { scenarioId: 'regulation_shift',   scenario: 'If key regulation changed for this sector', severity: 'medium' },
]
