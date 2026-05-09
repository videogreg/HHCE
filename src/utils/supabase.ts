import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lmjhuohzgzadtmchtsvu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_w8I_KlobRO7ALN-BUn7REA_SyxUQBqe'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)