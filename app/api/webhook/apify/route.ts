// app/api/webhook/apify/route.ts
// Apify has been removed. This route is kept as a stub to avoid 404s
// from any cached Apify webhook URLs. Returns 410 Gone.
import { NextRequest } from 'next/server'

export async function POST(_req: NextRequest) {
  return Response.json(
    { message: 'Apify integration removed. This webhook endpoint is no longer active.' },
    { status: 410 }
  )
}
