'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const KNOWN = [
  { slug: 'swiggy',   name: 'Swiggy',   category: 'Food Delivery' },
  { slug: 'zerodha',  name: 'Zerodha',  category: 'Fintech / Trading' },
  { slug: 'phonepe',  name: 'PhonePe',  category: 'Payments' },
  { slug: 'zomato',   name: 'Zomato',   category: 'Food Delivery' },
  { slug: 'cred',     name: 'CRED',     category: 'Fintech / Rewards' },
  { slug: 'razorpay', name: 'Razorpay', category: 'Payments Infrastructure' },
  { slug: 'meesho',   name: 'Meesho',   category: 'Social Commerce' },
  { slug: 'groww',    name: 'Groww',    category: 'Fintech / Investing' },
  { slug: 'ola',      name: 'Ola',      category: 'Mobility' },
  { slug: 'paytm',    name: 'Paytm',    category: 'Payments / Fintech' },
]

export default function ExplorePage() {
  const router = useRouter()
  const [cards,     setCards]     = useState<any[]>([])
  const [filter,    setFilter]    = useState('All')
  const [analyzing, setAnalyzing] = useState<string | null>(null)

  // search any company
  const [query,       setQuery]       = useState('')
  const [searching,   setSearching]   = useState(false)
  const [searchMsg,   setSearchMsg]   = useState('')
  const [searchOk,    setSearchOk]    = useState(false)

  // request form
  const [reqName,  setReqName]  = useState('')
  const [reqEmail, setReqEmail] = useState('')
  const [reqState, setReqState] = useState<'idle'|'sending'|'done'>('idle')

  useEffect(() => {
    fetch('/api/explore').then(r => r.json()).then(d => setCards(d.cards || []))
  }, [])

  const cats     = ['All', ...Array.from(new Set(KNOWN.map(c => c.category)))]
  const filtered = KNOWN.filter(c => filter === 'All' || c.category === filter)

  // ── analyze known slug ────────────────────────────────────────────
  async function analyzeSlug(slug: string) {
    setAnalyzing(slug)
    try {
      const res  = await fetch('/api/xray/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = await res.json()
      if (data.cached) { router.push(`/xray/${slug}`); return }
      if (data.jobId)  { router.push(`/loading-analysis?jobId=${data.jobId}&slug=${slug}`); return }
    } catch { /* noop */ }
    setAnalyzing(null)
  }

  // ── search any company ────────────────────────────────────────────
  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearchMsg('')
    setSearchOk(false)

    try {
      const sRes  = await fetch('/api/xray/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: query.trim() }),
      })
      const sData = await sRes.json()

      if (!sData.found) {
        setSearchMsg(`Could not find "${query}" on the Play Store. Request it below.`)
        setSearchOk(false)
        setReqName(query)
        setSearching(false)
        return
      }

      setSearchMsg(`Found ${sData.company.name} — starting analysis...`)
      setSearchOk(true)

      const aRes  = await fetch('/api/xray/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: sData.company.slug }),
      })
      const aData = await aRes.json()

      if (aData.cached) { router.push(`/xray/${sData.company.slug}`); return }
      if (aData.jobId)  { router.push(`/loading-analysis?jobId=${aData.jobId}&slug=${sData.company.slug}`); return }
    } catch {
      setSearchMsg('Search failed. Try again.')
      setSearchOk(false)
    }
    setSearching(false)
  }

  async function handleRequest() {
    if (!reqName.trim()) return
    setReqState('sending')
    await fetch('/api/explore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name: reqName.trim(), requester_email: reqEmail.trim() }),
    })
    setReqState('done')
  }

  function getHook(slug: string) {
    return cards.find((c: any) => c.companies?.slug === slug)?.hook_line || null
  }
  function isAnalyzed(slug: string) {
    return cards.some((c: any) => c.companies?.slug === slug)
  }

  return (
    <main style={{ background: 'var(--cream)', minHeight: '100vh' }}>
      <Nav />

      {/* ── HEADER + SEARCH ── */}
      <section style={{ borderBottom: '1px solid var(--border)', padding: '48px 32px 36px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>[ 01 ]</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>Explore</span>
          </div>
          <h1 style={{ fontFamily: 'Fraunces', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 900, letterSpacing: '-2px', marginBottom: 12 }}>
            Business Intelligence Feed
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted)', maxWidth: 480, lineHeight: 1.7, marginBottom: 28 }}>
            Click any company below — or search for any Indian consumer app and we'll analyze it instantly.
          </p>

          {/* Search box */}
          <div style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 2, overflow: 'hidden' }}>
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setSearchMsg('') }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Search any company (e.g. Dunzo, Nykaa, BYJU'S)…"
                style={{
                  flex: 1, padding: '12px 18px', fontFamily: 'DM Sans', fontSize: 14,
                  background: '#fff', border: 'none', outline: 'none', color: 'var(--charcoal)',
                }}
              />
              <button onClick={handleSearch} disabled={searching || !query.trim()} style={{
                background: query.trim() ? 'var(--red)' : 'rgba(8,3,3,0.08)',
                color: query.trim() ? '#fff' : 'var(--muted)',
                border: 'none', padding: '12px 22px', fontFamily: 'DM Sans',
                fontSize: 13, fontWeight: 700,
                cursor: query.trim() ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
              }}>
                {searching
                  ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Finding...</>
                  : 'Analyze →'}
              </button>
            </div>

            {searchMsg && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 2, fontSize: 13, lineHeight: 1.5,
                background: searchOk ? 'rgba(39,174,96,0.07)' : 'rgba(232,68,31,0.06)',
                border: `1px solid ${searchOk ? 'rgba(39,174,96,0.2)' : 'rgba(232,68,31,0.2)'}`,
                color: searchOk ? '#27AE60' : 'var(--red)',
              }}>
                {searchOk ? '✓ ' : ''}{searchMsg}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── FILTERS ── */}
      <section style={{ borderBottom: '1px solid var(--border)', padding: '14px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {cats.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: '5px 14px', fontSize: 12, fontWeight: filter === cat ? 700 : 400,
              fontFamily: 'DM Sans', cursor: 'pointer', borderRadius: 2,
              background: filter === cat ? 'var(--charcoal)' : 'transparent',
              color: filter === cat ? 'var(--cream)' : 'var(--muted)',
              border: '1px solid', borderColor: filter === cat ? 'var(--charcoal)' : 'var(--border)',
              transition: 'all 0.15s',
            }}>{cat}</button>
          ))}
        </div>
      </section>

      {/* ── GRID ── */}
      <section>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px' }}>
          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ padding: '64px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Fraunces', fontSize: 28, fontWeight: 700, marginBottom: 12, letterSpacing: '-0.5px' }}>
                No companies found
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
                Try a different category or search term, or request a company below.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: 2, fontFamily: 'DM Sans' }}
              >
                Reset filters
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 1, background: filtered.length > 0 ? 'var(--border)' : 'transparent', marginTop: 1 }}>
            {filtered.map((company, i) => {
              const hook      = getHook(company.slug)
              const analyzed  = isAnalyzed(company.slug)
              const isRunning = analyzing === company.slug
              return (
                <div key={company.slug} onClick={() => analyzeSlug(company.slug)}
                  role="button"
                  aria-label={`${analyzed ? 'View X-Ray for' : 'Analyze'} ${company.name}`}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && analyzeSlug(company.slug)}
                  style={{ background: 'var(--cream)', padding: '28px 24px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(8,3,3,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--cream)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)' }}>{String(i+1).padStart(2,'0')}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {analyzed && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#27AE60', background: 'rgba(39,174,96,0.1)', padding: '2px 8px', borderRadius: 2 }}>Analyzed</span>}
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--red)', background: 'rgba(232,68,31,0.08)', padding: '2px 8px', borderRadius: 2 }}>{company.category}</span>
                    </div>
                  </div>
                  <h3 style={{ fontFamily: 'Fraunces', fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 10 }}>{company.name}</h3>
                  {hook
                    ? <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, fontStyle: 'italic', fontFamily: 'Fraunces', fontWeight: 300, marginBottom: 20 }}>"{hook}"</p>
                    : <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>Click to run a full business X-Ray analysis.</p>
                  }
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: analyzed ? 'var(--charcoal)' : 'var(--red)', fontWeight: 600 }}>
                      {isRunning ? 'Starting...' : analyzed ? 'View X-Ray →' : 'Run X-Ray →'}
                    </span>
                    {isRunning && <div style={{ width: 14, height: 14, border: '2px solid var(--red)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── REQUEST ── */}
      <section style={{ borderTop: '1px solid var(--border)', marginTop: 48 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 32px' }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--red)', marginBottom: 12 }}>
              Can't find it?
            </div>
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 8 }}>
              Request a company manually
            </h3>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.6 }}>
              For companies not on the Play Store (SaaS, D2C, B2B). We review every request before running the analysis — leave your email to get notified.
            </p>

            {reqState === 'done' ? (
              <div style={{ background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.2)', padding: '16px 20px', borderRadius: 4 }}>
                <div style={{ fontSize: 14, color: '#27AE60', fontWeight: 600, marginBottom: 4 }}>✓ Request received</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
                  We'll review it and run the analysis soon.{reqEmail ? ` We'll email ${reqEmail} when ready.` : ''}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={reqName} onChange={e => setReqName(e.target.value)}
                  placeholder="Company name (e.g. Flipkart, boAt, Sugar Cosmetics)"
                  style={{ padding: '11px 16px', fontFamily: 'DM Sans', fontSize: 14, border: '1px solid var(--border)', background: 'transparent', borderRadius: 2, outline: 'none', color: 'var(--charcoal)' }}
                />
                <input value={reqEmail} onChange={e => setReqEmail(e.target.value)}
                  placeholder="Your email (optional)" type="email"
                  style={{ padding: '11px 16px', fontFamily: 'DM Sans', fontSize: 14, border: '1px solid var(--border)', background: 'transparent', borderRadius: 2, outline: 'none', color: 'var(--charcoal)' }}
                />
                <button onClick={handleRequest} disabled={!reqName.trim() || reqState === 'sending'} style={{
                  background: reqName.trim() ? 'var(--red)' : 'rgba(8,3,3,0.1)',
                  color: reqName.trim() ? '#fff' : 'var(--muted)',
                  border: 'none', padding: '11px 24px', fontFamily: 'DM Sans',
                  fontSize: 14, fontWeight: 600, cursor: reqName.trim() ? 'pointer' : 'not-allowed',
                  borderRadius: 2, alignSelf: 'flex-start',
                }}>
                  {reqState === 'sending' ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

    </main>
  )
}
