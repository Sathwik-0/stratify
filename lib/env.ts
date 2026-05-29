export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
] as const

export type RequiredEnvVar = typeof REQUIRED_ENV_VARS[number]

export function getEnvDiagnostics() {
  const vars = REQUIRED_ENV_VARS.map((name) => ({
    name,
    configured: Boolean(process.env[name]),
  }))
  const missing = vars.filter((item) => !item.configured).map((item) => item.name)

  return {
    ok: missing.length === 0,
    missing,
    vars,
    nodeEnv: process.env.NODE_ENV ?? 'unknown',
    vercelEnv: process.env.VERCEL_ENV ?? null,
    devBypassRateLimit: process.env.DEV_BYPASS_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production',
  }
}
