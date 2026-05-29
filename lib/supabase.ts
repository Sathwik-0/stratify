import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://missing-supabase-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'missing-anon-key'

// Public client - safe to use in browser AND server.
// Missing env is reported by /api/health; placeholders keep static builds deterministic.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
