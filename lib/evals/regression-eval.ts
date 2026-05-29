// ─────────────────────────────────────────────────────────────────────────────
// lib/evals/regression-eval.ts
// Regression evaluation against golden benchmark companies.
// Tracks: confidence drift, recommendation drift, narrative stability,
// contradiction frequency, schema pass rate over time.
// Doc 5 (eval infra), Doc 6 #5, Doc 7 #27, Doc 8
// ─────────────────────────────────────────────────────────────────────────────

export interface GoldenCompany {
  companyId:              string
  name:                   string
  sector:                 string
  knownRisks:             string[]   // signals we EXPECT to appear
  knownStrengths:         string[]   // signals we EXPECT to appear
  expectedRecommendation: 'strong_yes' | 'conditional_yes' | 'conditional_no' | 'strong_no' | 'insufficient_data'
  expectedConfidenceBand: [number, number]  // [min, max] acceptable confidence_score
  knownFacts:             string[]   // ground truth facts the analysis must surface
  marketTruths:           string[]   // known strategic truths about this company
}

// ── Golden dataset (Doc 7 #27, Doc 8) ─────────────────────────────────────────
// These are known companies with documented outcomes. Used for regression testing.
export const GOLDEN_DATASET: GoldenCompany[] = [
  {
    companyId:              'swiggy',
    name:                   'Swiggy',
    sector:                 'food_delivery',
    knownRisks:             ['coupon_dependency', 'pricing_fragility', 'moat_weakness', 'churn_risk'],
    knownStrengths:         ['operational_density', 'logistics_network', 'brand_recognition'],
    expectedRecommendation: 'conditional_yes',
    expectedConfidenceBand: [45, 75],
    knownFacts: [
      'Swiggy competes directly with Zomato in most Indian metro markets',
      'Heavy discount dependency in customer acquisition',
      'Strong logistics and hyperlocal delivery network',
      'Unit economics challenged by high delivery costs',
    ],
    marketTruths: [
      'Food delivery in India has duopoly dynamics',
      'CAC remains high due to promotional competition',
      'Retention without discounts is structurally weak',
    ],
  },
  {
    companyId:              'zepto',
    name:                   'Zepto',
    sector:                 'quick_commerce',
    knownRisks:             ['pricing_fragility', 'coupon_dependency', 'competitive_pressure'],
    knownStrengths:         ['speed_differentiation', 'dark_store_density', 'retention_strength'],
    expectedRecommendation: 'conditional_yes',
    expectedConfidenceBand: [50, 80],
    knownFacts: [
      'Zepto pioneered 10-minute grocery delivery in India',
      'Dark store model creates operational leverage',
      'Competing with Blinkit (Zomato) and Swiggy Instamart',
    ],
    marketTruths: [
      'Quick commerce requires dense dark store network to be viable',
      'Speed is primary differentiator vs traditional delivery',
    ],
  },
  {
    companyId:              'cred',
    name:                   'CRED',
    sector:                 'fintech',
    knownRisks:             ['monetization_risk', 'moat_weakness', 'pricing_fragility'],
    knownStrengths:         ['brand_premium', 'high_intent_user_base', 'retention_strength'],
    expectedRecommendation: 'conditional_yes',
    expectedConfidenceBand: [40, 70],
    knownFacts: [
      'CRED targets premium credit card users with rewards and lifestyle offers',
      'Revenue model evolved through fintech services and commerce',
      'Strong brand recognition among urban premium users',
    ],
    marketTruths: [
      'Premium user segment in India is small but high-value',
      'Credit card reward programs create natural engagement',
    ],
  },
  {
    companyId:              'zomato',
    name:                   'Zomato',
    sector:                 'food_delivery',
    knownRisks:             ['pricing_fragility', 'competitive_pressure', 'coupon_dependency'],
    knownStrengths:         ['brand_recognition', 'operational_density', 'blinkit_synergy'],
    expectedRecommendation: 'conditional_yes',
    expectedConfidenceBand: [50, 80],
    knownFacts: [
      'Zomato is publicly listed and a market leader in Indian food delivery',
      'Acquired Blinkit for quick commerce expansion',
      'Improved unit economics post-restructuring',
    ],
    marketTruths: [
      'Zomato and Swiggy dominate Indian food delivery duopoly',
      'Blinkit integration adds revenue diversification',
    ],
  },
  {
    companyId:              'phonepe',
    name:                   'PhonePe',
    sector:                 'payments',
    knownRisks:             ['competitive_pressure', 'regulatory_risk', 'moat_weakness'],
    knownStrengths:         ['upi_market_share', 'trust_signals', 'ecosystem_integration'],
    expectedRecommendation: 'conditional_yes',
    expectedConfidenceBand: [55, 80],
    knownFacts: [
      'PhonePe is one of the top UPI payment apps in India',
      'Strong merchant network and consumer trust',
      'Competes with Google Pay and Paytm',
    ],
    marketTruths: [
      'UPI market in India is dominated by PhonePe and Google Pay',
      'Monetisation of UPI transactions is limited by regulation',
    ],
  },
]

// ── Regression eval result ─────────────────────────────────────────────────────
export interface RegressionEvalResult {
  companyId:             string
  passed:                boolean
  score:                 number   // 0–100
  expectedRisksCovered:  string[]
  missingRisks:          string[]
  expectedStrengthsCovered: string[]
  missingStrengths:      string[]
  recommendationMatch:   boolean
  confidenceInBand:      boolean
  knownFactsCovered:     number   // count
  totalKnownFacts:       number
  failures:              string[]
  warnings:              string[]
}

export function runRegressionEval(
  analysis:   Record<string, unknown>,
  investment: Record<string, unknown> | null,
  companyId:  string,
): RegressionEvalResult | null {
  const golden = GOLDEN_DATASET.find(g => g.companyId === companyId)
  if (!golden) return null

  const failures: string[] = []
  const warnings: string[] = []

  // Extract signal IDs from analysis
  const signalIds = (analysis.signal_canonical_ids as string[] | undefined) ?? []
  const fullText  = JSON.stringify(analysis).toLowerCase()

  // 1. Check known risks coverage
  const coveredRisks  = golden.knownRisks.filter(r => signalIds.includes(r) || fullText.includes(r.replace(/_/g, ' ')))
  const missingRisks  = golden.knownRisks.filter(r => !coveredRisks.includes(r))
  if (missingRisks.length > 0) {
    failures.push(`Missing expected risk signals: ${missingRisks.join(', ')}`)
  }

  // 2. Check known strengths coverage
  const coveredStrengths = golden.knownStrengths.filter(s => signalIds.includes(s) || fullText.includes(s.replace(/_/g, ' ')))
  const missingStrengths = golden.knownStrengths.filter(s => !coveredStrengths.includes(s))
  if (missingStrengths.length > 2) {
    warnings.push(`Missing expected strength signals: ${missingStrengths.join(', ')}`)
  }

  // 3. Recommendation match
  const actualReco    = (investment?.recommendation as string | undefined) ?? 'insufficient_data'
  const recoMatch     = actualReco === golden.expectedRecommendation
  if (!recoMatch) {
    warnings.push(`Recommendation mismatch: expected "${golden.expectedRecommendation}", got "${actualReco}"`)
  }

  // 4. Confidence band
  const confScore       = (analysis.confidence_score as number | undefined) ?? 0
  const [minConf, maxConf] = golden.expectedConfidenceBand
  const confidenceInBand  = confScore >= minConf && confScore <= maxConf
  if (!confidenceInBand) {
    warnings.push(`Confidence ${confScore} outside expected band [${minConf}, ${maxConf}]`)
  }

  // 5. Known facts coverage (keyword heuristic)
  const factsKeywords     = golden.knownFacts.map(f =>
    f.toLowerCase().split(' ').filter(w => w.length > 4).slice(0, 3).join(' ')
  )
  const knownFactsCovered = factsKeywords.filter(kw => fullText.includes(kw)).length

  if (knownFactsCovered < golden.knownFacts.length * 0.5) {
    warnings.push(`Only ${knownFactsCovered}/${golden.knownFacts.length} known facts surfaced in analysis`)
  }

  const score = Math.max(0, Math.min(100,
    100
    - failures.length * 15
    - warnings.length * 5
    + (recoMatch ? 5 : 0)
    + (confidenceInBand ? 5 : 0)
  ))

  return {
    companyId,
    passed:                    failures.length === 0,
    score,
    expectedRisksCovered:      coveredRisks,
    missingRisks,
    expectedStrengthsCovered:  coveredStrengths,
    missingStrengths,
    recommendationMatch:       recoMatch,
    confidenceInBand,
    knownFactsCovered,
    totalKnownFacts:           golden.knownFacts.length,
    failures,
    warnings,
  }
}

// ── Eval run summary ───────────────────────────────────────────────────────────
export interface EvalRunSummary {
  runAt:             string
  promptVersion:     string
  pipelineVersion:   string
  structural:  { passed: boolean; score: number }
  grounding:   { passed: boolean; score: number; unsupportedCount: number }
  consistency: { passed: boolean; score: number; violationCount: number }
  regression:  RegressionEvalResult | null
  overallScore: number
  overallPassed: boolean
}

export function buildEvalSummary(params: {
  structural:  { passed: boolean; score: number }
  grounding:   { passed: boolean; score: number; metrics: { unsupportedCount: number } }
  consistency: { passed: boolean; score: number; violations: unknown[] }
  regression:  RegressionEvalResult | null
  promptVersion:   string
  pipelineVersion: string
}): EvalRunSummary {
  const { structural, grounding, consistency, regression, promptVersion, pipelineVersion } = params

  const overallScore = Math.round(
    structural.score  * 0.3 +
    grounding.score   * 0.35 +
    consistency.score * 0.25 +
    (regression?.score ?? 100) * 0.1
  )

  return {
    runAt:           new Date().toISOString(),
    promptVersion,
    pipelineVersion,
    structural:  { passed: structural.passed,  score: structural.score },
    grounding:   { passed: grounding.passed,   score: grounding.score, unsupportedCount: grounding.metrics.unsupportedCount },
    consistency: { passed: consistency.passed, score: consistency.score, violationCount: consistency.violations.length },
    regression,
    overallScore,
    overallPassed: overallScore >= 65 && structural.passed && consistency.passed,
  }
}
