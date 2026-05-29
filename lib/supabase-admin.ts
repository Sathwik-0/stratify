import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://missing-supabase-url.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'missing-service-role-key'

// Admin client - SERVER ONLY. Never import this in client components.
// Missing env is reported by /api/health; placeholders keep static builds deterministic.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
