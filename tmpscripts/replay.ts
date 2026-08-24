import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
const mid=(o:string,e:string)=>{const h=createHash('sha256').update(`${o}:${e}`).digest('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-')}
const id = mid('96170afe-a255-461b-9574-2dcb2ed43457','order-confirmed')
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
console.log(id, JSON.stringify(await sb.rpc('email_dlq_replay', { p_message_id: id })))
