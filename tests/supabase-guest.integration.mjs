// Requires local Supabase with the revised migration and Edge Function.
import assert from 'node:assert/strict'
import { createHmac, createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishable = process.env.SUPABASE_ANON_KEY
const secret = process.env.INGRESS_HMAC_KEY
if (!url || !service || !publishable || !secret || secret.length < 32
  || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
  throw new Error('Configure only local Supabase URL, keys and INGRESS_HMAC_KEY')
}
const admin = createClient(url, service, { auth: { persistSession: false } })
const anon = createClient(url, publishable, { auth: { persistSession: false } })
const created = await admin.auth.admin.createUser({
  email: `guest-${randomUUID()}@example.test`,
  password: `local-${randomUUID()}-Pass1!`, email_confirm: true,
})
if (created.error) throw created.error
const ownerId = created.data.user.id

try {
  const occurrence = await admin.from('occurrences').insert({
    reporter_id: ownerId, type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: new Date().toISOString(), description: 'Animal perdido no centro',
  }).select('id').single()
  if (occurrence.error) throw occurrence.error
  const endpoint = `${url}/functions/v1/report-guest-sighting`
  const payload = { occurrenceId: occurrence.data.id,
    observedAt: new Date().toISOString(), area: 'Centro',
    description: 'Avistado perto da praca', latitude: -15.6, longitude: -56.1 }
  const source = createHash('sha256').update(randomUUID()).digest('hex')
  function signed(body, nonce = randomUUID(), timestamp = String(Math.floor(Date.now() / 1000))) {
    const raw = JSON.stringify(body)
    const bodyHash = createHash('sha256').update(raw).digest('hex')
    const canonical = `POST\n/report-guest-sighting\n${timestamp}\n${nonce}\n${source}\n${bodyHash}`
    return { body: raw, headers: { 'content-type': 'application/json',
      'x-buscapet-timestamp': timestamp, 'x-buscapet-nonce': nonce,
      'x-buscapet-source': source,
      'x-buscapet-signature': createHmac('sha256', secret).update(canonical).digest('hex') } }
  }
  async function send(packet) {
    const response = await fetch(endpoint, { method: 'POST', headers: {
      apikey: publishable, ...packet.headers }, body: packet.body })
    return { status: response.status, body: await response.json() }
  }
  assert.equal((await send({ body: JSON.stringify(payload),
    headers: { 'cf-connecting-ip': '198.51.100.42', 'x-forwarded-for': '203.0.113.7' } })).status, 401)
  const bad = signed(payload)
  bad.headers['x-buscapet-signature'] = '0'.repeat(64)
  assert.equal((await send(bad)).status, 401)
  const tampered = signed(payload)
  tampered.body = JSON.stringify({ ...payload, description: 'Relato alterado' })
  assert.equal((await send(tampered)).status, 401)
  assert.equal((await send(signed(payload, randomUUID(), String(Math.floor(Date.now() / 1000) - 120)))).status, 401)
  assert.equal((await send(signed({ ...payload, description: 'x' }))).status, 400)
  assert.equal((await send(signed({ ...payload, occurrenceId: randomUUID() }))).status, 400)
  const first = signed(payload)
  assert.equal((await send(first)).status, 202)
  assert.equal((await send(first)).status, 409)
  for (let n = 0; n < 4; n++) assert.equal((await send(signed(payload))).status, 202)
  assert.equal((await send(signed(payload))).status, 429)
  const sightings = await anon.from('sightings').select('id')
  assert.ok(sightings.error)
  const privateRows = await admin.from('sightings').select('id,reporter_id').eq('occurrence_id', occurrence.data.id)
  assert.equal(privateRows.data?.length, 5)
  assert.ok(privateRows.data.every((row) => row.reporter_id === null))
  const locations = await anon.rpc('sighting_coordinates', { p_sighting: privateRows.data[0].id })
  assert.ok(locations.error)
  console.log('Local Edge authentication, replay, quota and privacy: passed')
} finally {
  await admin.auth.admin.deleteUser(ownerId)
}
