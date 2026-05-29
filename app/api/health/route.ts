export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { getEnvDiagnostics } from '@/lib/env'

export async function GET(_req: NextRequest) {
  const startedAt = Date.now()
  const env = getEnvDiagnostics()
  let database = {
    ok: false,
    latencyMs: null as number | null,
    error: null as string | null,
  }

  if (env.ok) {
    try {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')
      const dbStart = Date.now()
      const { error } = await supabaseAdmin
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .limit(1)

      database = {
        ok: !error,
        latencyMs: Date.now() - dbStart,
        error: error?.message ?? null,
      }
    } catch (error) {
      database = {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown database health error',
      }
    }
  }

  const ok = env.ok && database.ok

  return Response.json(
    {
      ok,
      service: 'stratify',
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: env.nodeEnv,
        vercelEnv: env.vercelEnv,
        devBypassRateLimit: env.devBypassRateLimit,
      },
      env: {
        ok: env.ok,
        missing: env.missing,
        configured: env.vars,
      },
      database,
      latencyMs: Date.now() - startedAt,
    },
    { status: ok ? 200 : 503 }
  )
}
