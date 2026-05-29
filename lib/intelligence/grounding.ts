// ─────────────────────────────────────────────────────────────────────────────
// lib/intelligence/grounding.ts
// Claim-level verification layer.
// Doc 6 #1 — VerifiedClaim: evidence refs ≠ verified grounding
// Doc 7 #45 — False narrative resistance
// Doc 8 — Claim normalization before strategic synthesis
//
// Purpose: Before any strategic conclusion is written, verify that
// the evidence actually supports the claim being made. Prevents
// "3 pricing complaints → retention collapse" false narratives.
// ─────────────────────────────────────────────────────────────────────────────

import type { EvidenceRef } from './types'
import { SIGNAL_THRESHOLDS } from './types'

// ── VerifiedClaim structure (Doc 6 #1) ───────────────────────────────────────
export interface VerifiedClaim {
  claim:              string
  supportCount:       number
  contradictionCount: number
  confidence:         number
  verificationStatus: 'verified' | 'weakly_supported' | 'conflicted' | 'unsupported'
  groundingScore:     number   // 0–1: how well evidence supports the claim
  normalizedClaim?:   string   // canonical form after normalization
}

// ── Claim normalization map ───────────────────────────────────────────────────
// Prevents semantic fragmentation: "fragile monetization" = "weak pricing durability"
const CLAIM_NORMALIZATIONS: Array<{ patterns: RegExp[]; canonical: string }> = [
  {
    patterns: [/pric(ing|e)\s*(fragil|weak|instab)/i, /weak pricing/i, /fragile monetiz/i, /pricing durability/i],
    canonical: 'pricing_fragility',
  },
  {
    patterns: [/coupon|discount\s*depend/i, /cashback\s*driven/i, /subsid(y|ies)\s*relian/i],
    canonical: 'coupon_dependency',
  },
  {
    patterns: [/retention\s*(collapse|failure|risk)/i, /churn\s*(risk|threat|concern)/i, /users?\s*(leaving|churning|switching)/i],
    canonical: 'churn_risk',
  },
  {
    patterns: [/moat\s*(eros|weak|fragil)/i, /replicabl/i, /commodit(y|ized)/i, /easy to\s*copy/i],
    canonical: 'moat_weakness',
  },
  {
    patterns: [/trust\s*(degrad|loss|collaps)/i, /billing\s*(fraud|disput)/i, /user\s*trust\s*(eroding|falling)/i],
    canonical: 'trust_degradation',
  },
  {
    patterns: [/competi(tor|tive)\s*(pressure|threat)/i, /market\s*displace/i],
    canonical: 'competitive_pressure',
  },
  {
    patterns: [/strong\s*retention/i, /habit.based/i, /loyal(ty)?\s*signal/i, /high\s*switching\s*cost/i],
    canonical: 'retention_strength',
  },
]

export function normalizeClaim(claim: string): string {
  const lower = claim.toLowerCase()
  for (const { patterns, canonical } of CLAIM_NORMALIZATIONS) {
    if (patterns.some(p => p.test(lower))) return canonical
  }
  return claim.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 40)
}

// ── Lightweight semantic similarity heuristic ─────────────────────────────────
// No embeddings needed — keyword overlap is sufficient for initial grounding check.
function keywordOverlapScore(claim: string, evidence: string): number {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'can', 'this', 'that', 'these', 'those', 'and', 'or',
    'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about'])

  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))

  const claimTokens  = new Set(tokenize(claim))
  const evidTokens   = new Set(tokenize(evidence))
  if (claimTokens.size === 0) return 0

  let overlap = 0
  for (const t of claimTokens) {
    if (evidTokens.has(t)) overlap++
  }

  return overlap / claimTokens.size
}

// ── Main claim verification (Doc 6 #1) ───────────────────────────────────────
export function verifyClaim(
  claim: string,
  evidenceRefs: EvidenceRef[],
  rawReviews?: string[]
): VerifiedClaim {
  const normalizedClaim = normalizeClaim(claim)

  // Count supporting vs contradicting evidence
  let supportCount       = 0
  let contradictionCount = 0
  let groundingScoreSum  = 0

  for (const ref of evidenceRefs) {
    const overlap = keywordOverlapScore(claim, ref.extractedClaim)
    if (overlap > 0.3) {
      supportCount++
      groundingScoreSum += overlap * ref.confidence
    }
  }

  // Also check raw reviews if provided
  if (rawReviews) {
    for (const review of rawReviews.slice(0, 50)) {
      const overlap = keywordOverlapScore(claim, review)
      if (overlap > 0.4) {
        supportCount++
        groundingScoreSum += overlap * 0.5  // lower weight for raw reviews
      }
    }
  }

  // Simple contradiction detection: check for negation patterns
  const negationPatterns = [/not\s+\w+/i, /no\s+\w+/i, /never\s+/i, /contrary/i, /instead/i, /however/i]
  for (const ref of evidenceRefs) {
    const lower = ref.extractedClaim.toLowerCase()
    if (negationPatterns.some(p => p.test(lower)) && keywordOverlapScore(claim, ref.extractedClaim) > 0.2) {
      contradictionCount++
    }
  }

  const groundingScore = supportCount > 0
    ? Math.min(groundingScoreSum / supportCount, 1)
    : 0

  const totalEvidence = evidenceRefs.length + (rawReviews?.length ?? 0)
  const supportRatio  = totalEvidence > 0 ? supportCount / Math.max(totalEvidence, 1) : 0

  // Apply thresholds to determine verification status
  let verificationStatus: VerifiedClaim['verificationStatus']
  if (contradictionCount > supportCount) {
    verificationStatus = 'conflicted'
  } else if (supportCount >= SIGNAL_THRESHOLDS.minEvidenceCount && groundingScore >= 0.4) {
    verificationStatus = 'verified'
  } else if (supportCount >= 2 && groundingScore >= 0.25) {
    verificationStatus = 'weakly_supported'
  } else {
    verificationStatus = 'unsupported'
  }

  const confidence = verificationStatus === 'verified'        ? Math.min(0.85 + groundingScore * 0.15, 0.95)
    : verificationStatus === 'weakly_supported' ? 0.45 + groundingScore * 0.2
    : verificationStatus === 'conflicted'       ? 0.3
    : 0.15

  return {
    claim,
    supportCount,
    contradictionCount,
    confidence,
    verificationStatus,
    groundingScore,
    normalizedClaim,
  }
}

// ── Signal threshold gate (Doc 6 #2) ─────────────────────────────────────────
// Blocks strategic conclusions when evidence is too thin.
export function checkSignalThresholds(params: {
  clusters:        Array<{ cluster_name: string; evidence_count?: number; confidence?: number }>
  evidenceRefs:    EvidenceRef[]
  reviewCount:     number
  sourceTypes:     string[]
}): { allowed: boolean; warnings: string[]; blocked: string[] } {
  const warnings: string[] = []
  const blocked: string[]  = []

  const { clusters, evidenceRefs, reviewCount, sourceTypes } = params

  // Check minimum review count
  if (reviewCount < 10) {
    blocked.push('strategic_conclusions')
    warnings.push(`Only ${reviewCount} reviews — insufficient for strategic analysis (min: 10)`)
  }

  // Check minimum cluster count
  const meaningfulClusters = clusters.filter(c =>
    !['general', 'other', 'misc', 'mixed', 'various'].some(g =>
      c.cluster_name.toLowerCase().includes(g)
    )
  )
  if (meaningfulClusters.length < SIGNAL_THRESHOLDS.minClusterCount) {
    warnings.push(`Only ${meaningfulClusters.length} meaningful clusters — analysis may be shallow`)
  }

  // Check generic cluster ratio
  const genericRatio = clusters.length > 0
    ? (clusters.length - meaningfulClusters.length) / clusters.length
    : 0
  if (genericRatio > SIGNAL_THRESHOLDS.maxGenericClusterRatio) {
    warnings.push(`${Math.round(genericRatio * 100)}% of clusters are generic — signal density low`)
  }

  // Check evidence ref density
  if (evidenceRefs.length < 3) {
    warnings.push(`Only ${evidenceRefs.length} evidence refs — conclusions have thin backing`)
  }

  // Check source diversity
  const uniqueSources = new Set(sourceTypes).size
  if (uniqueSources < SIGNAL_THRESHOLDS.minSourceDiversity) {
    warnings.push(`Single data source only — confidence discount applied`)
  }

  return {
    allowed:  blocked.length === 0,
    warnings,
    blocked,
  }
}

// ── Confidence stratification (Doc 7 #19) ─────────────────────────────────────
// Separates evidence confidence from reasoning and synthesis confidence.
export function computeStratifiedConfidence(params: {
  evidenceRefs:      EvidenceRef[]
  verifiedClaims:    VerifiedClaim[]
  contradictionCount: number
  unknownAreaCount:  number
  reviewCount:       number
  sourceCount:       number
}): import('./types').StratifiedConfidence {
  const { evidenceRefs, verifiedClaims, contradictionCount, unknownAreaCount, reviewCount, sourceCount } = params

  // Evidence confidence: quality of raw facts
  const avgEvidenceConf   = evidenceRefs.length > 0
    ? evidenceRefs.reduce((s, r) => s + r.confidence, 0) / evidenceRefs.length
    : 0.3
  const reviewCountFactor = Math.min(reviewCount / 200, 1)
  const evidenceConfidence = Math.min(avgEvidenceConf * 0.6 + reviewCountFactor * 0.4, 0.95)

  // Reasoning confidence: how well evidence connects to conclusions
  const verifiedRatio = verifiedClaims.length > 0
    ? verifiedClaims.filter(c => c.verificationStatus === 'verified' || c.verificationStatus === 'weakly_supported').length / verifiedClaims.length
    : 0.5
  const contradictionPenalty = Math.min(contradictionCount * 0.08, 0.4)
  const reasoningConfidence  = Math.max(verifiedRatio - contradictionPenalty, 0.1)

  // Synthesis confidence: reliability of final strategic narrative
  const unknownPenalty = Math.min(unknownAreaCount * 0.05, 0.25)
  const sourceBonus    = sourceCount > 1 ? 0.05 : 0
  const synthesisConfidence = Math.max(
    (evidenceConfidence * 0.4 + reasoningConfidence * 0.6) - unknownPenalty + sourceBonus,
    0.1
  )

  const overallConfidence = Math.round(
    (evidenceConfidence * 0.3 + reasoningConfidence * 0.4 + synthesisConfidence * 0.3) * 100
  ) / 100

  return {
    evidenceConfidence:  Math.round(evidenceConfidence  * 100) / 100,
    reasoningConfidence: Math.round(reasoningConfidence * 100) / 100,
    synthesisConfidence: Math.round(synthesisConfidence * 100) / 100,
    overallConfidence,
  }
}

// ── Narrative inflation check (Doc 7 #45) ─────────────────────────────────────
// Would the conclusion survive if 30% of evidence disappeared?
export function checkNarrativeFragility(
  verifiedClaims: VerifiedClaim[],
  confidenceScore: number
): { fragile: boolean; reason?: string } {
  if (verifiedClaims.length === 0) return { fragile: false }

  // Check if most claims are weakly supported
  const weakClaims    = verifiedClaims.filter(c => c.verificationStatus === 'weakly_supported').length
  const unsupportedCl = verifiedClaims.filter(c => c.verificationStatus === 'unsupported').length
  const total         = verifiedClaims.length

  if (unsupportedCl / total > 0.4) {
    return { fragile: true, reason: `${Math.round(unsupportedCl/total*100)}% of claims have insufficient evidence` }
  }
  if (weakClaims / total > 0.6 && confidenceScore > 65) {
    return { fragile: true, reason: 'Confidence score is high but evidence grounding is weak — narrative inflation risk' }
  }
  return { fragile: false }
}
