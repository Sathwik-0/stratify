// app/api/debug/route.ts — secured, no Apify, shows provider registry + Groq status
export const runtime = 'nodejs'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const secret  = process.env.DEBUG_SECRET
  const isLocal = (process.env.NEXT_PUBLIC_APP_URL ?? '').includes('localhost')

  if (secret) {
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
    if (token !== secret) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  } else if (!isLocal) {
    return Response.json({ error: 'Debug endpoint disabled in production. Set DEBUG_SECRET to enable.' }, { status: 403 })
  }

  const checks = {
    NEXT_PUBLIC_SUPABASE_URL:      !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY:     !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GROQ_API_KEY:                  !!process.env.GROQ_API_KEY,
    DEBUG_SECRET:                  !!process.env.DEBUG_SECRET,
    NEXT_PUBLIC_APP_URL:           process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
    isLocalhost:                   isLocal,
  }

  const allSet = ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','GROQ_API_KEY']
    .every(k => !!process.env[k])

  return Response.json({
    allSet,
    checks,
    scraper: {
      provider:    'google-play-scraper',
      version:     '10.1.2',
      apifyMode:   false,
      architecture: 'provider-registry',
      note:        'Free scraping — no API key or credits required',
    },
    groq: {
      model: 'llama-3.1-8b-instant',
      baseURL:  'https://api.groq.com/openai/v1',
      provider: 'groq via openai SDK',
    },
    providers: {
      active:  ['google_play'],
      planned: ['app_store', 'reddit', 'hacker_news', 'news_api', 'glassdoor'],
    },
    pipeline: {
      version:          'v4-intelligence',
      correlationIds:   true,
      structuredErrors: true,
      after_api:        true,
    },
  }, { status: allSet ? 200 : 500 })
}
