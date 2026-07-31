import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ruuqbcdmjoqdvxdrxovm.supabase.co'
const supabaseAnonKey = 'sb_publishable_so-UyP-Tj4l2FTUyq_y3Wg_txakaU4K'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)