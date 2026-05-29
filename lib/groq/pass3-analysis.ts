// lib/groq/pass3-analysis.ts
import { callGroq, TEMPERATURES, TOKEN_BUDGETS, budgetClusters, makeAttribution } from './client'
import { Pass3OutputSchema, safeParseWithFallback } from '@/lib/intelligence/schemas'
import { runQualityGate, scoreStructuralQuality } from '@/lib/quality-gate'
import { nowISO, SCHEMA_VERSION } from '@/lib/intelligence'
import { logTelemetry } from '@/lib/quality-gate'
import { rankAndFilterClusters } from '@/lib/intelligence/signals'
import type { Pass3Output } from '@/lib/intelligence/schemas'

export async function analyzeWithFramework(
  companyName: string,
  category:    string,
  clusters:    any[],
  competitorContext?: string
): Promise<Record<string, unknown>> {

  // Doc 8 #2 — rank by retrievalPriority before feeding to LLM
  const rankedClusters = rankAndFilterClusters(clusters, 5)
  const budgeted       = budgetClusters(rankedClusters, 300)

  const clusterText = budgeted
    .map(c => `- ${c.cluster_name} (${c.percentage}%, conf:${c.confidence ?? 0.7}, rev_impact:${c.revenueImpactScore ?? 0.5}): ${c.summary}`)
    .join('\n')

  let raw: unknown
  const start = Date.now()
  try {
    raw = await callGroq(
      `You are a senior partner at a top-tier VC firm doing investor-grade due diligence. You think like an operating partner, not a consultant. Never state the obvious. Every insight must be specific, evidence-backed, and operationally relevant. Return ONLY valid JSON. No markdown.`,
      `Company: ${companyName} (${category})
Positioning: AI-native due diligence copilot for early-stage investors.

User behavior clusters (ranked by strategic importance):
${clusterText}
${competitorContext ? `\nComparative context:\n${competitorContext}` : ''}

Return compact investor-grade JSON. Keep each field under 30 words. Be specific and opinionated.
{
  "explore_hook": "One non-obvious truth about this business (max 12 words)",
  "one_line_insight": "Investor-grade verdict on why this wins or is vulnerable (max 18 words)",
  "core_narrative": "One screenshottable thesis sentence combining strength and biggest risk",
  "contradictions": [{ "signalA": "...", "signalB": "...", "contradictionType": "pricing_vs_retention", "severity": "major" }],
  "unknown_areas": [{ "area": "enterprise adoption", "unknownType": "enterprise_presence_unknown", "impact": "high" }],
  "missing_critical_signals": ["no enterprise adoption signals"],
  "money_engine": {
    "headline": "What actually makes money",
    "detail": "2 sentences with evidence",
    "defensibility": 7,
    "so_what_founder": "What this means if building in this space",
    "so_what_investor": "What this means for investment thesis",
    "evidence": "which cluster supports this",
    "evidence_refs": [{ "sourceType": "play_store", "sourceName": "Google Play Reviews", "confidence": 0.72, "extractedClaim": "specific claim from data" }]
  },
  "retention_architecture": {
    "headline": "Real lock-in mechanism",
    "switching_cost": "specific cost to leave",
    "lock_in_mechanism": "what keeps users",
    "vulnerable_segment": "who could leave easiest",
    "so_what_founder": "how to exploit this",
    "so_what_investor": "retention risk for diligence",
    "evidence": "cluster name",
    "evidence_refs": [{ "sourceType": "play_store", "sourceName": "Google Play Reviews", "confidence": 0.68, "extractedClaim": "specific claim" }]
  },
  "moat_analysis": {
    "headline": "What is hard to replicate",
    "moat_type": "network_effect",
    "strength": "growing or eroding",
    "replication_cost": "what competitor needs",
    "so_what_founder": "where moat is weakest",
    "so_what_investor": "moat durability assessment",
    "evidence": "cluster name",
    "evidence_refs": [{ "sourceType": "play_store", "sourceName": "Google Play Reviews", "confidence": 0.65, "extractedClaim": "specific claim" }]
  },
  "demand_quality": {
    "headline": "Choice or default?",
    "demand_type": "discount-driven",
    "complaint_pattern": "what complaints reveal structurally",
    "unmet_need": "specific gap a startup could fill",
    "so_what_founder": "product decision to fix this",
    "so_what_investor": "demand quality risk",
    "evidence": "cluster name",
    "evidence_refs": [{ "sourceType": "play_store", "sourceName": "Google Play Reviews", "confidence": 0.70, "extractedClaim": "specific claim" }]
  },
  "failure_surface": {
    "headline": "The crack that could break this",
    "core_assumption": "single assumption they cannot be wrong about",
    "early_signals": "warning signs visible in data",
    "risk_level": "high",
    "so_what_investor": "leading indicator to monitor in diligence",
    "evidence": "cluster + count",
    "evidence_refs": [{ "sourceType": "play_store", "sourceName": "Google Play Reviews", "confidence": 0.75, "extractedClaim": "specific claim" }]
  },
  "strategic_opportunity": {
    "headline": "Specific gap to exploit",
    "target_segment": "exact underserved investor or operator type",
    "gap": "what is missing",
    "playbook": ["Step 1 (0-30d): specific action","Step 2 (30-60d): specific action","Step 3 (60-90d): specific action"],
    "why_incumbent_cant_respond": "structural reason",
    "rough_cost": "order of magnitude",
    "so_what_founder": "is window still open"
  },
  "investor_readiness": {
    "market_clarity":       { "score": 7, "rationale": "one sentence" },
    "moat_strength":        { "score": 6, "rationale": "one sentence" },
    "scalability":          { "score": 7, "rationale": "one sentence" },
    "retention_confidence": { "score": 5, "rationale": "one sentence" },
    "founder_credibility":  { "score": 0, "rationale": "insufficient data from reviews" }
  },
  "decision_prompt": "If building in this space, the one decision this X-Ray should change is: ___"
}`,
      TEMPERATURES.analysis,
      TOKEN_BUDGETS.pass3_analysis,
      'pass3_analysis'
    )
  } catch (e: any) {
    logTelemetry({ eventType: 'pass_failed', passName: 'pass3_analysis', latencyMs: Date.now() - start, error: e.message, timestamp: nowISO() })
    throw e
  }

  // Doc 8 #1 — Zod safeParse immediately after parse
  const fallback = buildFallback(companyName, clusters)
  const normalizedRaw = normalizePass3Raw(raw)
  const { result, valid, errors } = safeParseWithFallback(Pass3OutputSchema, normalizedRaw, 'pass3_analysis', fallback)
  if (!valid) {
    logTelemetry({ eventType: 'zod_validation_failed', passName: 'pass3_analysis', latencyMs: 0, error: errors.slice(0, 3).join('; '), timestamp: nowISO() })
  }

  const gate = runQualityGate(result)

  return {
    ...result,
    _meta: {
      schemaVersion:   SCHEMA_VERSION,
      promptVersion:   'analysis-v4-evidence',
      model:           'llama-3.1-8b-instant',
      provider:        'groq',
      temperature:     TEMPERATURES.analysis,
      generatedAt:     nowISO(),
      qualityScore:    gate.score,
      zodValid:        valid,
      zodErrors:       valid ? [] : errors.slice(0, 5),
      retrieval_priority_used: true,
    },
  }
}

function normalizePass3Raw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const normalized: any = { ...(raw as any) }

  if (normalized.failure_surface?.risk_level) {
    const risk = String(normalized.failure_surface.risk_level).toLowerCase().trim()
    normalized.failure_surface = {
      ...normalized.failure_surface,
      risk_level: ['low', 'medium', 'high', 'critical'].includes(risk) ? risk : 'medium',
    }
  }

  if (Array.isArray(normalized.contradictions)) {
    const allowedTypes = new Set(['growth_vs_sentiment', 'pricing_vs_retention', 'hype_vs_usage', 'quality_vs_churn', 'moat_vs_competition'])
    const allowedSeverity = new Set(['minor', 'major', 'thesis_breaking'])
    normalized.contradictions = normalized.contradictions
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => {
        const rawType = String(item.contradictionType ?? item.contradiction_type ?? '').toLowerCase().trim()
        const rawSeverity = String(item.severity ?? '').toLowerCase().trim().replace(/\s+/g, '_')
        return {
          ...item,
          contradictionType: allowedTypes.has(rawType) ? rawType : 'growth_vs_sentiment',
          severity: allowedSeverity.has(rawSeverity) ? rawSeverity : 'major',
        }
      })
  }

  if (Array.isArray(normalized.unknown_areas)) {
    const allowedTypes = new Set(['market_data_missing', 'financials_missing', 'retention_unclear', 'enterprise_presence_unknown', 'pricing_data_missing', 'competitive_set_unclear'])
    const allowedImpact = new Set(['high', 'medium', 'low'])
    normalized.unknown_areas = normalized.unknown_areas
      .filter((item: any) => item && typeof item === 'object')
      .map((item: any) => {
        const unknownType = String(item.unknownType ?? item.unknown_type ?? '').toLowerCase().trim()
        const impact = String(item.impact ?? '').toLowerCase().trim()
        return {
          ...item,
          unknownType: allowedTypes.has(unknownType) ? unknownType : 'market_data_missing',
          impact: allowedImpact.has(impact) ? impact : 'medium',
        }
      })
  }

  return normalized
}

function buildFallback(companyName: string, clusters: any[]): Pass3Output {
  return {
    explore_hook:     `${companyName}: ${clusters[0]?.summary || 'Analysis based on user reviews'}`,
    one_line_insight: `${companyName} analysis — insufficient signal quality for confident assessment`,
    core_narrative:   `${companyName} — confidence limited by data quality`,
    money_engine:            { headline: 'Revenue from core product', detail: clusters[0]?.business_implication || 'Core product drives revenue', defensibility: 5, so_what_founder: 'Understand the revenue model depth', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    retention_architecture:  { headline: clusters[1]?.summary || 'User retention patterns', switching_cost: 'Moderate', lock_in_mechanism: clusters[0]?.cluster_name || 'habit', vulnerable_segment: 'price-sensitive users', so_what_founder: 'Target retention gaps', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    moat_analysis:           { headline: 'Scale and brand advantage', moat_type: 'brand', strength: 'stable', replication_cost: 'High investment needed', so_what_founder: 'Find the weak point', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    demand_quality:          { headline: 'Mixed demand signals', demand_type: 'habit', complaint_pattern: clusters[2]?.summary || 'See reviews', unmet_need: clusters[3]?.summary || 'Improvement areas', so_what_founder: 'Address top complaints', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    failure_surface:         { headline: clusters[clusters.length - 1]?.summary || 'Competitive pressure', core_assumption: 'User loyalty remains stable', early_signals: clusters[2]?.summary || 'Monitor reviews', risk_level: 'medium', so_what_investor: 'Watch churn rate and pricing sensitivity', evidence: 'reviews', evidence_refs: [] },
    strategic_opportunity:   { headline: 'Underserved user segments', target_segment: 'Power users', gap: 'Feature gaps', playbook: ['Step 1 (0-30d): Research underserved segment', 'Step 2 (30-60d): Build MVP', 'Step 3 (60-90d): Launch and measure'], why_incumbent_cant_respond: 'Too large to pivot fast' },
    contradictions:          [],
    unknown_areas:           [{ area: 'Full business analysis', unknownType: 'market_data_missing', impact: 'high' }],
    missing_critical_signals: ['fallback analysis — full data unavailable'],
  }
}
