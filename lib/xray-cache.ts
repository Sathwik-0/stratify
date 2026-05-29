export type RefreshPolicy = 'standard' | 'premium' | 'force'

const DAY_MS = 24 * 60 * 60 * 1000

const CACHE_WINDOWS_DAYS: Record<Exclude<RefreshPolicy, 'force'>, number> = {
  standard: 7,
  premium: 1,
}

type XrayTimestampSource = {
  generated_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export function getXrayAnalyzedAt(result: XrayTimestampSource | null | undefined): string | null {
  return result?.generated_at ?? result?.created_at ?? result?.updated_at ?? null
}

export function getRefreshWindowMs(policy: RefreshPolicy = 'standard'): number {
  if (policy === 'force') return 0
  return (CACHE_WINDOWS_DAYS[policy] ?? CACHE_WINDOWS_DAYS.standard) * DAY_MS
}

export function getXrayFreshness(
  result: XrayTimestampSource | null | undefined,
  policy: RefreshPolicy = 'standard',
  now = Date.now()
) {
  const analyzedAt = getXrayAnalyzedAt(result)
  const analyzedAtMs = analyzedAt ? new Date(analyzedAt).getTime() : Number.NaN
  const ageMs = Number.isFinite(analyzedAtMs) ? Math.max(0, now - analyzedAtMs) : null
  const maxAgeMs = getRefreshWindowMs(policy)
  const isForceRefresh = policy === 'force'
  const isFresh = !isForceRefresh && ageMs !== null && ageMs < maxAgeMs

  return {
    analyzedAt,
    ageMs,
    maxAgeMs,
    isFresh,
    isStale: !isForceRefresh && ageMs !== null && !isFresh,
    policy,
  }
}

export function shouldReuseXrayCache(
  result: XrayTimestampSource | null | undefined,
  options: { forceRefresh?: boolean; policy?: RefreshPolicy } = {}
) {
  if (!result || options.forceRefresh) {
    return { reuse: false, freshness: getXrayFreshness(result, options.forceRefresh ? 'force' : options.policy) }
  }

  const policy = options.policy ?? 'standard'
  const freshness = getXrayFreshness(result, policy)
  return { reuse: freshness.isFresh, freshness }
}
