'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ── Pipeline stages ────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'scraping',    label: 'Signal Extraction',          sub: 'Collecting Play Store reviews...' },
  { key: 'classifying', label: 'Intelligence Classification', sub: 'Identifying retention, churn and growth signals...' },
  { key: 'analyzing',   label: 'Strategic Synthesis',         sub: 'Applying 6-Force investor framework...' },
  { key: 'completed',   label: 'Intelligence Ready',          sub: 'Your X-Ray report is complete.' },
]

const STATUS_TO_STEP: Record<string, number> = {
  pending: 0, scraping: 0, scraped: 0,
  classifying: 1, analyzing: 2, completed: 3,
}

// ── Error metadata — maps error codes to UX copy ──────────────────────────────
const ERROR_META: Record<string, {
  title:       string
  icon:        string
  stage:       string
  description: string
  action:      string
  retryable:   boolean
}> = {
  app_not_found: {
    title:       'App Not Found on Google Play',
    icon:        '⊘',
    stage:       'Signal Extraction',
    description: 'We could not locate this app on the Google Play Store. The app may have been removed, renamed, or may not be available in the Indian market.',
    action:      'Try searching with the exact app name as it appears on Google Play.',
    retryable:   true,
  },
  no_reviews_found: {
    title:       'Insufficient Public Intelligence',
    icon:        '◌',
    stage:       'Signal Extraction',
    description: 'The app was found, but has no publicly accessible reviews. This is common for very new apps, enterprise-only apps, or apps with review restrictions.',
    action:      'This app may not have enough public signal data for analysis yet.',
    retryable:   false,
  },
  scraper_timeout: {
    title:       'Pipeline Timeout',
    icon:        '◷',
    stage:       'Signal Extraction',
    description: 'Google Play took too long to respond. This is usually a temporary rate-limiting condition on Google\'s infrastructure.',
    action:      'Wait 2–3 minutes and try again. This typically resolves on its own.',
    retryable:   true,
  },
  rate_limited: {
    title:       'Data Provider Rate Limited',
    icon:        '⊡',
    stage:       'Signal Extraction',
    description: 'Too many requests were made to Google Play in a short window. Our scraping layer is being throttled.',
    action:      'Wait 3–5 minutes before retrying. This is temporary.',
    retryable:   true,
  },
  scraper_internal_error: {
    title:       'Google Play Data Unavailable',
    icon:        '⊟',
    stage:       'Signal Extraction',
    description: 'An internal error occurred while fetching Play Store data. The app may have an unusual ID format or restricted access.',
    action:      'Try searching for the app again with a different name variant.',
    retryable:   true,
  },
  classification_failed: {
    title:       'Signal Classification Failed',
    icon:        '⊛',
    stage:       'Intelligence Classification',
    description: 'Reviews were collected but the AI classification pass failed. This may be due to a temporary Groq API issue.',
    action:      'Retry in 1–2 minutes. The extracted reviews are still available.',
    retryable:   true,
  },
  analysis_generation_failed: {
    title:       'Strategic Synthesis Failed',
    icon:        '⊜',
    stage:       'Strategic Synthesis',
    description: 'The AI synthesis pass failed after classification. Partial intelligence (signal clusters) may still be available.',
    action:      'Retry to re-run synthesis. Extracted signals are preserved.',
    retryable:   true,
  },
  persistence_failed: {
    title:       'Database Persistence Failed',
    icon:        'DB',
    stage:       'Persistence',
    description: 'The intelligence pipeline generated output, but the final X-Ray could not be stored safely in the database.',
    action:      'Retry the analysis. If this repeats, check Supabase table columns, constraints, and service-role access.',
    retryable:   true,
  },
  validation_failed: {
    title:       'JSON Validation Failed',
    icon:        '{}',
    stage:       'Strategic Synthesis',
    description: 'The AI provider returned malformed or schema-incompatible JSON after retries, so the result was not trusted.',
    action:      'Retry once. If it repeats, inspect the correlation ID in telemetry and reduce prompt size.',
    retryable:   true,
  },
  groq_timeout: {
    title:       'AI Provider Timeout',
    icon:        'AI',
    stage:       'Strategic Synthesis',
    description: 'Groq did not return a complete response within the expected window.',
    action:      'Retry in 1-2 minutes. The review extraction stage may already have succeeded.',
    retryable:   true,
  },
  unknown: {
    title:       'Intelligence Pipeline Error',
    icon:        '⊗',
    stage:       'Unknown Stage',
    description: 'An unexpected error occurred in the analysis pipeline. This has been logged for investigation.',
    action:      'Retry the analysis. If the issue persists, try a different company.',
    retryable:   true,
  },
}

const DEFAULT_ERROR = ERROR_META['unknown']

// ── Failure panel ─────────────────────────────────────────────────────────────
function FailurePanel({
  errorCode, errorMsg, stage, retryable, correlationId, slug, elapsed, partial,
}: {
  errorCode:     string
  errorMsg:      string
  stage?:        string
  retryable?:    boolean
  correlationId?: string
  slug:          string
  elapsed:       number
  partial?:      any
}) {
  const router        = useRouter()
  const [diag, setDiag] = useState(false)
  const meta = ERROR_META[errorCode] ?? DEFAULT_ERROR

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ maxWidth: 600, margin: '72px auto', padding: '0 28px', animation: 'fadeIn 0.4s ease' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--muted)', opacity: 0.5,
          }} />
          <span style={{ fontSize: 10, fontFamily: 'DM Mono', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Pipeline Interrupted · {fmt(elapsed)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 8 }}>
          <div style={{
            width: 48, height: 48, flexShrink: 0,
            border: '1px solid rgba(8,3,3,0.12)',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: 'var(--muted)',
            background: 'rgba(8,3,3,0.02)',
          }}>
            {meta.icon}
          </div>
          <div>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6, lineHeight: 1.2 }}>
              {meta.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', background: 'rgba(8,3,3,0.05)', padding: '3px 8px', borderRadius: 2, letterSpacing: '0.5px' }}>
                FAILED AT: {meta.stage.toUpperCase()}
              </span>
              {(retryable ?? meta.retryable) && (
                <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--red)', background: 'rgba(232,68,31,0.06)', padding: '3px 8px', borderRadius: 2, letterSpacing: '0.5px' }}>
                  RETRYABLE
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div style={{
        padding: '20px 22px', marginBottom: 16,
        background: 'rgba(8,3,3,0.025)',
        border: '1px solid var(--border)', borderRadius: 4,
      }}>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--charcoal)', marginBottom: 12 }}>
          {meta.description}
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', paddingTop: 2, flexShrink: 0 }}>→</span>
          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{meta.action}</p>
        </div>
      </div>

      {/* Expandable diagnostics */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => setDiag(d => !d)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)',
            letterSpacing: '0.5px', padding: '4px 0',
          }}
        >
          <span style={{ transition: 'transform 0.2s', display: 'inline-block', transform: diag ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
          {diag ? 'HIDE' : 'SHOW'} DIAGNOSTICS
        </button>

        {diag && (
          <div style={{
            marginTop: 12, padding: '16px 18px',
            background: 'rgba(8,3,3,0.04)',
            border: '1px solid var(--border)', borderRadius: 4,
            animation: 'fadeIn 0.2s ease',
          }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                ['Error Code',      errorCode],
                ['Stage',           stage ?? meta.stage],
                ['Raw Message',     errorMsg || '—'],
                ['Correlation ID',  correlationId ?? '—'],
                ['Company Slug',    slug],
                ['Elapsed',         fmt(elapsed)],
                ['Timestamp',       new Date().toISOString()],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: 'DM Mono' }}>
                  <span style={{ color: 'var(--muted)', minWidth: 130, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: 'var(--charcoal)', wordBreak: 'break-all' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {partial && (
        <div style={{ marginBottom: 24, padding: '18px 20px', background: 'rgba(8,3,3,0.025)', border: '1px solid var(--border)', borderRadius: 4 }}>
          <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>
            Partial Intelligence Preserved
          </div>
          {partial.review_count !== undefined && (
            <div style={{ fontSize: 12, color: 'var(--charcoal)', marginBottom: 8 }}>
              Reviews extracted: <strong>{partial.review_count}</strong>
            </div>
          )}
          {partial.analysis_preview?.one_line_insight && (
            <p style={{ fontSize: 13, color: 'var(--charcoal)', lineHeight: 1.6, marginBottom: 10, fontFamily: 'Fraunces', fontStyle: 'italic' }}>
              "{partial.analysis_preview.one_line_insight}"
            </p>
          )}
          {partial.clusters?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {partial.clusters.slice(0, 5).map((cluster: any, i: number) => (
                <span key={i} style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--red)', background: 'rgba(232,68,31,0.07)', border: '1px solid rgba(232,68,31,0.18)', padding: '3px 8px', borderRadius: 2 }}>
                  {cluster.cluster_name ?? 'Signal cluster'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {(retryable ?? meta.retryable) && (
          <button
            onClick={() => router.push(`/?retry=${slug}`)}
            style={{
              background: 'var(--charcoal)', color: 'var(--cream)',
              border: 'none', padding: '12px 24px',
              fontFamily: 'DM Sans', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', borderRadius: 2,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            Retry Analysis →
          </button>
        )}
        <button
          onClick={() => router.push('/')}
          style={{
            background: 'transparent', color: 'var(--charcoal)',
            border: '1px solid var(--border)', padding: '12px 20px',
            fontFamily: 'DM Sans', fontSize: 14, cursor: 'pointer', borderRadius: 2,
          }}
        >
          New Search
        </button>
        <button
          onClick={() => window.open(`/api/debug`, '_blank')}
          style={{
            background: 'transparent', color: 'var(--muted)',
            border: '1px solid var(--border)', padding: '12px 20px',
            fontFamily: 'DM Mono', fontSize: 11, cursor: 'pointer', borderRadius: 2,
            letterSpacing: '0.5px',
          }}
        >
          DEBUG
        </button>
      </div>

      {/* Recovery guidance */}
      <div style={{ marginTop: 24, padding: '14px 18px', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: 'var(--muted)', paddingTop: 2, flexShrink: 0 }}>EST. RECOVERY</span>
        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          {errorCode === 'scraper_timeout' || errorCode === 'rate_limited'
            ? '2–5 minutes. Google Play rate limits reset quickly.'
            : errorCode === 'app_not_found' || errorCode === 'no_reviews_found'
            ? 'Immediate — try a different search term or exact app name.'
            : 'Immediate — this is likely a transient error.'}
        </p>
      </div>
    </div>
  )
}

// ── Main loading component ────────────────────────────────────────────────────
export default function LoadingContent() {
  const router = useRouter()
  const params = useSearchParams()
  const jobId  = params.get('jobId')
  const slug   = params.get('slug') ?? ''

  const [step,          setStep]          = useState(0)
  const [reviewCount,   setReviewCount]   = useState(0)
  const [elapsed,       setElapsed]       = useState(0)
  const [failed,        setFailed]        = useState(false)
  const [errorCode,     setErrorCode]     = useState('unknown')
  const [errorMsg,      setErrorMsg]      = useState('')
  const [errorStage,    setErrorStage]    = useState('')
  const [errorRetry,    setErrorRetry]    = useState(true)
  const [correlationId, setCorrelationId] = useState('')
  const [partial,       setPartial]       = useState<any>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const doneRef = useRef(false)

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Animated review counter during scraping step
  useEffect(() => {
    if (step !== 0) return
    const t = setInterval(() => {
      setReviewCount(n => n >= 500 ? 500 : n + Math.floor(Math.random() * 35 + 8))
    }, 220)
    return () => clearInterval(t)
  }, [step])

  const handleFailure = useCallback((data: any) => {
    if (doneRef.current) return
    doneRef.current = true
    if (pollRef.current) clearInterval(pollRef.current)
    setFailed(true)
    setErrorCode(data.errorCode ?? 'unknown')
    setErrorMsg(data.error ?? '')
    setErrorStage(data.stage ?? '')
    setErrorRetry(data.retryable ?? true)
    setCorrelationId(data.correlationId ?? '')
    setPartial(data.partial ?? null)
  }, [])

  const handleComplete = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setStep(3)
    if (pollRef.current) clearInterval(pollRef.current)
    setTimeout(() => router.push(`/xray/${slug}`), 1400)
  }, [router, slug])

  // Main polling loop
  useEffect(() => {
    if (!jobId) return

    async function pollJob() {
      if (doneRef.current) return
      try {
        const res = await fetch('/api/xray/poll', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ jobId }),
        })

        let data: any = {}
        try {
          const text = await res.text()
          if (text?.trim()) data = JSON.parse(text)
        } catch {
          console.warn('[poll] non-JSON response, retrying...')
          return
        }

        if (data.correlationId) setCorrelationId(data.correlationId)

        if (data.status === 'completed') { handleComplete(); return }
        if (data.status === 'failed')    { handleFailure(data); return }

        const s = STATUS_TO_STEP[data.status] ?? 0
        setStep(s)

      } catch {
        console.warn('[poll] network error, retrying...')
      }
    }

    pollJob()
    pollRef.current = setInterval(pollJob, 6000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobId, handleComplete, handleFailure])

  // Supabase Realtime backup
  useEffect(() => {
    if (!jobId) return
    const ch = supabase.channel(`job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, (payload: any) => {
        if (doneRef.current) return
        const s  = payload.new.status
        const rc = payload.new.review_count
        if (rc) setReviewCount(rc)
        setStep(STATUS_TO_STEP[s] ?? 0)
        if (s === 'completed') { handleComplete() }
        if (s === 'failed') {
          handleFailure({
            errorCode:     payload.new.metadata?.error_code ?? 'unknown',
            error:         payload.new.error_message ?? '',
            stage:         payload.new.metadata?.failed_stage ?? '',
            retryable:     payload.new.metadata?.retryable ?? true,
            correlationId: payload.new.metadata?.correlationId ?? '',
            partial:       payload.new.metadata?.partial ?? null,
          })
        }
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [jobId, handleComplete, handleFailure])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (failed) return (
    <FailurePanel
      errorCode={errorCode} errorMsg={errorMsg}
      stage={errorStage}    retryable={errorRetry}
      correlationId={correlationId} slug={slug} elapsed={elapsed}
      partial={partial}
    />
  )

  return (
    <div style={{ maxWidth: 620, margin: '72px auto', padding: '0 32px' }}>
      <div style={{ marginBottom: 44 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', animation: 'pd 1.5s infinite' }} />
          <span style={{ fontSize: 11, fontFamily: 'DM Mono', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--red)' }}>
            Analysis in Progress
          </span>
        </div>
        <h1 style={{ fontFamily: 'Fraunces', fontSize: 40, fontWeight: 900, letterSpacing: '-1.5px', marginBottom: 6 }}>
          Building your X-Ray
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15 }}>
          Analyzing <strong style={{ color: 'var(--charcoal)', textTransform: 'capitalize' }}>{slug}</strong> · {fmt(elapsed)} elapsed
          {correlationId && (
            <span style={{ marginLeft: 12, fontSize: 10, fontFamily: 'DM Mono', color: 'rgba(8,3,3,0.25)' }}>
              {correlationId.slice(0, 20)}
            </span>
          )}
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }}>
        {STEPS.map((s, i) => {
          const done    = i < step
          const active  = i === step
          const pending = i > step
          return (
            <div key={s.key} style={{
              padding: '22px 0', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 18, alignItems: 'flex-start',
              opacity: pending ? 0.3 : 1, transition: 'opacity 0.4s',
            }}>
              <div style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {done ? (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--charcoal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cream)', fontSize: 14 }}>✓</div>
                ) : active ? (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pd 1s infinite' }} />
                  </div>
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)' }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, color: done ? 'var(--muted)' : 'var(--charcoal)' }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                  {active && i === 0 ? `${reviewCount.toLocaleString()} reviews collected...` : s.sub}
                </div>
                {active && i === 0 && (
                  <div style={{ marginTop: 10, height: 2, background: 'rgba(8,3,3,0.08)', borderRadius: 1 }}>
                    <div style={{ height: '100%', width: `${Math.min((reviewCount / 500) * 100, 100)}%`, background: 'var(--red)', borderRadius: 1, transition: 'width 0.2s' }} />
                  </div>
                )}
              </div>
              {done && <span style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', paddingTop: 6 }}>done</span>}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 28, padding: '18px 22px', background: 'rgba(8,3,3,0.03)', borderRadius: 4, border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontFamily: 'DM Mono', color: 'var(--muted)', marginBottom: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>Data Sources</div>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Google Play Store', 'User Reviews', 'AI Analysis'].map((src, i) => (
            <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: step > i ? 'var(--red)' : 'rgba(8,3,3,0.15)', transition: 'background 0.3s' }} />
              <span style={{ fontSize: 12, color: step > i ? 'var(--charcoal)' : 'var(--muted)', fontWeight: step > i ? 500 : 400 }}>{src}</span>
            </div>
          ))}
        </div>
      </div>
      <p style={{ marginTop: 20, fontSize: 11, color: 'var(--muted)', fontFamily: 'DM Mono', textAlign: 'center', letterSpacing: '0.3px' }}>
        Polling every 6s · Correlation: {correlationId ? correlationId.slice(0, 24) : 'initializing...'}
      </p>
    </div>
  )
}
