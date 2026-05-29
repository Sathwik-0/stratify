// lib/groq/delta-pass.ts
import { callGroq, TEMPERATURES, TOKEN_BUDGETS } from './client'
import { DeltaSynthesisSchema, safeParseWithFallback } from '@/lib/intelligence/schemas'
import { nowISO, OUTPUT_CONSTRAINTS } from '@/lib/intelligence'
import { logTelemetry } from '@/lib/quality-gate'
import { extractStructuredSignals, computeDelta } from '@/lib/intelligence/delta'
import type { DeltaAnalysis } from '@/lib/intelligence/delta'

export async function generateDeltaAnalysis(
  companyName:   string,
  currentResult: any,
  priorResult:   any | null,
  priorDate?:    string
): Promise<DeltaAnalysis> {
  if (!priorResult) {
    return {
      hasPriorData: false,
      analysisDate: nowISO(),
      signals:      [],
      overallShift: 'largely_stable',
      headline:     'First analysis — no prior data to compare against',
      watchList:    [],
    }
  }

  // Step 1 + 2: deterministic extraction and diff — no LLM
  const oldSignals       = extractStructuredSignals(priorResult, priorDate)
  const newSignals       = extractStructuredSignals(currentResult)
  const deltas           = computeDelta(oldSignals, newSignals)
  const significantDeltas = deltas.filter(d => d.direction !== 'stable')

  if (significantDeltas.length === 0) {
    return {
      hasPriorData: true,
      analysisDate: nowISO(),
      priorDate,
      signals:      deltas,
      overallShift: 'largely_stable',
      headline:     `${companyName} signals largely stable since last analysis`,
      watchList:    [],
    }
  }

  // Step 3: LLM receives ONLY the structured diff
  const diffBlock = significantDeltas.map(d =>
    `${d.clusterName}: ${d.direction} (${d.magnitudeLabel})${d.acceleration !== undefined ? `, accel: ${d.acceleration > 0 ? '+' : ''}${d.acceleration}` : ''}${d.headlineChanged ? ' — headline changed' : ''}`
  ).join('\n')

  let raw: unknown
  try {
    raw = await callGroq(
      `You are analyzing what changed in a business based on a structured signal diff. You receive ONLY the changes. Synthesize narrative from diff only. Return ONLY valid JSON.`,
      `Company: ${companyName}

Structural signal changes (deterministic diff — facts):
${diffBlock}

Prior analysis date: ${priorDate ?? 'unknown'}

{ "overall_shift": "moderately_changed", "headline": "One sharp sentence: what changed and why it matters", "watch_list": ["item1","item2","item3"] }`,
      TEMPERATURES.delta,
      TOKEN_BUDGETS.delta_analysis,
      'delta_analysis'
    )
  } catch (e: any) {
    logTelemetry({ eventType: 'pass_failed', passName: 'delta_analysis', latencyMs: 0, error: e.message, timestamp: nowISO() })
    const risingCount  = significantDeltas.filter(d => d.direction === 'rising').length
    const fallingCount = significantDeltas.filter(d => d.direction === 'falling').length
    return {
      hasPriorData: true, analysisDate: nowISO(), priorDate, signals: deltas,
      overallShift: significantDeltas.length > 3 ? 'significantly_changed' : 'moderately_changed',
      headline:     `${companyName}: ${risingCount} signals rising, ${fallingCount} falling since last analysis`,
      watchList:    significantDeltas.slice(0, 3).map(d => `${d.clusterName} (${d.magnitudeLabel})`),
    }
  }

  const { result, valid, errors } = safeParseWithFallback(DeltaSynthesisSchema, raw, 'delta_analysis', {
    overall_shift: 'moderately_changed' as const,
    headline:      `${companyName}: signals have shifted since last analysis`,
    watch_list:    [],
  })
  if (!valid) logTelemetry({ eventType: 'zod_validation_failed', passName: 'delta_analysis', latencyMs: 0, error: errors.slice(0, 2).join('; '), timestamp: nowISO() })

  return {
    hasPriorData: true,
    analysisDate: nowISO(),
    priorDate,
    signals:      deltas,
    overallShift: result.overall_shift,
    headline:     result.headline,
    watchList:    (result.watch_list ?? []).slice(0, OUTPUT_CONSTRAINTS.maxWatchListItems),
  }
}
