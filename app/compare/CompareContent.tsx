'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Nav from '@/components/Nav'

const SUGGESTIONS = ['Swiggy','Zerodha','PhonePe','Zomato','CRED','Razorpay','Meesho','Groww','Ola','Paytm','Flipkart','Nykaa','BYJU\'S','Dunzo','Urban Company','Lenskart','boAt','Blinkit','Rapido','Delhivery']

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

// Reusable search input with autocomplete dropdown
function SearchInput({
  label, value, onChange, onAnalyze, status, otherSlug
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onAnalyze: (name: string) => void
  status: 'idle' | 'searching' | 'found' | 'not_found' | 'error'
  otherSlug: string
}) {
  const [open, setOpen] = useState(false)
  const filtered = value.length > 0
    ? SUGGESTIONS.filter(s => s.toLowerCase().includes(value.toLowerCase()) && toSlug(s) !== otherSlug)
    : SUGGESTIONS.filter(s => toSlug(s) !== otherSlug)

  const borderColor = status === 'found' ? 'rgba(39,174,96,0.5)'
    : status === 'not_found' || status === 'error' ? 'rgba(232,68,31,0.4)'
    : 'var(--border)'

  return (
    <div>
      <label style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', border: `1px solid ${borderColor}`, borderRadius: 2, overflow: 'hidden', background: '#fff', transition: 'border-color 0.2s' }}>
          <input
            value={value}
            onChange={e => { onChange(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 160)}
            onKeyDown={e => { if (e.key === 'Enter' && value.trim()) { setOpen(false); onAnalyze(value.trim()) } }}
            placeholder="Type any company name…"
            style={{ flex: 1, padding: '12px 16px', fontFamily: 'DM Sans', fontSize: 14, border: 'none', outline: 'none', color: 'var(--charcoal)', background: 'transparent' }}
          />
          <button
            onMouseDown={() => { setOpen(false); onAnalyze(value.trim()) }}
            disabled={!value.trim() || status === 'searching'}
            style={{
              background: value.trim() ? 'var(--red)' : 'rgba(8,3,3,0.06)',
              color: value.trim() ? '#fff' : 'var(--muted)',
              border: 'none', padding: '0 18px',
              fontFamily: 'DM Sans', fontSize: 12, fontWeight: 700,
              cursor: value.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
            }}
          >
            {status === 'searching'
              ? <><div style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Finding</>
              : status === 'found' ? '✓ Ready'
              : 'Find →'}
          </button>
        </div>

        {/* Dropdown */}
        {open && filtered.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--cream)', border: '1px solid var(--border)', borderTop: 'none',
            borderRadius: '0 0 2px 2px', maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}>
            {filtered.slice(0, 8).map(s => (
              <div key={s}
                onMouseDown={() => { onChange(s); setOpen(false); onAnalyze(s) }}
                style={{ padding: '10px 16px', fontSize: 14, cursor: 'pointer', fontFamily: 'DM Sans', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(8,3,3,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>{s}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>analyze →</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status messages */}
      {status === 'found' && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#27AE60', fontFamily: 'DM Mono' }}>
          ✓ Ready for comparison
        </div>
      )}
      {status === 'not_found' && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)', lineHeight: 1.5 }}>
          Not found on Play Store. Try a different name or go to Explore to request it.
        </div>
      )}
      {status === 'error' && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--red)' }}>
          Search failed. Try again.
        </div>
      )}
    </div>
  )
}

export default function CompareContent() {
  const params = useSearchParams()
  const router = useRouter()

  const [nameA,    setNameA]    = useState(params.get('a') ? params.get('a')![0].toUpperCase() + params.get('a')!.slice(1) : '')
  const [nameB,    setNameB]    = useState('')
  const [slugA,    setSlugA]    = useState(params.get('a') || '')
  const [slugB,    setSlugB]    = useState('')
  const [statusA,  setStatusA]  = useState<'idle'|'searching'|'found'|'not_found'|'error'>('idle')
  const [statusB,  setStatusB]  = useState<'idle'|'searching'|'found'|'not_found'|'error'>('idle')

  const [result,   setResult]   = useState<any>(null)
  const [comparing, setComparing] = useState(false)
  const [error,    setError]    = useState('')

  // Resolve company name → slug via search API
  async function resolveCompany(name: string, side: 'A' | 'B') {
    if (!name.trim()) return
    const setStatus = side === 'A' ? setStatusA : setStatusB
    const setSlug   = side === 'A' ? setSlugA   : setSlugB

    setStatus('searching')
    setError('')
    setResult(null)

    try {
      const res  = await fetch('/api/xray/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: name.trim() }),
      })
      const data = await res.json()

      if (!data.found) {
        setStatus('not_found')
        setSlug('')
        return
      }

      setSlug(data.company.slug)
      setStatus('found')

      // Also ensure it's analyzed — kick off pipeline silently
      fetch('/api/xray/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: data.company.slug }),
      }).catch(() => {})

    } catch {
      setStatus('error')
      setSlug('')
    }
  }

  async function handleCompare() {
    if (!slugA || !slugB) return
    setComparing(true)
    setError('')
    setResult(null)

    try {
      const res  = await fetch('/api/compare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugA, slugB }),
      })
      const data = await res.json()

      if (data.needsAnalysis?.length) {
        const missing = data.needsAnalysis.join(' and ')
        setError(`${missing} still being analyzed. Wait 30–90 seconds and try again.`)
      } else if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
      }
    } catch {
      setError('Compare failed. Please try again.')
    }
    setComparing(false)
  }

  const canCompare = slugA && slugB && statusA === 'found' && statusB === 'found'
  const compA      = result?.companyA
  const compB      = result?.companyB
  const comparison = result?.comparison

  return (
    <div>
      <Nav />
      {/* Header */}
      <section style={{ borderBottom: '1px solid var(--border)', padding: '48px 32px 36px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[ 01 ]</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>Compare</span>
          </div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 900, letterSpacing: '-2px', marginBottom: 12 }}>
            Head-to-Head Analysis
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 520 }}>
            Type any two company names. We'll find them, analyze if needed, then compare moat strength, retention architecture, and failure surface side by side.
          </p>
        </div>
      </section>

      {/* Inputs */}
      <section style={{ borderBottom: '1px solid var(--border)', padding: '36px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="compare-input-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: 20, alignItems: 'flex-start', marginBottom: 24 }}>
            <SearchInput
              label="Company A"
              value={nameA}
              onChange={v => { setNameA(v); setStatusA('idle'); setSlugA('') }}
              onAnalyze={n => resolveCompany(n, 'A')}
              status={statusA}
              otherSlug={slugB}
            />
            <div style={{ paddingTop: 32, textAlign: 'center', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--muted)' }}>
              VS
            </div>
            <SearchInput
              label="Company B"
              value={nameB}
              onChange={v => { setNameB(v); setStatusB('idle'); setSlugB('') }}
              onAnalyze={n => resolveCompany(n, 'B')}
              status={statusB}
              otherSlug={slugA}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleCompare}
              disabled={!canCompare || comparing}
              style={{
                background: canCompare ? 'var(--red)' : 'rgba(8,3,3,0.1)',
                color: canCompare ? '#fff' : 'var(--muted)',
                border: 'none', padding: '12px 32px', fontFamily: 'DM Sans',
                fontSize: 14, fontWeight: 700,
                cursor: canCompare ? 'pointer' : 'not-allowed',
                borderRadius: 2, display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.15s',
              }}
            >
              {comparing
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Comparing...</>
                : 'Compare →'
              }
            </button>
            {!canCompare && (slugA || slugB) && (
              <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono' }}>
                {!slugA ? 'Find Company A first' : 'Find Company B first'}
              </span>
            )}
          </div>

          {error && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: 4, fontSize: 13, color: 'var(--red)', lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          <p style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono' }}>
            Try: Swiggy vs Zomato · Zerodha vs Groww · PhonePe vs Paytm
          </p>
        </div>
      </section>

      {/* Results */}
      {result && (
        <section>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>

            {/* Side by side */}
            <div className="compare-sides-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', marginTop: 1 }}>
              {[{ data: compA }, { data: compB }].map((side, i) => (
                <div key={i} style={{ background: 'var(--cream)', padding: '36px 32px' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--red)', background: 'rgba(232,68,31,0.08)', padding: '2px 8px', borderRadius: 2 }}>
                      {side.data?.company?.category}
                    </span>
                  </div>
                  <h2 style={{ fontFamily: 'Fraunces', fontSize: 32, fontWeight: 900, letterSpacing: '-1px', marginBottom: 10 }}>
                    {side.data?.company?.name}
                  </h2>
                  <p style={{ fontSize: 14, color: 'var(--muted)', fontStyle: 'italic', fontFamily: 'Fraunces', fontWeight: 300, lineHeight: 1.6, marginBottom: 24 }}>
                    "{side.data?.xray?.one_line_insight}"
                  </p>

                  {[
                    { label: 'Money Engine',    value: side.data?.xray?.money_engine?.headline },
                    { label: 'Moat',            value: side.data?.xray?.moat_analysis?.headline },
                    { label: 'Retention',       value: side.data?.xray?.retention_architecture?.headline },
                    { label: 'Failure Surface', value: side.data?.xray?.failure_surface?.headline },
                  ].map(row => (
                    <div key={row.label} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{row.label}</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--charcoal)' }}>{row.value || '—'}</div>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)' }}>Confidence:</span>
                      <span style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 900, color: 'var(--red)' }}>{side.data?.xray?.confidence_score}%</span>
                    </div>
                    <button onClick={() => router.push(`/xray/${side.data?.company?.slug}`)}
                      style={{ background: 'none', border: '1px solid var(--border)', padding: '6px 14px', fontSize: 12, fontFamily: 'DM Sans', cursor: 'pointer', borderRadius: 2, color: 'var(--charcoal)' }}>
                      Full X-Ray →
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Winner card */}
            {comparison && (
                <div style={{ background: 'var(--charcoal)', borderTop: '3px solid var(--red)', padding: '40px 32px', marginTop: 1 }}>
                <div className="compare-winner-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.4)', marginBottom: 8, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Verdict</div>
                    <div style={{ fontFamily: 'Fraunces', fontSize: 40, fontWeight: 900, letterSpacing: '-1.5px', color: 'var(--cream)', marginBottom: 8 }}>
                      {comparison.winner}
                    </div>
                    <p style={{ fontSize: 15, color: 'rgba(250,237,217,0.7)', lineHeight: 1.6, fontStyle: 'italic', fontFamily: 'Fraunces', fontWeight: 300, marginBottom: 24 }}>
                      {comparison.verdict}
                    </p>
                    <div style={{ padding: '18px 20px', background: 'rgba(250,237,217,0.05)', borderRadius: 4 }}>
                      <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Strategic Insight</div>
                      <p style={{ fontSize: 13, color: 'rgba(250,237,217,0.8)', lineHeight: 1.7 }}>{comparison.strategic_insight}</p>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.4)', marginBottom: 16, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Key Differences</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                      {comparison.key_differences?.map((d: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--red)', marginTop: 8, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'rgba(250,237,217,0.8)', lineHeight: 1.6 }}>{d}</span>
                        </div>
                      ))}
                    </div>
                    {comparison.moat_comparison && (
                      <div style={{ padding: '14px 18px', background: 'rgba(250,237,217,0.05)', borderRadius: 4 }}>
                        <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(250,237,217,0.4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Moat Comparison</div>
                        <p style={{ fontSize: 13, color: 'rgba(250,237,217,0.7)', lineHeight: 1.5 }}>{comparison.moat_comparison}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <style>{`
        @media (max-width: 768px) {
          .compare-input-grid  { grid-template-columns: 1fr !important; }
          .compare-sides-grid  { grid-template-columns: 1fr !important; }
          .compare-winner-grid { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
      `}</style>
    </div>
  )
}
