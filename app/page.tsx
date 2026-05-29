'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import HeroGraphic from '@/components/HeroGraphic'

const FEATURED = [
  { slug: 'swiggy',   name: 'Swiggy',   category: 'Food Delivery',    hook: 'Retention held by discounts, not loyalty' },
  { slug: 'zerodha',  name: 'Zerodha',  category: 'Fintech / Trading', hook: 'Zero commission was the entry. Education is the lock-in.' },
  { slug: 'phonepe',  name: 'PhonePe',  category: 'Payments',          hook: 'The transaction graph is worth more than the payments business' },
]

export default function Home() {
  const router = useRouter()

  // featured card state
  const [selectedCard, setSelectedCard] = useState('')
  const [cardLoading,  setCardLoading]  = useState(false)

  // search box state
  const [query,         setQuery]         = useState('')
  const [searching,     setSearching]     = useState(false)
  const [searchResult,  setSearchResult]  = useState<any>(null)
  const [searchError,   setSearchError]   = useState('')
  const [notFound,      setNotFound]      = useState(false)

  // ── analyze a known slug ────────────────────────────────────────────
  async function analyzeSlug(slug: string) {
    setCardLoading(true)
    setSelectedCard(slug)
    try {
      const res  = await fetch('/api/xray/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (data.cached) { router.push(`/xray/${slug}`); return }
      if (data.jobId)  { router.push(`/loading-analysis?jobId=${data.jobId}&slug=${slug}`); return }
    } catch { /* noop */ }
    setCardLoading(false)
    setSelectedCard('')
  }

  // ── search any company ───────────────────────────────────────────────
  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearchResult(null)
    setSearchError('')
    setNotFound(false)

    try {
      // Step 1: find / create company record
      const sRes  = await fetch('/api/xray/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: query.trim() }),
      })
      const sData = await sRes.json()

      if (!sRes.ok || sData.error) {
        setSearchError('Search failed. Try again.')
        setSearching(false)
        return
      }

      if (!sData.found) {
        setNotFound(true)
        setSearching(false)
        return
      }

      const company = sData.company
      setSearchResult(company)

      // Step 2: kick off analysis immediately
      const aRes  = await fetch('/api/xray/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: company.slug }),
      })
      const aData = await aRes.json()

      if (aData.cached) {
        router.push(`/xray/${company.slug}`)
      } else if (aData.jobId) {
        router.push(`/loading-analysis?jobId=${aData.jobId}&slug=${company.slug}`)
      }
    } catch {
      setSearchError('Something went wrong. Try again.')
    }
    setSearching(false)
  }

  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <Nav />

      {/* ── HERO ── */}
      <section style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>
          <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', padding: '64px 0 56px' }}>

            {/* Left copy */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', animation: 'pd 2s infinite' }} />
                <span style={{ fontSize: 11, fontFamily: 'DM Mono', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--red)' }}>
                  Business Intelligence
                </span>
              </div>
              <h1 style={{ fontFamily: 'Fraunces', fontSize: 'clamp(38px,5vw,62px)', fontWeight: 900, lineHeight: 1.02, letterSpacing: '-2px', marginBottom: 20 }}>
                See exactly why<br />
                <span style={{ fontStyle: 'italic', fontWeight: 300 }}>businesses win.</span>
              </h1>
              <p style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 420, marginBottom: 36 }}>
                Evidence-backed X-Rays built from real user data — not guesswork. Understand any company's money engine, retention architecture, moat, and failure surface.
              </p>

              {/* ── SEARCH BOX ── */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden', maxWidth: 440 }}>
                  <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setNotFound(false); setSearchError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder="Type any company name…"
                    style={{
                      flex: 1, padding: '13px 18px', fontFamily: 'DM Sans', fontSize: 14,
                      background: '#fff', border: 'none', outline: 'none', color: 'var(--charcoal)',
                    }}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !query.trim()}
                    style={{
                      background: query.trim() ? 'var(--red)' : 'rgba(8,3,3,0.08)',
                      color: query.trim() ? '#fff' : 'var(--muted)',
                      border: 'none', padding: '13px 22px',
                      fontFamily: 'DM Sans', fontSize: 13, fontWeight: 700,
                      cursor: query.trim() ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                      transition: 'background 0.15s',
                    }}
                  >
                    {searching
                      ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Finding...</>
                      : 'Run X-Ray →'
                    }
                  </button>
                </div>

                {/* feedback messages */}
                {notFound && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(232,68,31,0.06)', border: '1px solid rgba(232,68,31,0.2)', borderRadius: 2, fontSize: 13, color: 'var(--red)', lineHeight: 1.5 }}>
                    Could not find "{query}" on the Play Store.{' '}
                    <span
                      style={{ textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => router.push('/explore')}
                    >
                      Request it manually →
                    </span>
                  </div>
                )}
                {searchError && (
                  <div style={{ marginTop: 10, fontSize: 13, color: 'var(--red)' }}>{searchError}</div>
                )}
                {searchResult && !searching && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(39,174,96,0.07)', border: '1px solid rgba(39,174,96,0.2)', borderRadius: 2, fontSize: 13, color: '#27AE60' }}>
                    ✓ Found <strong>{searchResult.name}</strong> — starting analysis...
                  </div>
                )}

                <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono' }}>
                  Works for any Indian consumer app · Free · No signup
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => router.push('/explore')}
                  style={{ background: 'transparent', color: 'var(--charcoal)', border: '1px solid rgba(8,3,3,0.18)', padding: '9px 20px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 2 }}>
                  Explore companies
                </button>
                <button onClick={() => router.push('/compare')}
                  style={{ background: 'transparent', color: 'var(--charcoal)', border: '1px solid rgba(8,3,3,0.18)', padding: '9px 20px', fontFamily: 'DM Sans', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 2 }}>
                  Compare two companies
                </button>
              </div>
            </div>

            {/* Right graphic */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <HeroGraphic />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED COMPANIES ── */}
      <section>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>
          <div style={{ padding: '36px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[ 02 ]</span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>Featured</span>
            </div>
            <button onClick={() => router.push('/explore')}
              style={{ fontSize: 12, color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans' }}>
              View all →
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>
            <div className="cards-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: 'var(--border)', gap: 1 }}>
              {FEATURED.map((c, i) => (
                <div key={c.slug} onClick={() => analyzeSlug(c.slug)}
                  style={{ background: selectedCard === c.slug && cardLoading ? 'rgba(232,68,31,0.04)' : 'var(--cream)', padding: '30px 26px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(8,3,3,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedCard === c.slug && cardLoading ? 'rgba(232,68,31,0.04)' : 'var(--cream)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>{String(i+1).padStart(2,'0')}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--red)', background: 'rgba(232,68,31,0.08)', padding: '2px 8px', borderRadius: 2 }}>{c.category}</span>
                  </div>
                  <h3 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, letterSpacing: '-0.8px', marginBottom: 8 }}>{c.name}</h3>
                  <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, fontStyle: 'italic', fontFamily: 'Fraunces', fontWeight: 300, marginBottom: 22 }}>"{c.hook}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                      {selectedCard === c.slug && cardLoading ? 'Starting...' : 'Run X-Ray →'}
                    </span>
                    {selectedCard === c.slug && cardLoading && (
                      <div style={{ width: 14, height: 14, border: '2px solid var(--red)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ borderTop: '1px solid var(--border)', marginTop: 0 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '52px 32px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 40 }}>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[ 03 ]</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>How It Works</span>
          </div>
          <div className="cards-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'var(--border)' }}>
            {[
              { step: '01', title: 'Type any company', desc: 'Search for any Indian consumer app. We find it on the Play Store automatically — no manual setup needed.' },
              { step: '02', title: '3-pass AI pipeline', desc: 'Signals get classified, clustered into patterns, then analyzed using our 6-Force business framework.' },
              { step: '03', title: 'Actionable intelligence', desc: 'Every insight is evidence-backed with "So What" sections for founders, investors, and employees separately.' },
            ].map(item => (
              <div key={item.step} style={{ background: 'var(--cream)', padding: '30px 26px' }}>
                <div style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--red)', marginBottom: 14, letterSpacing: '1px' }}>[ {item.step} ]</div>
                <h4 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.5px' }}>{item.title}</h4>
                <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)' }}>
            {[
              { num: '500+', label: 'Reviews per analysis' },
              { num: '6',    label: 'Force framework' },
              { num: '3',    label: 'AI passes' },
              { num: 'Any',  label: 'Indian consumer app' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '26px 22px', borderRight: i < 3 ? '1px solid var(--border)' : 'none', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 900, letterSpacing: '-1px', marginBottom: 5 }}>{s.num}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '22px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Fraunces', fontWeight: 700, fontSize: 16 }}>Stratify</span>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'DM Mono' }}>Built on real data · Not AI guesswork</span>
        </div>
      </footer>

      <style>{`
        @media (max-width: 768px) {
          .hero-grid    { grid-template-columns: 1fr !important; padding: 40px 0 32px !important; }
          .cards-grid-3 { grid-template-columns: 1fr !important; }
          .stats-grid   { grid-template-columns: repeat(2,1fr) !important; }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}
