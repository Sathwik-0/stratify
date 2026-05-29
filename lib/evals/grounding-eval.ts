// ─────────────────────────────────────────────────────────────────────────────
// lib/evals/grounding-eval.ts
// Grounding evaluation: do conclusions actually have evidence backing them?
// Doc 6 #1 (VerifiedClaim), Doc 6 #5, Doc 8
// ─────────────────────────────────────────────────────────────────────────────

import { verifyClaim, checkNarrativeFragility, type VerifiedClaim } from '../intelligence/grounding'
import type { EvidenceRef } from '../intelligence/types'

export interface GroundingEvalResult {
  passed:              boolean
  score:               number   // 0–100
  unsupportedClaims:   string[]
  conflictedClaims:    string[]
  weaklySupportedClaims: string[]
  narrativeFragile:    boolean
  fragmentReason?:     string
  verifiedClaims:      VerifiedClaim[]
  metrics: {
    totalClaims:       number
    verifiedCount:     number
    unsupportedCount:  number
    conflictedCount:   number
    avgGroundingScore: number
  }
}

const KEY_SECTIONS = [
  'money_engine', 'retention_architecture', 'moat_analysis',
  'demand_quality', 'failure_surface', 'strategic_opportunity',
]

function extractClaimsFromSection(section: Record<string, unknown>): string[] {
  const claims: string[] = []
  const fields = ['so_what', 'headline', 'one_sentence_summary', 'key_insight', 'description', 'narrative']
  for (const f of fields) {
    const val = section[f]
    if (typeof val === 'string' && val.length > 15) claims.push(val)
  }
  // Also extract from nested objects
  for (const val of Object.values(section)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>
      for (const f of fields) {
        if (typeof nested[f] === 'string' && (nested[f] as string).length > 15) {
          claims.push(nested[f] as string)
        }
      }
    }
  }
  return [...new Set(claims)]
}

export function runGroundingEval(
  analysis:     Record<string, unknown>,
  evidenceRefs: EvidenceRef[],
  reviewCount:  number,
): GroundingEvalResult {
  const allVerifiedClaims: VerifiedClaim[] = []
  const unsupportedClaims: string[]        = []
  const conflictedClaims:  string[]        = []
  const weaklyClaims:      string[]        = []

  for (const section of KEY_SECTIONS) {
    const sec = analysis[section] as Record<string, unknown> | undefined
    if (!sec) continue

    // Use section-specific evidence refs if available
    const sectionRefs = (sec.evidence_refs as EvidenceRef[] | undefined) ?? evidenceRefs
    const claims      = extractClaimsFromSection(sec)

    for (const claim of claims) {
      const verified = verifyClaim(claim, sectionRefs)
      allVerifiedClaims.push(verified)

      switch (verified.verificationStatus) {
        case 'unsupported':
          unsupportedClaims.push(`[${section}] ${claim.slice(0, 80)}`)
          break
        case 'conflicted':
          conflictedClaims.push(`[${section}] ${claim.slice(0, 80)}`)
          break
        case 'weakly_supported':
          weaklyClaims.push(`[${section}] ${claim.slice(0, 80)}`)
          break
      }
    }
  }

  const confidenceScore = (analysis.confidence_score as number | undefined) ?? 50
  const { fragile, reason } = checkNarrativeFragility(allVerifiedClaims, confidenceScore)

  const total           = allVerifiedClaims.length
  const verifiedCount   = allVerifiedClaims.filter(c => c.verificationStatus === 'verified').length
  const unsupportedCnt  = unsupportedClaims.length
  const conflictedCnt   = conflictedClaims.length
  const avgGroundingScore = total > 0
    ? allVerifiedClaims.reduce((s, c) => s + c.groundingScore, 0) / total
    : 0

  // Scoring: penalise unsupported and conflicted claims
  const score = Math.max(0, Math.min(100,
    100
    - unsupportedCnt  * 8
    - conflictedCnt   * 12
    - (fragile ? 15 : 0)
  ))

  return {
    passed:               unsupportedCnt === 0 && conflictedCnt === 0 && !fragile,
    score,
    unsupportedClaims,
    conflictedClaims,
    weaklySupportedClaims: weaklyClaims,
    narrativeFragile:     fragile,
    fragmentReason:       reason,
    verifiedClaims:       allVerifiedClaims,
    metrics: {
      totalClaims:        total,
      verifiedCount,
      unsupportedCount:   unsupportedCnt,
      conflictedCount:    conflictedCnt,
      avgGroundingScore:  Math.round(avgGroundingScore * 100) / 100,
    },
  }
}
