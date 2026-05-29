'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

interface XRayData { company: any; result: any }

// ── Confidence level colours ──────────────────────────────────────────────────
const CONFIDENCE_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  verified:          { bg: 'rgba(39,174,96,0.10)',  border: 'rgba(39,174,96,0.30)',  text: '#27AE60', label: 'Verified'          },
  moderate:          { bg: 'rgba(243,156,18,0.10)', border: 'rgba(243,156,18,0.30)', text: '#F39C12', label: 'Moderate'          },
  weak_evidence:     { bg: 'rgba(231,76,60,0.10)',  border: 'rgba(231,76,60,0.30)',  text: '#E74C3C', label: 'Weak Evidence'     },
  insufficient_data: { bg: 'rgba(149,165,166,0.15)', border: 'rgba(149,165,166,0.3)', text: '#95A5A6', label: 'Insufficient Data' },
}

const RECO_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  strong_yes:      { bg: '#27AE60', text: '#fff', label: 'Strong Yes'      },
  conditional_yes: { bg: '#F39C12', text: '#fff', label: 'Conditional Yes' },
  watchlist:       { bg: '#4A90D9', text: '#fff', label: 'Watchlist'       },
  pass:            { bg: '#E74C3C', text: '#fff', label: 'Pass'            },
}

// ── Confidence badge with explanation tooltip (Doc 7 #8) ─────────────────────
function ConfidenceBadge({ level, explanation, score }: { level?: string; explanation?: any; score?: number }) {
  const [open, setOpen] = useState(false)
  const cfg = CONFIDENCE_COLORS[level ?? 'moderate'] ?? CONFIDENCE_COLORS.moderate
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          padding: '3px 10px', borderRadius: 2, cursor: 'pointer',
        }}
      >
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.text }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: cfg.text, fontFamily: 'DM Mono' }}>
          {cfg.label}{score !== undefined ? ` · ${score}%` : ''}
        </span>
      </button>
      {open && explanation && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 100,
          background: 'var(--charcoal)', color: 'var(--cream)', padding: '14px 16px',
          borderRadius: 4, width: 260, boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.5)', marginBottom: 10, letterSpacing: '1px' }}>CONFIDENCE EXPLANATION</div>
          {explanation.supportingSources !== undefined && <div style={{ fontSize: 12, marginBottom: 5 }}>Sources: <strong>{explanation.supportingSources}</strong></div>}
          {explanation.sourceDiversity  !== undefined && <div style={{ fontSize: 12, marginBottom: 5 }}>Source types: <strong>{explanation.sourceDiversity}</strong></div>}
          {explanation.contradictionLevel && <div style={{ fontSize: 12, marginBottom: 5 }}>Contradictions: <strong>{explanation.contradictionLevel}</strong></div>}
          {explanation.recency           && <div style={{ fontSize: 12, marginBottom: 5 }}>Recency: <strong>{explanation.recency}</strong></div>}
          {explanation.corroborationLevel && <div style={{ fontSize: 12 }}>Corroboration: <strong>{explanation.corroborationLevel.replace(/_/g, ' ')}</strong></div>}
        </div>
      )}
    </div>
  )
}

// ── Partial failure state (Doc 7 #28) ─────────────────────────────────────────
function InsufficientDataBlock({ sectionName }: { sectionName: string }) {
  return (
    <div style={{ background: 'rgba(149,165,166,0.08)', border: '1px dashed rgba(149,165,166,0.35)', borderRadius: 4, padding: '20px 24px', marginTop: 8 }}>
      <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: '#95A5A6', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
        Analysis unavailable
      </div>
      <p style={{ fontSize: 13, color: '#95A5A6', margin: 0 }}>
        Insufficient signals for {sectionName} — additional data sources needed for reliable analysis.
      </p>
    </div>
  )
}

// ── Section block with confidence badge and collapse (Doc 7 #22) ──────────────
function SectionBlock({ num, label, dotColor, confidenceLevel, confidenceExplanation, children }: any) {
  const [expanded, setExpanded] = useState(true)
  const isInsufficient = confidenceLevel === 'insufficient_data'
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '40px 0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: expanded ? 24 : 0, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', letterSpacing: '0.5px' }}>[{num}]</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', flex: 1 }}>
          {label}
        </span>
        {confidenceLevel && (
          <span onClick={e => e.stopPropagation()}>
            <ConfidenceBadge level={confidenceLevel} explanation={confidenceExplanation} />
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono' }}>{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && (isInsufficient ? <InsufficientDataBlock sectionName={label} /> : children)}
    </div>
  )
}

function SoWhat({ founder, investor, employee }: any) {
  const [active, setActive] = useState('investor')
  const tabs = [
    { key: 'investor', label: 'Investor',  content: investor  },
    { key: 'founder',  label: 'Founder',   content: founder   },
    { key: 'employee', label: 'Employee',  content: employee  },
  ].filter(t => t.content)
  if (!tabs.length) return null
  return (
    <div style={{ marginTop: 20, background: 'rgba(8,3,3,0.03)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)} style={{
            padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
            textTransform: 'uppercase', fontFamily: 'DM Sans', cursor: 'pointer', border: 'none',
            background: active === t.key ? 'var(--red)' : 'transparent',
            color: active === t.key ? '#fff' : 'var(--muted)',
          }}>
            {t.label}
          </button>
        ))}
        <div style={{ padding: '8px 12px', marginLeft: 'auto' }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono' }}>SO WHAT?</span>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--charcoal)', lineHeight: 1.7, margin: 0 }}>
          {tabs.find(t => t.key === active)?.content}
        </p>
      </div>
    </div>
  )
}

function EvidencePill({ section }: { section: any }) {
  const [expanded, setExpanded] = useState(false)
  const refs = section?.evidence_refs ?? []
  const text = section?.evidence
  if (!text && refs.length === 0) return null
  return (
    <div style={{ marginTop: 14 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(232,68,31,0.07)', border: '1px solid rgba(232,68,31,0.2)', padding: '4px 12px', borderRadius: 2, cursor: 'pointer' }}
      >
        <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)' }} />
        <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'DM Mono' }}>
          Evidence: {text} {refs.length > 0 && `(${refs.length} ref${refs.length > 1 ? 's' : ''})`}
        </span>
      </button>
      {expanded && refs.length > 0 && (
        <div style={{ marginTop: 8, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {refs.slice(0, 5).map((ref: any, i: number) => (
            <div key={i} style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ background: 'rgba(232,68,31,0.1)', padding: '2px 6px', borderRadius: 2, whiteSpace: 'nowrap' }}>
                {ref.sourceType?.replace(/_/g, ' ')}
              </span>
              <span>{ref.extractedClaim} ({Math.round((ref.confidence ?? 0.65) * 100)}% conf)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items?.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)', marginTop: 8, flexShrink: 0 }} />
          <span style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--charcoal)' }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

// ── Freshness display (Doc 5, Doc 7 final gap) ────────────────────────────────
function FreshnessIndicator({ generatedAt }: { generatedAt?: string }) {
  const [now] = useState(() => Date.now())

  if (!generatedAt) return null
  const ageMs    = now - new Date(generatedAt).getTime()
  const ageHours = ageMs / (1000 * 60 * 60)
  const stale    = ageHours > 168

  const label =
    ageHours < 1    ? 'Just analyzed' :
    ageHours < 24   ? `${Math.floor(ageHours)}h ago` :
    ageHours < 168  ? `${Math.floor(ageHours / 24)}d ago` :
    `${Math.floor(ageHours / 168)}w ago`

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', background: stale ? 'rgba(231,76,60,0.06)' : 'rgba(39,174,96,0.06)', border: `1px solid ${stale ? 'rgba(231,76,60,0.25)' : 'rgba(39,174,96,0.25)'}`, borderRadius: 2 }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: stale ? '#E74C3C' : '#27AE60' }} />
      <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: stale ? '#E74C3C' : '#27AE60' }}>
        {stale ? `Stale · ${label}` : label}
      </span>
    </div>
  )
}

// ── What Changed section (Doc 4 delta, Doc 7 retention) ──────────────────────
function WhatChangedSection({ delta }: { delta: any }) {
  if (!delta?.has_prior_data || !delta?.hasPriorData) return null
  const signals = delta.signals ?? []
  const notable = signals.filter((s: any) => s.direction !== 'stable')
  if (notable.length === 0 && delta.overallShift === 'largely_stable') return null

  const directionColor = (d: string) =>
    d === 'rising' ? '#E74C3C' : d === 'falling' ? '#27AE60' : d === 'new' ? '#4A90D9' : d === 'resolved' ? '#95A5A6' : 'var(--muted)'
  const directionIcon = (d: string) =>
    d === 'rising' ? '↑' : d === 'falling' ? '↓' : d === 'new' ? '+' : d === 'resolved' ? '✓' : '→'

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '40px 0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[Δ]</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4A90D9' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          What Changed
        </span>
      </div>
      <p style={{ fontSize: 16, fontFamily: 'Fraunces', fontStyle: 'italic', marginBottom: 20, color: 'var(--charcoal)' }}>
        {delta.headline}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {notable.map((s: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(8,3,3,0.02)', border: '1px solid var(--border)', borderRadius: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: directionColor(s.direction), width: 16, textAlign: 'center' }}>{directionIcon(s.direction)}</span>
            <span style={{ fontSize: 13, flex: 1 }}>{s.clusterName}</span>
            <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: directionColor(s.direction) }}>{s.magnitudeLabel}</span>
          </div>
        ))}
      </div>
      {delta.watchList?.length > 0 && (
        <div style={{ background: 'rgba(74,144,217,0.06)', border: '1px solid rgba(74,144,217,0.2)', padding: '14px 18px', borderRadius: 4 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: '#4A90D9', marginBottom: 8, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Watch List</div>
          <ItemList items={delta.watchList} />
        </div>
      )}
    </div>
  )
}

// ── Horizon risks panel (Doc 7 #6) ────────────────────────────────────────────
function HorizonRisksPanel({ horizonRisks }: { horizonRisks: any }) {
  const [tab, setTab] = useState<'short' | 'medium' | 'long'>('short')
  if (!horizonRisks) return null
  const tabs: Array<{ key: 'short' | 'medium' | 'long'; label: string; color: string }> = [
    { key: 'short',  label: 'Short-term',  color: '#E74C3C' },
    { key: 'medium', label: 'Medium-term', color: '#F39C12' },
    { key: 'long',   label: 'Long-term',   color: '#9B59B6' },
  ]
  const items = horizonRisks[tab] ?? []
  const activeColor = tabs.find(t => t.key === tab)?.color ?? 'var(--red)'
  return (
    <div style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
            textTransform: 'uppercase', fontFamily: 'DM Sans', cursor: 'pointer', border: 'none',
            borderBottom: tab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
            background: 'transparent', color: tab === t.key ? t.color : 'var(--muted)',
          }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '16px 20px' }}>
        {items.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No {tab}-term risks detected</p>
          : <ItemList items={items} />
        }
      </div>
    </div>
  )
}

// ── CEO Playbook section (Doc 4 + Doc 6) ─────────────────────────────────────
function CeoPlaybookSection({ playbook }: { playbook: any }) {
  if (!playbook) return null
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '40px 0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[CEO]</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F39C12' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          If I Were CEO
        </span>
      </div>
      <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 10 }}>
        {playbook.headline}
      </h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, fontStyle: 'italic' }}>{playbook.context}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(playbook.actions ?? []).map((action: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '16px 20px', background: 'rgba(8,3,3,0.025)', border: '1px solid var(--border)', borderRadius: 4, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {action.rank}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)' }}>{action.timeframe}</span>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '2px 8px', background: action.impact === 'high' ? 'rgba(232,68,31,0.1)' : 'rgba(243,156,18,0.1)', color: action.impact === 'high' ? 'var(--red)' : '#F39C12', borderRadius: 2 }}>
                  {action.impact} impact
                </span>
              </div>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, lineHeight: 1.5 }}>{action.action}</p>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{action.rationale}</p>
            </div>
          </div>
        ))}
      </div>
      {playbook.biggestRiskIgnored && (
        <div style={{ marginTop: 20, padding: '14px 18px', background: 'rgba(231,76,60,0.05)', border: '1px solid rgba(231,76,60,0.15)', borderRadius: 4 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--red)', marginBottom: 6, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Biggest Risk Ignored</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>{playbook.biggestRiskIgnored}</p>
        </div>
      )}
    </div>
  )
}

// ── Investment analysis section (Doc 6 + Doc 7 #20) ──────────────────────────
function InvestmentSection({ investment }: { investment: any }) {
  if (!investment) return null
  const reco = RECO_COLORS[investment.recommendation] ?? RECO_COLORS.watchlist

  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '40px 0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[INV]</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60' }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Would You Invest?
        </span>
      </div>

      {/* Conviction score + recommendation */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', background: 'rgba(39,174,96,0.07)', border: '1px solid rgba(39,174,96,0.2)', padding: '16px 24px', borderRadius: 4 }}>
          <div style={{ fontFamily: 'Fraunces', fontSize: 40, fontWeight: 900, color: '#27AE60' }}>{investment.convictionScore}</div>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Conviction</div>
        </div>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', background: reco.bg, borderRadius: 3, marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: reco.text }}>{reco.label}</span>
          </div>
          {!investment.sourceDiversityMinimumMet && (
            <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: '#95A5A6', marginTop: 4 }}>
              ⚠ Single data source — conviction score discounted
            </div>
          )}
          <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 420, color: 'var(--charcoal)', margin: '8px 0 0' }}>{investment.confidenceExplanation}</p>
        </div>
      </div>

      {/* Bull / Bear case (Doc 7 #20) */}
      <div className="bull-bear-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Bull */}
        <div style={{ borderLeft: '3px solid #27AE60', paddingLeft: 16, paddingTop: 4 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: '#27AE60', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Bull Case</div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>{investment.bullCase?.thesis}</p>
          {(investment.bullCase?.keyPoints ?? []).map((p: string, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
              <span style={{ color: '#27AE60', flexShrink: 0 }}>+</span>
              <span style={{ fontSize: 12, lineHeight: 1.5 }}>{p}</span>
            </div>
          ))}
          {investment.bullCase?.scenario && <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 10 }}>{investment.bullCase.scenario}</p>}
        </div>
        {/* Bear */}
        <div style={{ borderLeft: '3px solid #E74C3C', paddingLeft: 16, paddingTop: 4 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: '#E74C3C', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Bear Case</div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, lineHeight: 1.5 }}>{investment.bearCase?.thesis}</p>
          {(investment.bearCase?.keyPoints ?? []).map((p: string, i: number) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
              <span style={{ color: '#E74C3C', flexShrink: 0 }}>−</span>
              <span style={{ fontSize: 12, lineHeight: 1.5 }}>{p}</span>
            </div>
          ))}
          {investment.bearCase?.scenario && <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--muted)', marginTop: 10 }}>{investment.bearCase.scenario}</p>}
        </div>
      </div>

      {/* Investor readiness scores */}
      {investment.investorReadiness && (
        <div style={{ background: 'rgba(8,3,3,0.025)', border: '1px solid var(--border)', borderRadius: 4, padding: '16px 20px' }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Investor Readiness</div>
          <div className="readiness-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Object.entries({
              'Market Clarity':       investment.investorReadiness.marketClarity,
              'Moat Strength':        investment.investorReadiness.moatStrength,
              'Scalability':          investment.investorReadiness.scalability,
              'Retention Confidence': investment.investorReadiness.retentionConfidence,
              'Founder Credibility':  investment.investorReadiness.founderCredibility,
            }).map(([label, dim]: [string, any]) => dim && (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
                  <span style={{ fontSize: 11, fontFamily: 'DM Mono', fontWeight: 700 }}>{dim.score}/10</span>
                </div>
                <div style={{ height: 3, background: 'rgba(8,3,3,0.1)', borderRadius: 2 }}>
                  <div style={{ width: `${(dim.score / 10) * 100}%`, height: '100%', background: dim.score >= 7 ? '#27AE60' : dim.score >= 5 ? '#F39C12' : '#E74C3C', borderRadius: 2 }} />
                </div>
                {dim.rationale && <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{dim.rationale}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 32px' }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ marginBottom: 48 }}>
          <div className="shimmer" style={{ height: 16, width: 120, borderRadius: 2, marginBottom: 20 }} />
          <div className="shimmer" style={{ height: 32, width: '70%', borderRadius: 2, marginBottom: 12 }} />
          <div className="shimmer" style={{ height: 16, width: '90%', borderRadius: 2, marginBottom: 8 }} />
          <div className="shimmer" style={{ height: 16, width: '75%', borderRadius: 2 }} />
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function XRayPage() {
  const params = useParams()
  const router = useRouter()
  const slug   = params.slug as string
  const [data, setData]     = useState<XRayData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/xray/result?slug=${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.result) { setData(d) } else { router.push(`/?analyze=${slug}`) }
        setLoading(false)
      })
  }, [slug, router])

  if (loading)       return <main style={{ background: 'var(--cream)', minHeight: '100vh' }}><Nav /><Skeleton /></main>
  if (!data?.result) return null

  const { company, result: r } = data

  // Confidence level handling
  const globalLevel   = r.confidence_level ?? 'moderate'
  const globalExpl    = r.confidence_explanation

  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <Nav />

      {/* ── Hero ── */}
      <section style={{ borderBottom: '1px solid var(--border)', padding: '48px 0 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px' }}>
          <button onClick={() => router.push('/explore')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Explore
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--red)', background: 'rgba(232,68,31,0.08)', padding: '3px 10px', borderRadius: 2 }}>
                  {company.category}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>
                  {r.data_sources?.join(' · ')}
                </span>
                <FreshnessIndicator generatedAt={r.generated_at} />
              </div>
              <h1 style={{ fontFamily: 'Fraunces', fontSize: 'clamp(36px, 5vw, 52px)', fontWeight: 900, letterSpacing: '-2px', marginBottom: 12 }}>
                {company.name}
              </h1>

              {/* Core narrative (Doc 7 #13 — screenshottable thesis) */}
              {r.core_narrative && (
                <p style={{ fontFamily: 'Fraunces', fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', color: 'var(--charcoal)', lineHeight: 1.5, maxWidth: 560, marginBottom: 10 }}>
                  {r.core_narrative}
                </p>
              )}
              <p style={{ fontFamily: 'Fraunces', fontSize: 16, fontWeight: 300, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.5, maxWidth: 560 }}>
                "{r.one_line_insight}"
              </p>

              {/* Positioning label (Doc 6) */}
              <div style={{ marginTop: 12, fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', letterSpacing: '0.5px' }}>
                AI-native due diligence · Early-stage investor intelligence
              </div>
            </div>

            {/* Meta block */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 160 }}>
              <div style={{ background: 'rgba(232,68,31,0.07)', border: '1px solid rgba(232,68,31,0.2)', padding: '16px 20px', borderRadius: 4, textAlign: 'center' }}>
                <div style={{ fontFamily: 'Fraunces', fontSize: 36, fontWeight: 900, color: 'var(--red)' }}>{r.confidence_score}%</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>Confidence</div>
                <ConfidenceBadge level={globalLevel} explanation={globalExpl} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono', textAlign: 'center' }}>
                {r.review_count} reviews · {r.source_count} source{r.source_count > 1 ? 's' : ''}
              </div>
              {r.prompt_version && (
                <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', textAlign: 'center', opacity: 0.6 }}>
                  {r.prompt_version}
                </div>
              )}
              <button
                onClick={() => router.push(`/compare?a=${slug}`)}
                style={{ background: 'var(--charcoal)', color: 'var(--cream)', border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 2, fontFamily: 'DM Sans' }}
              >
                Compare →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Intelligence sections ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px' }}>

        {/* ── EXECUTIVE DECISION SNAPSHOT (Doc 8 #11, Doc 6 #7) ── */}
        {/* "Investors scan, they don't read. One screen. Instant understanding." */}
        {r.investment_analysis && (
          <div style={{
            margin:       '32px 0 0',
            padding:      '24px 28px',
            background:   'var(--charcoal)',
            borderRadius: 4,
            color:        'var(--cream)',
          }}>
            <div style={{ fontSize: 10, fontFamily: 'DM Mono', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(250,237,217,0.5)', marginBottom: 16 }}>
              Executive Snapshot · 30-second read
            </div>

            {/* Investment signal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                padding:     '6px 16px',
                background:  (() => {
                  const reco = String(r.investment_analysis?.recommendation ?? '').toLowerCase()
                  return reco.includes('strong_yes') ? '#27AE60'
                    : reco.includes('conditional') ? '#F39C12'
                    : reco.includes('pass')        ? '#E74C3C'
                    : '#4A90D9'
                })(),
                borderRadius: 2,
                fontSize:    13,
                fontWeight:  700,
                letterSpacing: '0.5px',
              }}>
                {RECO_COLORS[r.investment_analysis?.recommendation]?.label ?? r.investment_analysis?.recommendation ?? 'Under Review'}
              </div>
              <div style={{ fontSize: 22, fontFamily: 'Fraunces', fontWeight: 900 }}>
                {r.confidence_score}% <span style={{ fontSize: 13, fontWeight: 300, opacity: 0.7 }}>confidence</span>
              </div>
            </div>

            {/* Core thesis */}
            <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 20, opacity: 0.9, maxWidth: 620 }}>
              {r.one_line_insight}
            </p>

            {/* Top 3 risks + strengths */}
            <div className="snapshot-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Risks */}
              <div>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: '#E74C3C', marginBottom: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>Top Risks</div>
                {[
                  r.failure_surface?.headline,
                  r.investment_analysis?.bearCase?.keyPoints?.[0],
                  r.investment_analysis?.bearCase?.keyPoints?.[1],
                ].filter(Boolean).slice(0, 3).map((risk: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, alignItems: 'flex-start' }}>
                    <span style={{ color: '#E74C3C', flexShrink: 0, marginTop: 2 }}>▲</span>
                    <span style={{ opacity: 0.85, lineHeight: 1.5 }}>{risk}</span>
                  </div>
                ))}
              </div>
              {/* Strengths */}
              <div>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: '#27AE60', marginBottom: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>Top Strengths</div>
                {[
                  r.money_engine?.headline,
                  r.investment_analysis?.bullCase?.keyPoints?.[0],
                  r.investment_analysis?.bullCase?.keyPoints?.[1],
                ].filter(Boolean).slice(0, 3).map((str: string, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13, alignItems: 'flex-start' }}>
                    <span style={{ color: '#27AE60', flexShrink: 0, marginTop: 2 }}>●</span>
                    <span style={{ opacity: 0.85, lineHeight: 1.5 }}>{str}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Critical unknown */}
            {r.structured_unknowns?.[0] && (
              <div style={{ borderTop: '1px solid rgba(250,237,217,0.15)', paddingTop: 16 }}>
                <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.5)', letterSpacing: '1px', textTransform: 'uppercase' }}>Critical Unknown · </span>
                <span style={{ fontSize: 13, opacity: 0.8 }}>{r.structured_unknowns[0].unknown}</span>
              </div>
            )}
          </div>
        )}

        {/* What Changed (Doc 4 delta) */}
        <WhatChangedSection delta={r.delta_analysis} />

        {/* 01 Money Engine */}
        <SectionBlock num="01" label="Money Engine" dotColor="var(--red)" confidenceLevel={r.money_engine?.confidence_level ?? globalLevel} confidenceExplanation={globalExpl}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 14 }}>{r.money_engine?.headline}</h2>
          <p style={{ fontSize: 15, color: 'var(--charcoal)', lineHeight: 1.8, maxWidth: 660, marginBottom: 16 }}>{r.money_engine?.detail}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Defensibility:</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} style={{ width: 16, height: 4, borderRadius: 1, background: i < (r.money_engine?.defensibility || 5) ? 'var(--red)' : 'rgba(8,3,3,0.1)' }} />
              ))}
            </div>
            <span style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--red)' }}>{r.money_engine?.defensibility}/10</span>
          </div>
          <EvidencePill section={r.money_engine} />
          <SoWhat founder={r.money_engine?.so_what_founder} investor={r.money_engine?.so_what_investor} />
        </SectionBlock>

        {/* 02 Retention Architecture */}
        <SectionBlock num="02" label="Retention Architecture" dotColor="#4A90D9" confidenceLevel={r.retention_architecture?.confidence_level ?? globalLevel} confidenceExplanation={globalExpl}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 14 }}>{r.retention_architecture?.headline}</h2>
          <div className="detail-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {[
              { label: 'Switching Cost',      value: r.retention_architecture?.switching_cost      },
              { label: 'Lock-in Mechanism',   value: r.retention_architecture?.lock_in_mechanism   },
              { label: 'Vulnerable Segment',  value: r.retention_architecture?.vulnerable_segment  },
            ].filter(i => i.value).map(item => (
              <div key={item.label} style={{ background: 'rgba(8,3,3,0.03)', padding: '16px', borderRadius: 4, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 6, letterSpacing: '0.8px', textTransform: 'uppercase' }}>{item.label}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>{item.value}</div>
              </div>
            ))}
          </div>
          <EvidencePill section={r.retention_architecture} />
          <SoWhat founder={r.retention_architecture?.so_what_founder} investor={r.retention_architecture?.so_what_investor} />
          <HorizonRisksPanel horizonRisks={r.horizon_risks} />
        </SectionBlock>

        {/* 03 Moat Analysis */}
        <SectionBlock num="03" label="Moat Analysis" dotColor="#27AE60" confidenceLevel={r.moat_analysis?.confidence_level ?? globalLevel} confidenceExplanation={globalExpl}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 14 }}>{r.moat_analysis?.headline}</h2>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            {[r.moat_analysis?.moat_type, r.moat_analysis?.strength].filter(Boolean).map((tag: string, i: number) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', padding: '4px 12px', background: 'rgba(39,174,96,0.08)', color: '#27AE60', border: '1px solid rgba(39,174,96,0.2)', borderRadius: 2 }}>{tag}</span>
            ))}
          </div>
          <p style={{ fontSize: 15, color: 'var(--charcoal)', lineHeight: 1.8, maxWidth: 660 }}>{r.moat_analysis?.replication_cost}</p>
          <EvidencePill section={r.moat_analysis} />
          <SoWhat founder={r.moat_analysis?.so_what_founder} investor={r.moat_analysis?.so_what_investor} />
        </SectionBlock>

        {/* 04 Demand Quality */}
        <SectionBlock num="04" label="Demand Quality" dotColor="#9B59B6" confidenceLevel={r.demand_quality?.confidence_level ?? globalLevel} confidenceExplanation={globalExpl}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 14 }}>{r.demand_quality?.headline}</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '4px 12px', background: 'rgba(155,89,182,0.08)', color: '#9B59B6', border: '1px solid rgba(155,89,182,0.2)', borderRadius: 2 }}>
              {r.demand_quality?.demand_type?.replace(/-/g, ' ')}
            </span>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 12, color: 'var(--charcoal)' }}>{r.demand_quality?.complaint_pattern}</p>
          <div style={{ borderLeft: '3px solid #9B59B6', paddingLeft: 16, marginTop: 16 }}>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Unmet Need</div>
            <p style={{ fontSize: 14, fontStyle: 'italic', fontFamily: 'Fraunces', color: 'var(--charcoal)', lineHeight: 1.6 }}>{r.demand_quality?.unmet_need}</p>
          </div>
          <EvidencePill section={r.demand_quality} />
          <SoWhat founder={r.demand_quality?.so_what_founder} investor={r.demand_quality?.so_what_investor} />
        </SectionBlock>

        {/* 05 Failure Surface */}
        <SectionBlock num="05" label="Failure Surface" dotColor="#E74C3C" confidenceLevel={r.failure_surface?.confidence_level ?? globalLevel} confidenceExplanation={globalExpl}>
          <div style={{ borderLeft: '3px solid var(--red)', paddingLeft: 20, marginBottom: 24 }}>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 10 }}>{r.failure_surface?.headline}</h2>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--red)', padding: '3px 10px', background: 'rgba(231,76,60,0.08)', borderRadius: 2 }}>
              {r.failure_surface?.risk_level} risk
            </span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Core Assumption</div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--charcoal)' }}>{r.failure_surface?.core_assumption}</p>
          </div>
          <div style={{ background: 'rgba(231,76,60,0.04)', border: '1px solid rgba(231,76,60,0.15)', padding: '16px 20px', borderRadius: 4 }}>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--red)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Early Warning Signals</div>
            <p style={{ fontSize: 14, lineHeight: 1.7 }}>{r.failure_surface?.early_signals}</p>
          </div>
          <EvidencePill section={r.failure_surface} />
          <SoWhat investor={r.failure_surface?.so_what_investor} />
        </SectionBlock>

        {/* 06 Strategic Opportunity */}
        <SectionBlock num="06" label="Strategic Opportunity" dotColor="#F39C12" confidenceLevel={globalLevel} confidenceExplanation={globalExpl}>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginBottom: 14 }}>{r.strategic_opportunity?.headline}</h2>
          <div className="detail-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Target Segment', value: r.strategic_opportunity?.target_segment },
              { label: 'Build Cost',     value: r.strategic_opportunity?.rough_cost },
            ].filter(i => i.value).map(item => (
              <div key={item.label} style={{ background: 'rgba(8,3,3,0.03)', padding: '16px', borderRadius: 4, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{item.label}</div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>{item.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.8px' }}>90-Day Playbook</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {r.strategic_opportunity?.playbook?.map((step: string, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--red)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 14, lineHeight: 1.6, paddingTop: 3 }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
          <SoWhat founder={r.strategic_opportunity?.so_what_founder} />
        </SectionBlock>

        {/* CEO Playbook (Doc 4 + Doc 6) */}
        <CeoPlaybookSection playbook={r.ceo_playbook} />

        {/* Investment Analysis (Doc 6 + Doc 7 #20) */}
        <InvestmentSection investment={r.investment_analysis} />

        {/* Decision Prompt */}
        {r.decision_prompt && (
          <div style={{ padding: '40px 0 48px' }}>
            <div style={{ background: 'var(--charcoal)', color: 'var(--cream)', padding: '32px 36px', borderRadius: 4 }}>
              <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.5)', marginBottom: 14, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Investor Decision Prompt
              </div>
              <p style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 300, fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                {r.decision_prompt}
              </p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 768px) {
          .bull-bear-grid  { grid-template-columns: 1fr !important; }
          .readiness-grid  { grid-template-columns: 1fr !important; }
          .detail-grid-2   { grid-template-columns: 1fr !important; }
          .snapshot-grid   { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}
