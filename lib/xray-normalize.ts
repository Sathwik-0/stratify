type AnyRecord = Record<string, any>

function asArray<T = any>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value === null || value === undefined || value === '') return []
  return [value as T]
}

function camelReadiness(readiness: AnyRecord | null | undefined) {
  if (!readiness) return readiness
  return {
    ...readiness,
    marketClarity: readiness.market_clarity ?? readiness.marketClarity,
    moatStrength: readiness.moat_strength ?? readiness.moatStrength,
    retentionConfidence: readiness.retention_confidence ?? readiness.retentionConfidence,
    founderCredibility: readiness.founder_credibility ?? readiness.founderCredibility,
    overallScore: readiness.overall_score ?? readiness.overallScore,
  }
}

function camelCaseScenario(value: AnyRecord | null | undefined) {
  if (!value) return value
  const keyPoints = asArray<string>(value.key_points ?? value.keyPoints)
  return {
    ...value,
    key_points: keyPoints,
    keyPoints,
  }
}

function normalizeInvestment(value: AnyRecord | null | undefined) {
  if (!value) return value
  return {
    ...value,
    convictionScore: value.conviction_score ?? value.convictionScore,
    confidenceExplanation: value.confidence_explanation ?? value.confidenceExplanation,
    investorReadiness: camelReadiness(value.investor_readiness ?? value.investorReadiness),
    bullCase: camelCaseScenario(value.bull_case ?? value.bullCase),
    bearCase: camelCaseScenario(value.bear_case ?? value.bearCase),
    sourceDiversityMinimumMet: value.sourceDiversityMinimumMet ?? value.source_diversity_minimum_met,
    modelAttribution: value.modelAttribution ?? value.model_attribution,
  }
}

function normalizeCeoPlaybook(value: AnyRecord | null | undefined) {
  if (!value) return value
  const actions = asArray(value.actions).map((action, index) => {
    if (action && typeof action === 'object') return action
    return {
      rank: index + 1,
      timeframe: 'Next 90 days',
      action: String(action ?? 'Review available operating signal'),
      rationale: 'Recovered from legacy persisted action format.',
      impact: 'medium',
      evidenceRef: 'persisted analysis',
    }
  })
  return {
    ...value,
    actions,
    biggestRiskIgnored: value.biggest_risk_ignored ?? value.biggestRiskIgnored,
    unfairAdvantage: value.unfair_advantage ?? value.unfairAdvantage,
    groundedIn: asArray(value.groundedIn ?? value.grounded_in),
    modelAttribution: value.modelAttribution ?? value.model_attribution,
  }
}

function normalizeDelta(value: AnyRecord | null | undefined) {
  if (!value) return value
  const hasPriorData = value.hasPriorData ?? value.has_prior_data ?? false
  const overallShift = value.overallShift ?? value.overall_shift ?? 'largely_stable'
  const watchList = value.watchList ?? value.watch_list ?? []
  return {
    ...value,
    hasPriorData,
    has_prior_data: hasPriorData,
    overallShift,
    overall_shift: overallShift,
    watchList,
    watch_list: watchList,
  }
}

function normalizeUnknowns(value: any[] | null | undefined) {
  if (!Array.isArray(value)) return []
  return value.map((u) => ({
    ...u,
    unknown: u.unknown ?? u.area,
  }))
}

export function normalizeXrayResult<T extends AnyRecord | null | undefined>(result: T): T {
  if (!result) return result

  return {
    ...result,
    investment_analysis: normalizeInvestment(result.investment_analysis),
    ceo_playbook: normalizeCeoPlaybook(result.ceo_playbook),
    delta_analysis: normalizeDelta(result.delta_analysis),
    structured_unknowns: result.structured_unknowns ?? normalizeUnknowns(result.unknown_areas),
  }
}
