// ─────────────────────────────────────────────────────────────────────────────
// lib/evals/consistency-eval.ts
// Cross-analysis consistency evaluation.
// Catches: "Bull case = strong pricing power" + "Risk = severe pricing fragility"
// Doc 6 #5 (consistency eval), Doc 8 (arbitration layer)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsistencyEvalResult {
  passed:     boolean
  score:      number   // 0–100
  violations: ConsistencyViolation[]
  warnings:   string[]
}

export interface ConsistencyViolation {
  type:        'direct_contradiction' | 'score_mismatch' | 'narrative_inconsistency'
  description: string
  severity:    'critical' | 'major' | 'minor'
  sectionA:    string
  sectionB:    string
}

export function runConsistencyEval(
  analysis:   Record<string, unknown>,
  ceoPlaybook?: Record<string, unknown> | null,
  investment?:  Record<string, unknown> | null,
): ConsistencyEvalResult {
  const violations: ConsistencyViolation[] = []
  const warnings:   string[]               = []

  // ── 1. Investment recommendation vs moat strength ─────────────────────────
  if (investment && analysis.moat_analysis) {
    const reco = (investment.recommendation as string | undefined) ?? ''
    const moat = analysis.moat_analysis as Record<string, unknown>
    const moatStrength = (moat.strength as string | undefined ?? '').toLowerCase()

    if (reco === 'strong_yes' && (moatStrength.includes('erod') || moatStrength.includes('weak'))) {
      violations.push({
        type: 'direct_contradiction',
        description: 'Investment recommendation is "strong yes" but moat is described as eroding/weak',
        severity:    'critical',
        sectionA:    'investment.recommendation',
        sectionB:    'moat_analysis.strength',
      })
    }

    // Investor readiness score vs recommendation
    const readiness = investment.investor_readiness as Record<string, { score: number }> | undefined
    if (readiness && reco === 'strong_yes') {
      const moatScore = readiness.moat_strength?.score ?? 10
      if (moatScore <= 3) {
        violations.push({
          type: 'score_mismatch',
          description: `Strong yes recommendation but moat_strength readiness score is ${moatScore}/10`,
          severity:    'major',
          sectionA:    'investment.recommendation',
          sectionB:    'investment.investor_readiness.moat_strength',
        })
      }
    }
  }

  // ── 2. Bull case vs failure surface ───────────────────────────────────────
  if (investment && analysis.failure_surface) {
    const bullCase     = (investment as Record<string, { thesis?: string }>).bull_case
    const failureSurf  = analysis.failure_surface as Record<string, unknown>
    const riskLevel    = (failureSurf.risk_level as string | undefined ?? '').toLowerCase()
    const bullThesis   = (bullCase?.thesis ?? '').toLowerCase()

    if (riskLevel === 'critical' && (bullThesis.includes('strong') || bullThesis.includes('dominant'))) {
      violations.push({
        type: 'direct_contradiction',
        description: 'Failure surface risk is "critical" but bull case thesis describes strength/dominance',
        severity:    'major',
        sectionA:    'failure_surface.risk_level',
        sectionB:    'investment.bull_case.thesis',
      })
    }
  }

  // ── 3. Money engine defensibility vs investment conviction ────────────────
  if (investment && analysis.money_engine) {
    const convictionScore = (investment.conviction_score as number | undefined) ?? 50
    const defensibility   = (analysis.money_engine as Record<string, number>).defensibility ?? 5

    if (convictionScore >= 80 && defensibility <= 3) {
      violations.push({
        type: 'score_mismatch',
        description: `Conviction score ${convictionScore}% but money engine defensibility is ${defensibility}/10`,
        severity:    'major',
        sectionA:    'investment.conviction_score',
        sectionB:    'money_engine.defensibility',
      })
    }

    if (convictionScore <= 25 && defensibility >= 8) {
      violations.push({
        type: 'score_mismatch',
        description: `Conviction score ${convictionScore}% but money engine defensibility is ${defensibility}/10 — undervaluing moat`,
        severity:    'minor',
        sectionA:    'investment.conviction_score',
        sectionB:    'money_engine.defensibility',
      })
    }
  }

  // ── 4. CEO playbook vs failure surface alignment ──────────────────────────
  if (ceoPlaybook && analysis.failure_surface) {
    const biggestRisk  = ((ceoPlaybook.biggest_risk_ignored as string | undefined) ?? '').toLowerCase()
    const failureHeadline = ((analysis.failure_surface as Record<string, unknown>).headline as string | undefined ?? '').toLowerCase()

    // If CEO playbook doesn't mention the core failure risk, flag it
    const failureKeywords = failureHeadline.split(' ').filter(w => w.length > 4)
    const anyOverlap      = failureKeywords.some(kw => biggestRisk.includes(kw))
    if (!anyOverlap && biggestRisk.length > 0 && failureHeadline.length > 0) {
      warnings.push('CEO playbook biggest_risk_ignored may not align with failure_surface headline')
    }
  }

  // ── 5. Demand quality vs retention architecture alignment ─────────────────
  if (analysis.demand_quality && analysis.retention_architecture) {
    const demandType      = ((analysis.demand_quality as Record<string, unknown>).demand_type as string | undefined ?? '').toLowerCase()
    const lockIn          = ((analysis.retention_architecture as Record<string, unknown>).lock_in_mechanism as string | undefined ?? '').toLowerCase()

    if (demandType.includes('discount') && lockIn.includes('habit')) {
      warnings.push('Demand type is discount-driven but lock-in mechanism claims habit — verify evidence consistency')
    }
  }

  const criticalCount = violations.filter(v => v.severity === 'critical').length
  const majorCount    = violations.filter(v => v.severity === 'major').length
  const score         = Math.max(0, 100 - criticalCount * 25 - majorCount * 10 - warnings.length * 3)

  return {
    passed:     violations.filter(v => v.severity !== 'minor').length === 0,
    score,
    violations,
    warnings,
  }
}
