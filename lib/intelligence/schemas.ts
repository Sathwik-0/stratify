// ─────────────────────────────────────────────────────────────────────────────
// lib/intelligence/schemas.ts
// Zod schemas for every Groq pass output.
// Every LLM response is validated here immediately after parse.
// Doc 8 #1 — structured output enforcement, not "AI behaving correctly"
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod'

// ── Evidence ref schema ───────────────────────────────────────────────────────
export const EvidenceRefSchema = z.object({
  sourceType:     z.enum(['website', 'review', 'linkedin', 'reddit', 'news', 'sec_filing', 'play_store', 'glassdoor', 'twitter', 'unknown']).default('play_store'),
  sourceName:     z.string().default('Google Play Reviews'),
  confidence:     z.number().min(0).max(1).default(0.65),
  url:            z.string().optional(),
  extractedClaim: z.string().min(1),
  timestamp:      z.string().optional(),
})

// ── Section schemas (discriminated, no Record<string, any>) ──────────────────
export const SectionBaseSchema = z.object({
  headline:        z.string().min(3),
  evidence:        z.string().min(1),
  evidence_refs:   z.array(EvidenceRefSchema).default([]),
})

export const MoneyEngineSchema = SectionBaseSchema.extend({
  detail:           z.string().min(5),
  defensibility:    z.number().min(1).max(10),
  so_what_founder:  z.string().min(3),
  so_what_investor: z.string().min(3).optional(),
})

export const RetentionArchitectureSchema = SectionBaseSchema.extend({
  switching_cost:    z.string().min(3),
  lock_in_mechanism: z.string().min(3),
  vulnerable_segment: z.string().min(3),
  so_what_founder:   z.string().min(3),
  so_what_investor:  z.string().optional(),
})

export const MoatAnalysisSchema = SectionBaseSchema.extend({
  moat_type:        z.string().min(2),
  strength:         z.string().min(2),
  replication_cost: z.string().min(3),
  so_what_founder:  z.string().min(3),
  so_what_investor: z.string().optional(),
})

export const DemandQualitySchema = SectionBaseSchema.extend({
  demand_type:      z.string().min(2),
  complaint_pattern: z.string().min(5),
  unmet_need:       z.string().min(5),
  so_what_founder:  z.string().min(3),
  so_what_investor: z.string().optional(),
})

export const FailureSurfaceSchema = SectionBaseSchema.extend({
  core_assumption: z.string().min(5),
  early_signals:   z.string().min(5),
  risk_level:      z.enum(['low', 'medium', 'high', 'critical']),
  so_what_investor: z.string().min(3),
})

export const StrategicOpportunitySchema = z.object({
  headline:                 z.string().min(3),
  target_segment:           z.string().min(3),
  gap:                      z.string().min(3),
  playbook:                 z.array(z.string()).min(1).max(5),
  why_incumbent_cant_respond: z.string().min(3),
  rough_cost:               z.string().optional(),
  so_what_founder:          z.string().optional(),
})

export const InvestorReadinessDimSchema = z.object({
  score:     z.number().min(0).max(10),
  rationale: z.string().min(3),
})

export const ContradictionSchema = z.object({
  signalA:           z.string().min(3),
  signalB:           z.string().min(3),
  contradictionType: z.enum(['growth_vs_sentiment', 'pricing_vs_retention', 'hype_vs_usage', 'quality_vs_churn', 'moat_vs_competition']),
  severity:          z.enum(['minor', 'major', 'thesis_breaking']),
})

export const StructuredUnknownSchema = z.object({
  area:        z.string().min(3),
  unknownType: z.enum(['market_data_missing', 'financials_missing', 'retention_unclear', 'enterprise_presence_unknown', 'pricing_data_missing', 'competitive_set_unclear']),
  impact:      z.enum(['high', 'medium', 'low']),
})

// ── Pass 1 output schema ──────────────────────────────────────────────────────
export const Pass1OutputSchema = z.array(z.object({
  text:        z.string().min(1),
  signal_type: z.enum(['retention', 'churn', 'pricing', 'trust', 'competitor', 'strategic']),
  key_phrase:  z.string().min(1),
  confidence:  z.number().min(0).max(1).default(0.7),
}))

export type Pass1Output = z.infer<typeof Pass1OutputSchema>

// ── Pass 2 output schema ──────────────────────────────────────────────────────
export const ClusterSchema = z.object({
  cluster_name:         z.string().min(3),
  percentage:           z.number().min(0).max(100),
  signal_types:         z.array(z.string()).default([]),
  summary:              z.string().min(5),
  evidence_count:       z.number().default(0),
  business_implication: z.string().min(5),
  trend:                z.enum(['rising', 'stable', 'falling', 'unknown']).default('unknown'),
  confidence:           z.number().min(0).max(1).default(0.7),
})

export const Pass2OutputSchema = z.array(ClusterSchema)
export type ClusterOutput = z.infer<typeof ClusterSchema>
export type Pass2Output = z.infer<typeof Pass2OutputSchema>

// ── Pass 3 (6-Force) output schema ───────────────────────────────────────────
export const Pass3OutputSchema = z.object({
  explore_hook:           z.string().min(5),
  one_line_insight:       z.string().min(10),
  core_narrative:         z.string().min(10),
  money_engine:           MoneyEngineSchema,
  retention_architecture: RetentionArchitectureSchema,
  moat_analysis:          MoatAnalysisSchema,
  demand_quality:         DemandQualitySchema,
  failure_surface:        FailureSurfaceSchema,
  strategic_opportunity:  StrategicOpportunitySchema,
  investor_readiness:     z.object({
    market_clarity:       InvestorReadinessDimSchema,
    moat_strength:        InvestorReadinessDimSchema,
    scalability:          InvestorReadinessDimSchema,
    retention_confidence: InvestorReadinessDimSchema,
    founder_credibility:  InvestorReadinessDimSchema,
  }).optional(),
  contradictions:           z.array(ContradictionSchema).default([]),
  unknown_areas:            z.array(StructuredUnknownSchema).default([]),
  missing_critical_signals: z.array(z.string()).default([]),
  decision_prompt:          z.string().optional(),
})

export type Pass3Output = z.infer<typeof Pass3OutputSchema>

// ── CEO Playbook output schema ────────────────────────────────────────────────
export const CeoActionSchema = z.object({
  rank:        z.number().min(1).max(3),
  timeframe:   z.string().min(3),
  action:      z.string().min(5),
  rationale:   z.string().min(5),
  impact:      z.enum(['high', 'medium', 'low']),
  evidenceRef: z.string().min(2),
})

export const CeoPlaybookOutputSchema = z.object({
  headline:           z.string().min(5),
  context:            z.string().min(5),
  actions:            z.array(CeoActionSchema).min(1).max(3),
  biggest_risk_ignored: z.string().min(5),
  unfair_advantage:   z.string().min(5),
})

export type CeoPlaybookOutput = z.infer<typeof CeoPlaybookOutputSchema>

// ── Investment analysis output schema ─────────────────────────────────────────
export const InvestmentOutputSchema = z.object({
  conviction_score:      z.number().min(0).max(100),
  recommendation:        z.enum(['strong_yes', 'conditional_yes', 'watchlist', 'pass']),
  confidence_explanation: z.string().min(10),
  investor_readiness: z.object({
    market_clarity:       InvestorReadinessDimSchema,
    moat_strength:        InvestorReadinessDimSchema,
    scalability:          InvestorReadinessDimSchema,
    retention_confidence: InvestorReadinessDimSchema,
    founder_credibility:  InvestorReadinessDimSchema,
  }),
  bull_case: z.object({
    thesis:     z.string().min(5),
    key_points: z.array(z.string()).min(1),
    scenario:   z.string().min(5),
  }),
  bear_case: z.object({
    thesis:     z.string().min(5),
    key_points: z.array(z.string()).min(1),
    scenario:   z.string().min(5),
  }),
})

export type InvestmentOutput = z.infer<typeof InvestmentOutputSchema>

// ── Delta synthesis output schema ─────────────────────────────────────────────
export const DeltaSynthesisSchema = z.object({
  overall_shift: z.enum(['significantly_changed', 'moderately_changed', 'largely_stable']),
  headline:      z.string().min(5),
  watch_list:    z.array(z.string()).default([]),
})

export type DeltaSynthesisOutput = z.infer<typeof DeltaSynthesisSchema>

// ── Safe parse with fallback (Doc 8 #1 — reject malformed before persistence) ──
export function safeParseWithFallback<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  passName: string,
  fallback: T
): { result: T; valid: boolean; errors: string[] } {
  const parsed = schema.safeParse(data)
  if (parsed.success) {
    return { result: parsed.data, valid: true, errors: [] }
  }
  const errors = parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
  console.warn(`[${passName}] Zod validation failed (${errors.length} errors) — using fallback`)
  console.warn(errors.slice(0, 5).join('\n'))
  return { result: fallback, valid: false, errors }
}

// ── Compare output schema (Doc — compare.ts was missing Zod) ─────────────────
export const CompareOutputSchema = z.object({
  winner:            z.string().min(1),
  verdict:           z.string().min(10),
  key_differences:   z.array(z.string()).min(1).max(6),
  strategic_insight: z.string().min(10),
  moat_comparison:   z.string().min(10),
  risk_comparison:   z.string().min(10),
  confidence:        z.number().min(0).max(100).optional(),
})

export type CompareOutput = z.infer<typeof CompareOutputSchema>

const COMPARE_FALLBACK: CompareOutput = {
  winner:            'Insufficient data',
  verdict:           'Analysis could not be completed with available data.',
  key_differences:   ['Insufficient data for comparison'],
  strategic_insight: 'Retry with more complete company data.',
  moat_comparison:   'Unable to assess.',
  risk_comparison:   'Unable to assess.',
}

export { COMPARE_FALLBACK }
