// lib/rate-limit.ts
// Production-grade Supabase-backed rate limiter.
// REPLACES the in-memory Map which resets on every Vercel cold start.
//
// Requires a `rate_limits` table in Supabase:
//   CREATE TABLE IF NOT EXISTS rate_limits (
//     ip          TEXT NOT NULL,
//     endpoint    TEXT NOT NULL DEFAULT 'default',
//     count       INT  NOT NULL DEFAULT 0,
//     window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
//     PRIMARY KEY (ip, endpoint)
//   );
//
// The in-memory store is kept as a fast-path cache for the same cold start,
// so hot requests in the same instance don't always hit Supabase.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from './supabase-admin'

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  '/api/xray/start':  { max: 3,  windowMs: 60 * 60 * 1000 }, // 3/hr
  '/api/compare':     { max: 5,  windowMs: 60 * 60 * 1000 }, // 5/hr
  '/api/xray/poll':   { max: 20, windowMs: 60 * 60 * 1000 }, // 20/hr (internal polling)
  '/api/xray/search': { max: 10, windowMs: 60 * 60 * 1000 }, // 10/hr
  'default':          { max: 10, windowMs: 60 * 60 * 1000 },
}

// In-process cache: fast path for same-instance repeated calls
const localCache = new Map<string, { count: number; windowStart: number }>()

export async function checkRateLimit(
  req: NextRequest,
  endpoint?: string,
): Promise<{ allowed: boolean; remaining: number; limit: number; bypassed?: boolean; bypassReason?: string }> {
  const ip  = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const key = endpoint ?? req.nextUrl?.pathname ?? 'default'
  const cfg = RATE_LIMITS[key] ?? RATE_LIMITS.default
  const now = Date.now()
  const bypassReason = getDevRateLimitBypassReason(req)

  if (bypassReason) {
    return { allowed: true, remaining: cfg.max, limit: cfg.max, bypassed: true, bypassReason }
  }

  // Fast-path: check local cache first
  const cacheKey   = `${ip}:${key}`
  const cacheEntry = localCache.get(cacheKey)
  if (cacheEntry && now - cacheEntry.windowStart < cfg.windowMs) {
    if (cacheEntry.count >= cfg.max) {
      return { allowed: false, remaining: 0, limit: cfg.max }
    }
    cacheEntry.count++
    return { allowed: true, remaining: cfg.max - cacheEntry.count, limit: cfg.max }
  }

  // Supabase path: durable across cold starts
  try {
    const windowStart = new Date(now - cfg.windowMs).toISOString()

    const { data, error } = await supabaseAdmin
      .from('rate_limits')
      .select('count, window_start')
      .eq('ip', ip)
      .eq('endpoint', key)
      .single()

    if (error && error.code !== 'PGRST116') {
      // DB error: fail open (don't block users if DB is down)
      console.error('[rate-limit] DB error:', error.message)
      return { allowed: true, remaining: cfg.max - 1, limit: cfg.max }
    }

    const isNewWindow = !data || new Date(data.window_start).getTime() < now - cfg.windowMs
    const currentCount = isNewWindow ? 0 : (data?.count ?? 0)

    if (currentCount >= cfg.max) {
      return { allowed: false, remaining: 0, limit: cfg.max }
    }

    const newCount    = currentCount + 1
    const newWindowTs = isNewWindow ? new Date(now).toISOString() : (data?.window_start ?? new Date(now).toISOString())

    // Upsert new count (fire-and-forget to avoid blocking response)
    supabaseAdmin.from('rate_limits').upsert(
      { ip, endpoint: key, count: newCount, window_start: newWindowTs },
      { onConflict: 'ip,endpoint' }
    ).then(({ error: upsertErr }) => {
      if (upsertErr) console.error('[rate-limit] Upsert failed:', upsertErr.message)
    })

    // Update local cache
    localCache.set(cacheKey, { count: newCount, windowStart: isNewWindow ? now : new Date(newWindowTs).getTime() })
    // Prune old local cache entries to prevent memory leak
    if (localCache.size > 500) {
      const oldestKey = localCache.keys().next().value
      if (oldestKey) localCache.delete(oldestKey)
    }

    return { allowed: true, remaining: cfg.max - newCount, limit: cfg.max }

  } catch (err) {
    // Network/unexpected error: fail open
    console.error('[rate-limit] Unexpected error:', err)
    return { allowed: true, remaining: cfg.max - 1, limit: cfg.max }
  }
}

export function getDevRateLimitBypassReason(req: NextRequest): string | null {
  const host = [
    req.headers.get('host'),
    req.headers.get('x-forwarded-host'),
    req.nextUrl?.host,
    req.nextUrl?.hostname,
  ].filter(Boolean).join(' ').toLowerCase()
  const forwardedFor = (req.headers.get('x-forwarded-for') ?? '').toLowerCase()

  if (process.env.NODE_ENV === 'development') return 'node_env_development'
  if (isLocalhost(host) || isLocalhost(forwardedFor)) return 'localhost'
  if (process.env.DEV_BYPASS_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production') {
    return 'dev_bypass_env'
  }

  return null
}

function isLocalhost(value: string) {
  return value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('::1') ||
    value.includes('[::1]')
}

export function rateLimitResponse(limit: number = 3) {
  return NextResponse.json(
    {
      error: `Too many requests. Max ${limit} per hour.`,
      errorCode: 'rate_limited',
      stage: 'request_gate',
      retryable: true,
      retryAfterSeconds: 3600,
    },
    {
      status:  429,
      headers: { 'Retry-After': '3600' },
    }
  )
}
