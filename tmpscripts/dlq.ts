import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const { data, error } = await sb.rpc('email_dlq_peek' as any, {})
console.log(error?.message ?? JSON.stringify(data))
