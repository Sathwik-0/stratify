// app/api/xray/poll/route.ts
// Clean state machine — reads job.status, runs AI pipeline only when scraped.
// All Apify removed. Structured error codes. Correlation IDs on every log.
export const runtime = 'nodejs'

import { NextRequest }  from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import {
  classifySignals, clusterSignals, analyzeWithFramework,
  generateCeoPlaybook, generateInvestmentAnalysis, generateDeltaAnalysis,
} from '@/lib/groq/index'
import {
  calculateConfidence, validateStructure, scoreStructuralQuality,
  logTelemetry, getTelemetrySummary, checkCrossAnalysisConsistency,
} from '@/lib/quality-gate'
import {
  nowISO, SCHEMA_VERSION, normalizeCompanyName, deriveStrategicContext,
  buildRetrievalContextHash, buildPromptInputHash, resolveSignalId,
  scoreToLevel, makeEvidenceId, categoriseHorizonRisks, computeMetaConfidence,
  resolveEntity, type EvidenceRef,
} from '@/lib/intelligence'
import { detectRetrievalPoisoning, enforceSourceDiversityMaximum } from '@/lib/intelligence/signals'

const PIPELINE_VERSION = 'v4-intelligence'
const PROMPT_VERSION   = 'analysis-v4-evidence'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeUpdateJob(jobId: string, updates: object, corrId = '') {
  try {
    await supabaseAdmin.from('jobs').update(updates).eq('id', jobId)
  } catch (e) {
    console.error(`[poll:${corrId}] safeUpdateJob failed:`, e)
  }
}

async function upsertXrayResult(payload: Record<string, unknown>, corrId: string): Promise<{ omittedColumns: string[] }> {
  const working = { ...payload }
  const omittedColumns: string[] = []

  for (let attempt = 0; attempt < 10; attempt++) {
    const { error } = await supabaseAdmin
      .from('xray_results')
      .upsert(working, { onConflict: 'company_id' })

    if (!error) return { omittedColumns }

    const missingColumn = error.message.match(/Could not find the '([^']+)' column/)?.[1]
    if (!missingColumn || !(missingColumn in working)) throw error

    omittedColumns.push(missingColumn)
    delete working[missingColumn]
    console.warn(`[poll:${corrId}] xray_results missing column "${missingColumn}" - omitting and retrying`)
  }

  throw new Error(`xray_results schema mismatch after omitting: ${omittedColumns.join(', ')}`)
}

function detectSilentFailures(reviews: any[], classified: any[]): {
  classificationThin: boolean; message?: string
} {
  if (reviews.length > 0 && classified.length < 5) {
    logTelemetry({ eventType: 'silent_failure_detected', passName: 'classification', latencyMs: 0, error: `only ${classified.length} signals from ${reviews.length} reviews`, timestamp: nowISO() })
    return { classificationThin: true, message: `Low signal density: ${classified.length} signals from ${reviews.length} reviews` }
  }
  return { classificationThin: false }
}

function collectEvidenceRefs(analysis: any): EvidenceRef[] {
  const sections = ['money_engine', 'retention_architecture', 'moat_analysis', 'demand_quality', 'failure_surface']
  const refs: EvidenceRef[] = []
  for (const section of sections) {
    const sec = analysis[section]
    if (!sec) continue
    const rawRefs = sec.evidence_refs ?? []
    for (const r of rawRefs) {
      refs.push({
        evidenceId:     makeEvidenceId(r.sourceType ?? 'play_store', r.extractedClaim ?? section),
        sourceType:     r.sourceType ?? 'play_store',
        sourceName:     r.sourceName ?? 'Google Play Reviews',
        confidence:     r.confidence ?? 0.65,
        extractedClaim: r.extractedClaim ?? sec.headline ?? section,
        timestamp:      nowISO(),
      })
    }
    if (rawRefs.length === 0 && sec.evidence) {
      refs.push({
        evidenceId:     makeEvidenceId('play_store', sec.evidence),
        sourceType:     'play_store',
        sourceName:     'Google Play Reviews',
        confidence:     0.65,
        extractedClaim: sec.evidence,
        timestamp:      nowISO(),
      })
    }
  }
  return refs
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let jobId  = ''
  let corrId = ''

  const { allowed, limit } = await checkRateLimit(req, '/api/xray/poll')
  if (!allowed) return rateLimitResponse(limit)

  try {
    const body = await req.json()
    jobId  = body.jobId
    if (!jobId) return Response.json({ error: 'jobId required' }, { status: 400 })

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('jobs').select('*, companies(*)')
      .eq('id', jobId).single()

    if (jobErr || !job) return Response.json({ error: 'Job not found' }, { status: 404 })

    corrId = (job.metadata as any)?.correlationId ?? jobId

    // ── Terminal states — return immediately ──────────────────────────────────
    if (job.status === 'completed') return Response.json({ status: 'completed' })
    if (job.status === 'failed') {
      const meta = job.metadata as any
      return Response.json({
        status:     'failed',
        error:      job.error_message,
        errorCode:  meta?.error_code  ?? 'unknown',
        stage:      meta?.failed_stage ?? 'scraping',
        retryable:  meta?.retryable    ?? true,
        partial:    meta?.partial      ?? null,
        correlationId: corrId,
      })
    }

    // ── Still scraping — start route's after() is running ────────────────────
    if (job.status === 'scraping' || job.status === 'pending') {
      const age = Date.now() - new Date(job.created_at).getTime()

      // Extended timeout: scraper needs up to 90s + buffer
      if (age > 5 * 60 * 1000) {
        await safeUpdateJob(jobId, {
          status:        'failed',
          error_message: `Scraping timed out after 5 minutes for "${job.companies?.name}". This usually means the app was not found on Google Play, or Play Store is temporarily unavailable.`,
          completed_at:  nowISO(),
          metadata: {
            ...(job.metadata as any ?? {}),
            error_code:   'scraper_timeout',
            failed_stage: 'scraping',
            retryable:    true,
          },
        }, corrId)
        return Response.json({
          status:   'failed',
          error:    'Scraping timed out — Google Play may be slow or the app may not exist. Try again in a few minutes.',
          errorCode: 'scraper_timeout',
          stage:    'scraping',
          retryable: true,
          correlationId: corrId,
        })
      }

      return Response.json({ status: 'scraping', correlationId: corrId })
    }

    // ── Reviews ready — run AI pipeline ──────────────────────────────────────
    if (job.status === 'scraped') {
      const company     = job.companies
      const companyName = normalizeCompanyName(company.name)
      const meta        = job.metadata as any

      const reviews: { text: string; rating: number | null }[] = meta?.reviews ?? []

      if (reviews.length === 0) {
        await safeUpdateJob(jobId, {
          status:        'failed',
          error_message: 'No reviews found in job data. Scraping may have succeeded but returned empty results.',
          completed_at:  nowISO(),
          metadata: { ...meta, error_code: 'no_reviews_found', failed_stage: 'scraping', retryable: false },
        }, corrId)
        return Response.json({ status: 'failed', error: 'No reviews extracted', errorCode: 'no_reviews_found', stage: 'scraping', retryable: false })
      }

      // ── Pass 1: Classify ──────────────────────────────────────────────────
      await safeUpdateJob(jobId, {
        status: 'classifying', current_step: 'Classifying intelligence signals...', progress_percent: 25,
      }, corrId)

      const poisoning     = detectRetrievalPoisoning(reviews)
      const resolvedEntity = resolveEntity(companyName)

      if (poisoning.detected && poisoning.severity === 'high') {
        console.warn(`[poll:${corrId}] High poisoning for ${companyName}:`, poisoning.signals)
        logTelemetry({ eventType: 'retrieval_poisoning_detected', passName: 'extraction', latencyMs: 0, error: poisoning.signals.join('; '), timestamp: nowISO() })
      }

      try {
        await supabaseAdmin.from('raw_data').upsert(
          reviews.map(r => ({ company_id: company.id, source: 'play_store', content: r.text, rating: r.rating })),
          { onConflict: 'company_id,source,content_hash', ignoreDuplicates: true }
        )
      } catch (e) { console.error(`[poll:${corrId}] raw_data insert:`, e) }

      let classified: any[] = []
      try {
        classified = await classifySignals(reviews.map(r => r.text)) || []
        if (classified.length) {
          await supabaseAdmin.from('signals').insert(
            classified.map((s: any) => ({
              company_id:          company.id,
              signal_type:         s.signal_type || 'retention',
              text:                (s.key_phrase || s.text || '').slice(0, 500),
              source:              'play_store',
              confidence:          s.confidence ?? 0.7,
              canonical_signal_id: resolveSignalId(s.key_phrase || s.text || ''),
            }))
          )
        }
      } catch (e: any) {
        console.error(`[poll:${corrId}] classify error:`, e.message)
        logTelemetry({ eventType: 'fallback_used', passName: 'pass1_classify', latencyMs: 0, error: e.message, timestamp: nowISO() })
      }

      const { classificationThin, message: thinMsg } = detectSilentFailures(reviews, classified)
      if (thinMsg) console.warn(`[poll:${corrId}] ${thinMsg}`)

      // ── Pass 2: Cluster ───────────────────────────────────────────────────
      await safeUpdateJob(jobId, {
        status: 'analyzing', current_step: 'Building investor-grade intelligence...', progress_percent: 50, review_count: reviews.length,
      }, corrId)

      let clusters: any[] = []
      try {
        clusters = await clusterSignals(classified, companyName) || []
        await supabaseAdmin.from('clusters').delete().eq('company_id', company.id)
        if (clusters.length) {
          await supabaseAdmin.from('clusters').insert(
            clusters.map((c: any) => ({
              company_id: company.id, cluster_name: c.cluster_name || 'General',
              percentage: c.percentage || 0, summary: c.summary || '', signal_types: c.signal_types || [],
            }))
          )
        }
      } catch (e: any) { console.error(`[poll:${corrId}] cluster error:`, e.message) }

      let competitorContext = ''
      try {
        const { data: competitors } = await supabaseAdmin
          .from('xray_results').select('one_line_insight').neq('company_id', company.id).limit(2)
        if (competitors?.length) competitorContext = competitors.map((c: any) => `- ${c.one_line_insight}`).join('\n')
      } catch { /* noop */ }

      // ── Pass 3: Analysis ──────────────────────────────────────────────────
      let analysis: any = {}
      const analysisFallback = buildAnalysisFallback(companyName, clusters, reviews.length)

      try {
        analysis = await analyzeWithFramework(companyName, company.category, clusters, competitorContext)
      } catch (e: any) {
        console.error(`[poll:${corrId}] analysis error — using fallback:`, e.message)
        logTelemetry({ eventType: 'fallback_used', passName: 'pass3_analysis', latencyMs: 0, error: e.message, timestamp: nowISO() })
        analysis = analysisFallback
      }

      // ── Confidence ────────────────────────────────────────────────────────
      const signalTypes  = new Set(classified.map((s: any) => s.signal_type))
      const structCheck  = validateStructure(analysis)
      const qualCheck    = scoreStructuralQuality(analysis)

      const { score: rawScore, breakdown, explanation: confidenceExplanation } = calculateConfidence({
        reviewCount:       reviews.length,
        sourceCount:       1,
        clusterCount:      clusters.length,
        signalVariety:     signalTypes.size,
        newsPresent:       false,
        qualityGatePassed: qualCheck.pass,
        dataAgeHours:      0,
        structureValid:    structCheck.valid,
        fullyGrounded:     !qualCheck.evidenceDensity || qualCheck.evidenceDensity > 0.5,
      })

      const finalScore = classificationThin ? Math.min(rawScore, 40) : rawScore
      const finalLevel = scoreToLevel(finalScore)

      // ── Extended passes ───────────────────────────────────────────────────
      await safeUpdateJob(jobId, { status: 'analyzing', current_step: 'Generating investor playbook...', progress_percent: 70 }, corrId)

      const evidenceRefs     = collectEvidenceRefs(analysis)
      const enforcedRefs     = enforceSourceDiversityMaximum(evidenceRefs)
      const strategicContext = deriveStrategicContext(companyName, analysis, finalScore)
      const signalTypesList  = Array.from(signalTypes)

      const metaConf = computeMetaConfidence({
        sourceCount: 1, sourceTypes: signalTypesList,
        contradictions: analysis.contradictions ?? [], unknowns: analysis.unknown_areas ?? [],
        reviewCount: reviews.length, qualityScore: qualCheck.qualityScore,
      })

      const [ceoResult, investResult, priorData] = await Promise.allSettled([
        generateCeoPlaybook(companyName, clusters, strategicContext),
        generateInvestmentAnalysis(companyName, clusters, strategicContext, enforcedRefs),
        supabaseAdmin.from('xray_results').select('*').eq('company_id', company.id).single(),
      ])

      const ceo        = ceoResult.status    === 'fulfilled' ? ceoResult.value        : null
      const investment = investResult.status === 'fulfilled' ? investResult.value      : null
      const prior      = priorData.status    === 'fulfilled' ? priorData.value?.data   : null

      const delta = await generateDeltaAnalysis(companyName, analysis, prior, prior?.created_at ?? undefined)

      const harmonization = checkCrossAnalysisConsistency(analysis, ceo, investment)
      if (!harmonization.consistent) {
        logTelemetry({ eventType: 'quality_gate_failed', passName: 'harmonization', latencyMs: 0, error: harmonization.issues.join('; '), timestamp: nowISO() })
      }

      const horizonRisks       = categoriseHorizonRisks(analysis)
      const reviewIds          = reviews.slice(0, 50).map((_, i) => `${company.id}_r${i}`)
      const clusterNames       = clusters.map((c: any) => c.cluster_name)
      const retrievalHash      = buildRetrievalContextHash(reviewIds, clusterNames)
      const promptHash         = buildPromptInputHash(retrievalHash, PROMPT_VERSION, clusterNames, { pass: 3 })
      const signalCanonicalIds = clusters.map((c: any) => resolveSignalId(c.cluster_name))

      // ── Evals (non-blocking) ──────────────────────────────────────────────
      let evalSummary: Record<string, unknown> | null = null
      try {
        const { runStructuralEval }                   = await import('@/lib/evals/structural-eval')
        const { runGroundingEval }                    = await import('@/lib/evals/grounding-eval')
        const { runConsistencyEval }                  = await import('@/lib/evals/consistency-eval')
        const { runRegressionEval, buildEvalSummary } = await import('@/lib/evals/regression-eval')

        const sr = runStructuralEval(analysis  as Record<string, unknown>)
        const gr = runGroundingEval(analysis   as Record<string, unknown>, enforcedRefs, reviews.length)
        const cr = runConsistencyEval(analysis as Record<string, unknown>, ceo as Record<string, unknown> | null, investment as Record<string, unknown> | null)
        const rr = runRegressionEval(analysis  as Record<string, unknown>, investment as Record<string, unknown> | null, company.slug)

        evalSummary = buildEvalSummary({ structural: sr, grounding: gr, consistency: cr, regression: rr, promptVersion: PROMPT_VERSION, pipelineVersion: PIPELINE_VERSION }) as unknown as Record<string, unknown>

        if (!sr.passed) logTelemetry({ eventType: 'quality_gate_failed', passName: 'structural_eval',  latencyMs: 0, error: sr.failures.join('; '), timestamp: nowISO() })
        if (!gr.passed) logTelemetry({ eventType: 'quality_gate_failed', passName: 'grounding_eval',   latencyMs: 0, error: `${gr.metrics.unsupportedCount} unsupported claims`, timestamp: nowISO() })
        if (!cr.passed) logTelemetry({ eventType: 'quality_gate_failed', passName: 'consistency_eval', latencyMs: 0, error: cr.violations.map((v: any) => v.description).join('; '), timestamp: nowISO() })

        console.log(`[poll:${corrId}] evals structural=${sr.score} grounding=${gr.score} consistency=${cr.score}`)
      } catch (evalErr: unknown) {
        console.warn(`[poll:${corrId}] eval pipeline (non-blocking):`, evalErr instanceof Error ? evalErr.message : evalErr)
      }

      // Signal threshold gate (non-blocking)
      try {
        const { checkSignalThresholds } = await import('@/lib/intelligence/grounding')
        const t = checkSignalThresholds({ clusters, evidenceRefs: enforcedRefs, reviewCount: reviews.length, sourceTypes: ['play_store'] })
        if (!t.allowed || t.warnings.length > 0) console.warn(`[poll:${corrId}] thresholds:`, t.warnings.join(' | '))
      } catch { /* noop */ }

      // ── Persist ───────────────────────────────────────────────────────────
      await safeUpdateJob(jobId, { status: 'analyzing', current_step: 'Storing intelligence objects...', progress_percent: 90 }, corrId)

      try {
        const xrayPayload = {
          company_id:               company.id,
          one_line_insight:         analysis.one_line_insight        || '',
          core_narrative:           analysis.core_narrative          || '',
          money_engine:             analysis.money_engine            || {},
          retention_architecture:   analysis.retention_architecture  || {},
          moat_analysis:            analysis.moat_analysis           || {},
          demand_quality:           analysis.demand_quality          || {},
          failure_surface:          analysis.failure_surface         || {},
          strategic_opportunity:    analysis.strategic_opportunity   || {},
          explore_card_insight:     analysis.explore_hook            || analysis.one_line_insight || '',
          decision_prompt:          analysis.decision_prompt         || '',
          evidence_refs:            enforcedRefs,
          contradictions:           (analysis.contradictions         || []).slice(0, 6),
          unknown_areas:            (analysis.unknown_areas          || []).slice(0, 5),
          missing_critical_signals: analysis.missing_critical_signals || [],
          investor_readiness:       analysis.investor_readiness      || {},
          ceo_playbook:             ceo        || null,
          investment_analysis:      investment || null,
          delta_analysis:           delta,
          horizon_risks:            horizonRisks,
          confidence_score:         finalScore,
          confidence_level:         finalLevel,
          confidence_breakdown:     breakdown,
          confidence_explanation:   confidenceExplanation,
          review_count:             reviews.length,
          source_count:             1,
          data_sources:             ['play_store'],
          pipeline_version:         PIPELINE_VERSION,
          prompt_version:           PROMPT_VERSION,
          schema_version:           SCHEMA_VERSION,
          generated_by:             { model:'llama-3.1-8b-instant', provider: 'groq', temperature: 0.3, promptVersion: PROMPT_VERSION },
          retrieval_context_hash:   retrievalHash,
          prompt_input_hash:        promptHash,
          signal_canonical_ids:     signalCanonicalIds,
          harmonization_passed:     harmonization.consistent,
          harmonization_issues:     harmonization.issues,
          poisoning_detected:       poisoning.detected,
          poisoning_signals:        poisoning.signals,
          meta_confidence:          metaConf,
          ...(resolvedEntity ? { canonical_entity_id: resolvedEntity.canonicalEntityId } : {}),
          zod_validation_passed:    !((analysis as any)._meta?.zodErrors?.length > 0),
          zod_errors:               (analysis as any)._meta?.zodErrors ?? [],
          eval_summary:             evalSummary,
          revenue_impact_scores:    clusters.reduce((acc: Record<string, number>, c: any) => { acc[c.cluster_name] = c.revenueImpactScore ?? 0.5; return acc }, {}),
          cache_status:             'fresh',
          generated_at:             nowISO(),
        }
        await upsertXrayResult(xrayPayload, corrId)
      } catch (e: any) {
        console.error(`[poll:${corrId}] xray_results upsert:`, e.message)
        await safeUpdateJob(jobId, {
          status:        'failed',
          error_message: `Database persistence failed while storing X-Ray result: ${e.message}`,
          completed_at:  nowISO(),
          metadata: {
            ...meta,
            correlationId: corrId,
            error_code:   'persistence_failed',
            failed_stage: 'persistence',
            retryable:    true,
            partial: {
              review_count: reviews.length,
              clusters:     clusters.slice(0, 5),
              analysis_preview: {
                one_line_insight: analysis.one_line_insight,
                core_narrative:   analysis.core_narrative,
              },
            },
          },
        }, corrId)
        return Response.json({
          status:        'failed',
          error:         `Could not store X-Ray result: ${e.message}`,
          errorCode:     'persistence_failed',
          stage:         'persistence',
          retryable:     true,
          correlationId: corrId,
        })
      }

      // Temporal signals
      try {
        for (const canonicalId of signalCanonicalIds) {
          const mc = clusters.find((c: any) => resolveSignalId(c.cluster_name) === canonicalId)
          if (!mc) continue
          const newPt = { timestamp: nowISO(), score: mc.percentage ?? 0, confidence: mc.confidence ?? 0.7, sourceHash: retrievalHash }
          const { data: ex } = await supabaseAdmin.from('temporal_signals').select('data_points').eq('company_id', company.id).eq('signal_id', canonicalId).single()
          const allPts = [...(ex?.data_points ?? []), newPt].slice(-20)
          await supabaseAdmin.from('temporal_signals').upsert({ company_id: company.id, signal_id: canonicalId, data_points: allPts, trend_direction: mc.trend ?? 'unknown', acceleration: 0, last_updated_at: nowISO() }, { onConflict: 'company_id,signal_id' })
        }
      } catch (e: any) { console.error(`[poll:${corrId}] temporal:`, e.message) }

      // Telemetry
      try {
        const { events } = getTelemetrySummary()
        if (events.length > 0) {
          await supabaseAdmin.from('telemetry_events').insert(
            events.slice(-20).map(e => ({
              company_id: company.id, job_id: jobId, event_type: e.eventType,
              pass_name: e.passName, latency_ms: e.latencyMs, token_estimate: e.tokenEstimate ?? null,
              error_message: e.error ?? null, occurred_at: e.timestamp,
            }))
          )
        }
      } catch (e: any) { console.error(`[poll:${corrId}] telemetry:`, e.message) }

      // Explore card
      try {
        await supabaseAdmin.from('explore_cards').upsert({
          company_id: company.id, hook_line: analysis.explore_hook || analysis.one_line_insight || '',
          sub_line: analysis.one_line_insight || '', category: company.category,
          confidence_score: finalScore, last_updated: nowISO(),
        }, { onConflict: 'company_id' })
      } catch (e: any) { console.error(`[poll:${corrId}] explore_cards:`, e.message) }

      try {
        await supabaseAdmin.from('companies').update({ last_analyzed_at: nowISO() }).eq('id', company.id)
      } catch { /* noop */ }

      await safeUpdateJob(jobId, {
        status: 'completed', current_step: 'Investor intelligence complete', progress_percent: 100, completed_at: nowISO(),
      }, corrId)

      return Response.json({ status: 'completed', correlationId: corrId })
    }

    return Response.json({ status: job.status || 'pending', correlationId: corrId })

  } catch (err: any) {
    console.error(`[poll:${corrId}] PIPELINE ERROR:`, err)
    if (jobId) {
      await safeUpdateJob(jobId, {
        status: 'failed', error_message: err.message || 'Unknown pipeline error', completed_at: nowISO(),
        metadata: { correlationId: corrId, error_code: 'unknown', failed_stage: 'synthesis' },
      }, corrId)
    }
    return Response.json({ status: 'failed', error: err.message || 'Pipeline error', errorCode: 'unknown', correlationId: corrId }, { status: 500 })
  }
}

// ── Analysis fallback ─────────────────────────────────────────────────────────

function buildAnalysisFallback(companyName: string, clusters: any[], reviewCount: number): any {
  return {
    explore_hook:            `${companyName}: ${clusters[0]?.summary || 'Analysis based on user reviews'}`,
    one_line_insight:        `${companyName} — partial analysis from ${reviewCount} reviews`,
    core_narrative:          `${companyName} — AI synthesis failed; showing extracted signal clusters only`,
    money_engine:            { headline: 'Revenue model', detail: clusters[0]?.business_implication || 'See clusters', defensibility: 5, so_what_founder: 'Understand the revenue model', so_what_investor: 'Revenue model requires deeper diligence', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    retention_architecture:  { headline: clusters[1]?.summary || 'Retention patterns', switching_cost: 'Moderate', lock_in_mechanism: clusters[0]?.cluster_name || 'habit', vulnerable_segment: 'price-sensitive users', so_what_founder: 'Target retention gaps', so_what_investor: 'Retention risk unclear without cohort data', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    moat_analysis:           { headline: 'Competitive position', moat_type: 'brand', strength: 'stable', replication_cost: 'High', so_what_founder: 'Find the weak point', so_what_investor: 'Moat requires independent validation', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    demand_quality:          { headline: 'Demand signals', demand_type: 'habit', complaint_pattern: clusters[2]?.summary || 'See reviews', unmet_need: clusters[3]?.summary || 'Improvement areas', so_what_founder: 'Address top complaints', so_what_investor: 'Demand quality unclear from review data alone', evidence: clusters[0]?.cluster_name || 'reviews', evidence_refs: [] },
    failure_surface:         { headline: clusters[clusters.length - 1]?.summary || 'Competitive pressure', core_assumption: 'User loyalty remains stable', early_signals: clusters[2]?.summary || 'Monitor reviews', risk_level: 'medium', so_what_investor: 'Watch churn and pricing sensitivity', evidence: `${reviewCount} reviews`, evidence_refs: [] },
    strategic_opportunity:   { headline: 'Underserved segments', target_segment: clusters[1]?.summary || 'Power users', gap: clusters[2]?.summary || 'Feature gaps', playbook: [`Step 1: Research ${companyName}'s underserved segment`, 'Step 2: Build MVP', 'Step 3: Launch and measure retention'], why_incumbent_cant_respond: 'Too large to pivot fast', rough_cost: '$50K-200K', so_what_founder: 'Window still open' },
    investor_readiness:      { market_clarity: { score: 5, rationale: 'partial analysis' }, moat_strength: { score: 5, rationale: 'partial analysis' }, scalability: { score: 5, rationale: 'partial analysis' }, retention_confidence: { score: 5, rationale: 'partial analysis' }, founder_credibility: { score: 0, rationale: 'insufficient data' } },
    contradictions:          [],
    unknown_areas:           [{ area: 'Full synthesis', unknownType: 'market_data_missing', impact: 'high' }],
    missing_critical_signals: ['AI synthesis failed — showing partial cluster analysis'],
    decision_prompt: `If building in ${companyName}'s space: which underserved segment do you target first?`,
  }
}
