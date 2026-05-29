// ─────────────────────────────────────────────────────────────────────────────
// lib/evals/structural-eval.ts
// Structural evaluation: schema validity, required fields, evidence presence,
// confidence bounds, signal ID validity, contradiction formatting.
// Doc 5 (eval infrastructure), Doc 6 #5, Doc 8
// ─────────────────────────────────────────────────────────────────────────────

import { Pass3OutputSchema } from '../intelligence/schemas'
import { CANONICAL_SIGNAL_MAP } from '../intelligence/signals'

export interface StructuralEvalResult {
  passed:   boolean
  score:    number   // 0–100
  failures: string[]
  warnings: string[]
  metrics: {
    schemaValid:            boolean
    requiredFieldsPresent:  boolean
    evidencePresent:        boolean
    contradictionFormatted: boolean
    confidenceBounded:      boolean
    signalIdsValid:         boolean
    sectionCount:           number
    evidenceRefCount:       number
  }
}

const REQUIRED_SECTIONS = [
  'money_engine', 'retention_architecture', 'moat_analysis',
  'demand_quality', 'failure_surface', 'strategic_opportunity',
]

const VALID_SIGNAL_IDS = new Set(Object.values(CANONICAL_SIGNAL_MAP))

export function runStructuralEval(analysis: Record<string, unknown>): StructuralEvalResult {
  const failures: string[] = []
  const warnings: string[] = []

  // 1. Schema validation
  const schemaResult = Pass3OutputSchema.safeParse(analysis)
  const schemaValid  = schemaResult.success
  if (!schemaValid) {
    const errs = (schemaResult as { error: { errors: Array<{ path?: unknown[]; message: string }> } }).error?.errors?.slice(0, 5) ?? []
    errs.forEach(e => failures.push(`Schema: ${(e.path ?? []).join('.')} — ${e.message}`))
  }

  // 2. Required sections present
  let requiredFieldsPresent = true
  for (const section of REQUIRED_SECTIONS) {
    if (!analysis[section] || typeof analysis[section] !== 'object') {
      failures.push(`Missing required section: ${section}`)
      requiredFieldsPresent = false
    }
  }

  // 3. Evidence presence in each section
  let evidencePresent  = true
  let evidenceRefCount = 0
  for (const section of REQUIRED_SECTIONS) {
    const sec = analysis[section] as Record<string, unknown> | undefined
    if (!sec) continue
    const refs = sec.evidence_refs as unknown[] | undefined
    if (!sec.evidence && (!refs || refs.length === 0)) {
      failures.push(`${section} missing evidence or evidence_refs`)
      evidencePresent = false
    }
    evidenceRefCount += refs?.length ?? 0
  }

  // 4. Confidence bounded [0, 100]
  let confidenceBounded = true
  const confScore = analysis.confidence_score as number | undefined
  if (confScore !== undefined && (confScore < 0 || confScore > 100)) {
    failures.push(`confidence_score out of bounds: ${confScore}`)
    confidenceBounded = false
  }

  // 5. Signal IDs valid
  const signalIdsValid = true
  if (Array.isArray(analysis.signal_canonical_ids)) {
    for (const id of analysis.signal_canonical_ids as string[]) {
      if (!VALID_SIGNAL_IDS.has(id) && !id.startsWith('ev_') && id !== 'unknown_signal') {
        warnings.push(`Unrecognized signal ID: ${id}`)
      }
    }
  }

  // 6. Contradiction formatting
  let contradictionFormatted = true
  if (Array.isArray(analysis.contradictions)) {
    for (const c of analysis.contradictions as Record<string, unknown>[]) {
      if (!c.signalA || !c.signalB || !c.severity) {
        failures.push('Contradiction missing required fields (signalA, signalB, severity)')
        contradictionFormatted = false
        break
      }
    }
  }

  // 7. Core narrative / one-line insight present
  if (!analysis.one_line_insight || String(analysis.one_line_insight).length < 10) {
    warnings.push('one_line_insight missing or too short')
  }
  if (!analysis.core_narrative || String(analysis.core_narrative).length < 10) {
    warnings.push('core_narrative missing or too short')
  }

  const sectionCount = REQUIRED_SECTIONS.filter(s => analysis[s]).length
  const score        = Math.max(0, Math.min(100,
    100 - failures.length * 10 - warnings.length * 3
  ))

  return {
    passed: failures.length === 0,
    score,
    failures,
    warnings,
    metrics: {
      schemaValid,
      requiredFieldsPresent,
      evidencePresent,
      contradictionFormatted,
      confidenceBounded,
      signalIdsValid,
      sectionCount,
      evidenceRefCount,
    },
  }
}
