import { enqueueOrderEmail } from '../src/lib/order-emails.server'
const evs = process.argv.slice(2)
for (const e of evs) {
  try { console.log(e, JSON.stringify(await enqueueOrderEmail('96170afe-a255-461b-9574-2dcb2ed43457', e as any))) }
  catch (err: any) { console.log(e, 'ERR', String(err?.message ?? err)) }
}
