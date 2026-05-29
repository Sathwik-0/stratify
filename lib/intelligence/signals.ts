// ─────────────────────────────────────────────────────────────────────────────
// lib/intelligence/signals.ts
// Signal processing: canonical IDs, retrieval ranking, diversity enforcement,
// poisoning detection, effective weight computation.
// Doc 8 #2 — retrieval priority scoring
// Doc 9 #18 — retrieval poisoning protection
// Doc 9 #22 — source diversity guarantees
// ─────────────────────────────────────────────────────────────────────────────

import { SOURCE_RELIABILITY, REVENUE_IMPACT_WEIGHTS, OUTPUT_CONSTRAINTS } from './types'
import type { EvidenceRef, TemporalDataPoint } from './types'

// ── Canonical signal ID map ───────────────────────────────────────────────────
export const CANONICAL_SIGNAL_MAP: Record<string, string> = {
  'discount-driven retention':  'pricing_fragility',
  'coupon dependency':          'pricing_fragility',
  'subscription backlash':      'pricing_fragility',
  'pricing complaints':         'pricing_fragility',
  'price sensitivity':          'pricing_fragility',
  'habit-based retention':      'retention_strength',
  'loyalty signals':            'retention_strength',
  'high switching cost':        'retention_strength',
  'churn risk':                 'churn_risk',
  'user frustration':           'churn_risk',
  'complaint escalation':       'churn_risk',
  'competitor comparison':      'competitive_pressure',
  'feature gap vs competitor':  'competitive_pressure',
  'market displacement risk':   'competitive_pressure',
  'moat erosion':               'moat_weakness',
  'trust collapse':             'trust_degradation',
  'delivery satisfaction':      'delivery_quality',
  'onboarding friction':        'activation_friction',
  'enterprise adoption':        'enterprise_traction',
}

export function resolveSignalId(clusterName: string): string {
  const lower = clusterName.toLowerCase()
  for (const [key, id] of Object.entries(CANONICAL_SIGNAL_MAP)) {
    if (lower.includes(key.toLowerCase())) return id
  }
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'unknown_signal'
}

// ── Retrieval priority scoring (Doc 8 #2 — exact formula) ────────────────────
// retrievalPriority = severity × persistence × corroboration × freshness × uniqueness
export interface ClusterWithPriority {
  cluster_name:      string
  percentage:        number
  summary:           string
  evidence_count:    number
  business_implication: string
  trend:             string
  confidence:        number
  signal_types:      string[]
  // Computed priority fields
  signalId:          string
  revenueImpactScore: number   // Doc 9 #16
  retrievalPriority: number
  effectiveWeight:   number
  sourceReliability: number
}

export function computeClusterRetrievalPriority(
  cluster: any,
  ageHours = 0
): ClusterWithPriority {
  const signalId = resolveSignalId(cluster.cluster_name)
  const revenueImpact = REVENUE_IMPACT_WEIGHTS[signalId] ?? 0.5

  // Severity from trend + confidence
  const severity = cluster.trend === 'rising' ? 0.9
    : cluster.trend === 'falling' ? 0.7
    : cluster.trend === 'stable'  ? 0.5 : 0.4

  // Persistence: evidence_count as proxy
  const persistence = Math.min((cluster.evidence_count ?? 5) / 30, 1.0)

  // Corroboration from confidence
  const corroboration = cluster.confidence ?? 0.7

  // Freshness (simple — full temporal in Phase 2)
  const freshness = ageHours < 24 ? 1.0 : ageHours < 168 ? 0.85 : ageHours < 720 ? 0.65 : 0.4

  // Uniqueness: penalise generic cluster names
  const genericTerms = ['general', 'other', 'misc', 'mixed', 'various', 'multiple']
  const nameLower = cluster.cluster_name.toLowerCase()
  const uniqueness = genericTerms.some(g => nameLower.includes(g)) ? 0.3 : 1.0

  const sourceReliability = SOURCE_RELIABILITY['play_store'] ?? 0.65

  const retrievalPriority = Math.round(
    severity * persistence * corroboration * freshness * uniqueness * revenueImpact * 100
  ) / 100

  const effectiveWeight = Math.round(
    (cluster.percentage / 100) * persistence * (ageHours < 720 ? Math.exp(-0.5 * (ageHours / 720)) : 0.3) * corroboration * 100
  ) / 100

  return {
    ...cluster,
    signalId,
    revenueImpactScore: revenueImpact,
    retrievalPriority,
    effectiveWeight,
    sourceReliability,
  }
}

// Rank clusters by retrieval priority and enforce diversity (Doc 9 #22)
export function rankAndFilterClusters(clusters: any[], maxCount = 5, ageHours = 0): ClusterWithPriority[] {
  const withPriority = clusters.map(c => computeClusterRetrievalPriority(c, ageHours))
  const ranked = withPriority.sort((a, b) => b.retrievalPriority - a.retrievalPriority)
  return ranked.slice(0, maxCount)
}

// ── Source dominance enforcement (Doc 9 #22) ──────────────────────────────────
// No single source type can represent > maxSourceDominance of total evidence refs
export function enforceSourceDiversityMaximum(refs: EvidenceRef[]): EvidenceRef[] {
  if (refs.length === 0) return refs
  const maxAllowed = Math.floor(refs.length * OUTPUT_CONSTRAINTS.maxSourceDominance)
  const bySource: Record<string, EvidenceRef[]> = {}

  for (const ref of refs) {
    if (!bySource[ref.sourceType]) bySource[ref.sourceType] = []
    bySource[ref.sourceType].push(ref)
  }

  const enforced: EvidenceRef[] = []
  for (const sourceRefs of Object.values(bySource)) {
    // Sort by confidence within each source type
    const sorted = sourceRefs.sort((a, b) => b.confidence - a.confidence)
    enforced.push(...sorted.slice(0, Math.max(1, maxAllowed)))
  }

  return enforced
}

// ── Retrieval poisoning detection (Doc 9 #18) ─────────────────────────────────
export interface PoisoningSignal {
  detected:  boolean
  signals:   string[]
  severity:  'low' | 'medium' | 'high'
}

export function detectRetrievalPoisoning(reviews: Array<{ text: string; rating: number | null }>): PoisoningSignal {
  if (reviews.length < 10) return { detected: false, signals: [], severity: 'low' }

  const signals: string[] = []

  // 1. Coordinated phrasing: check for repeated exact phrases (> 3 occurrences of same 5+ word sequence)
  const phraseCounts: Record<string, number> = {}
  for (const r of reviews) {
    const words = r.text.toLowerCase().split(/\s+/)
    for (let i = 0; i <= words.length - 5; i++) {
      const phrase = words.slice(i, i + 5).join(' ')
      phraseCounts[phrase] = (phraseCounts[phrase] ?? 0) + 1
    }
  }
  const repeatedPhrases = Object.entries(phraseCounts).filter(([, count]) => count > 3)
  if (repeatedPhrases.length > 2) {
    signals.push(`Coordinated phrasing detected: ${repeatedPhrases.length} repeated sequences`)
  }

  // 2. Sudden rating spike: if > 60% of reviews have identical rating
  const ratingCounts: Record<string, number> = {}
  for (const r of reviews) {
    const k = String(r.rating ?? 'null')
    ratingCounts[k] = (ratingCounts[k] ?? 0) + 1
  }
  const maxRatingShare = Math.max(...Object.values(ratingCounts)) / reviews.length
  if (maxRatingShare > 0.75) {
    signals.push(`Rating concentration: ${Math.round(maxRatingShare * 100)}% of reviews have identical rating`)
  }

  // 3. Very short reviews dominating: > 50% under 20 chars (bot pattern)
  const shortReviews = reviews.filter(r => r.text.length < 20)
  if (shortReviews.length / reviews.length > 0.5) {
    signals.push(`Short review dominance: ${Math.round(shortReviews.length / reviews.length * 100)}% under 20 chars`)
  }

  const severity = signals.length >= 2 ? 'high' : signals.length === 1 ? 'medium' : 'low'
  return { detected: signals.length > 0, signals, severity }
}

// ── Evidence ID generation ────────────────────────────────────────────────────
export function makeEvidenceId(sourceType: string, claim: string): string {
  const claimSlug = claim.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30)
  return `ev_${sourceType}_${claimSlug}_${Date.now().toString(36)}`
}

// ── Evidence compression ──────────────────────────────────────────────────────
import type { CompressedEvidence } from './types'

export function compressEvidenceRefs(refs: EvidenceRef[]): CompressedEvidence {
  const claimGroups: Record<string, EvidenceRef[]> = {}
  for (const ref of refs) {
    const key = ref.extractedClaim.toLowerCase().trim()
    if (!claimGroups[key]) claimGroups[key] = []
    claimGroups[key].push(ref)
  }

  let canonicalClaim = refs[0]?.extractedClaim ?? ''
  let maxCount = 0
  for (const claim of Object.keys(claimGroups)) {
    if (claimGroups[claim].length > maxCount) { maxCount = claimGroups[claim].length; canonicalClaim = claim }
  }

  const deduped: EvidenceRef[] = []
  for (const claim of Object.keys(claimGroups)) {
    const best = claimGroups[claim].slice().sort((a: EvidenceRef, b: EvidenceRef) => b.confidence - a.confidence)[0]
    deduped.push(best)
  }

  const distinctSourceTypes = new Set(deduped.map(r => r.sourceType)).size
  const corroborationLevel = distinctSourceTypes >= 3 ? 'multi_source_verified'
    : distinctSourceTypes === 2 ? 'partially_verified' : 'single_source'

  return { canonicalClaim, supportingEvidenceCount: refs.length, corroborationLevel, refs: deduped }
}

// ── Source diversity check ────────────────────────────────────────────────────
export function meetsSourceDiversityMinimum(refs: EvidenceRef[]): boolean {
  return new Set(refs.map(r => r.sourceType)).size >= 2
}

// ── Retrieval context hash ────────────────────────────────────────────────────
export function buildRetrievalContextHash(reviewIds: string[], clusterNames: string[]): string {
  const sorted = [...reviewIds].sort().join(',') + '|' + [...clusterNames].sort().join(',')
  let hash = 5381
  for (let i = 0; i < sorted.length; i++) {
    hash = ((hash << 5) + hash) ^ sorted.charCodeAt(i)
    hash = hash & hash
  }
  return `rch_${Math.abs(hash).toString(36)}`
}

export function buildPromptInputHash(retrievalHash: string, promptTemplate: string, clusterNames: string[], passConfig: Record<string, unknown>): string {
  const input = [retrievalHash, promptTemplate.slice(0, 200), [...clusterNames].sort().join(','), JSON.stringify(passConfig)].join('|')
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
    hash = hash & hash
  }
  return `pih_${Math.abs(hash).toString(36)}`
}
