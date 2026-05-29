// ─────────────────────────────────────────────────────────────────────────────
// lib/intelligence/delta.ts
// Deterministic delta computation and temporal signal tracking.
// Doc 9 #11 — TemporalSignal trajectory (not just snapshot diff)
// Doc 9 #12 — effectiveSignalWeight with decay
// ─────────────────────────────────────────────────────────────────────────────

import { resolveSignalId } from './signals'
import { scoreToLevel, computeAcceleration } from './types'
import type { TemporalSignal, TemporalDataPoint, ConfidenceLevel } from './types'

// ── Structured signal snapshot ────────────────────────────────────────────────
export interface StructuredSignalSnapshot {
  clusterName:     string
  signalId:        string
  percentage:      number
  headline:        string
  confidenceLevel: ConfidenceLevel
  timestamp:       string   // ISO8601 UTC of when this snapshot was taken
}

export interface SignalDelta {
  signalId:        string
  clusterName:     string
  direction:       'rising' | 'falling' | 'new' | 'resolved' | 'stable'
  oldPercentage?:  number
  newPercentage?:  number
  headlineChanged: boolean
  magnitudeLabel:  string
  acceleration?:   number   // Doc 9 #11 — rate of change
}

export interface DeltaAnalysis {
  hasPriorData:  boolean
  analysisDate:  string
  priorDate?:    string
  signals:       SignalDelta[]
  overallShift:  'significantly_changed' | 'moderately_changed' | 'largely_stable'
  headline:      string
  watchList:     string[]
}

// ── Extract structured signals from stored xray_result ───────────────────────
export function extractStructuredSignals(result: any, timestamp?: string): StructuredSignalSnapshot[] {
  if (!result) return []
  const ts = timestamp ?? result.generated_at ?? new Date().toISOString()
  const sections = ['money_engine', 'retention_architecture', 'moat_analysis', 'demand_quality', 'failure_surface']

  return sections
    .map(s => {
      const sec = result[s]
      if (!sec) return null
      const clusterName = sec.evidence ?? s
      return {
        clusterName,
        signalId:        resolveSignalId(clusterName),
        percentage:      sec.evidence_percent ?? 0,
        headline:        sec.headline ?? '',
        confidenceLevel: scoreToLevel(sec.confidence ? sec.confidence * 100 : 50),
        timestamp:       ts,
      }
    })
    .filter(Boolean) as StructuredSignalSnapshot[]
}

// ── Deterministic diff — no LLM (Doc 4 critical fix) ────────────────────────
export function computeDelta(
  oldSignals: StructuredSignalSnapshot[],
  newSignals: StructuredSignalSnapshot[],
  historicalPoints?: Record<string, TemporalDataPoint[]>  // Doc 9 #11
): SignalDelta[] {
  const deltas: SignalDelta[] = []
  const oldMap: Record<string, StructuredSignalSnapshot> = {}
  const newMap: Record<string, StructuredSignalSnapshot> = {}

  for (const s of oldSignals) oldMap[s.signalId] = s
  for (const s of newSignals) newMap[s.signalId] = s

  for (const id of Object.keys(newMap)) {
    const newSig = newMap[id]
    const old    = oldMap[id]

    if (!old) {
      deltas.push({ signalId: id, clusterName: newSig.clusterName, direction: 'new', newPercentage: newSig.percentage, headlineChanged: true, magnitudeLabel: 'new signal' })
      continue
    }

    const diff      = newSig.percentage - old.percentage
    const direction: SignalDelta['direction'] = Math.abs(diff) < 2 ? 'stable' : diff > 0 ? 'rising' : 'falling'
    const headlineChanged = old.headline.toLowerCase() !== newSig.headline.toLowerCase()
    const magnitudeLabel  = direction === 'stable' ? 'stable' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`

    // Acceleration from temporal history (Doc 9 #11)
    let acceleration: number | undefined
    if (historicalPoints?.[id] && historicalPoints[id].length >= 2) {
      const { acceleration: acc } = computeAcceleration(historicalPoints[id])
      acceleration = acc
    }

    deltas.push({ signalId: id, clusterName: newSig.clusterName, direction, oldPercentage: old.percentage, newPercentage: newSig.percentage, headlineChanged, magnitudeLabel, acceleration })
  }

  for (const id of Object.keys(oldMap)) {
    if (!newMap[id]) {
      const oldSig = oldMap[id]
      deltas.push({ signalId: id, clusterName: oldSig.clusterName, direction: 'resolved', oldPercentage: oldSig.percentage, headlineChanged: true, magnitudeLabel: 'resolved' })
    }
  }

  return deltas
}

// ── Build temporal signal from history (Doc 9 #11) ───────────────────────────
export function buildTemporalSignal(
  signalId: string,
  companyId: string,
  currentSnapshot: StructuredSignalSnapshot,
  historicalSnapshots: StructuredSignalSnapshot[]
): TemporalSignal {
  const allPoints: TemporalDataPoint[] = [
    ...historicalSnapshots.map(s => ({
      timestamp:  s.timestamp,
      score:      s.percentage,
      confidence: s.confidenceLevel === 'verified' ? 0.9 : s.confidenceLevel === 'moderate' ? 0.7 : 0.4,
      sourceHash: `hist_${s.timestamp.slice(0, 10)}`,
    })),
    {
      timestamp:  currentSnapshot.timestamp,
      score:      currentSnapshot.percentage,
      confidence: currentSnapshot.confidenceLevel === 'verified' ? 0.9 : 0.7,
      sourceHash: `curr_${currentSnapshot.timestamp.slice(0, 10)}`,
    },
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const { trend, acceleration } = computeAcceleration(allPoints)

  return {
    signalId,
    companyId,
    historicalValues: allPoints,
    trendDirection:   trend,
    acceleration,
    lastUpdatedAt:    currentSnapshot.timestamp,
  }
}
