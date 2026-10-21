// Local Worker handler -> real local Supabase Edge -> PostgreSQL.
// Siteverify and Durable Object transport are mocked; no Cloudflare service is called.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import worker, { GuestRateLimiter } from '../cloudflare/guest-ingress/index.js'

const url = process.env.SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const publishable = process.env.SUPABASE_ANON_KEY
const secret = process.env.INGRESS_HMAC_KEY
if (!url || !service || !publishable || !secret || secret.length < 32
  || !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) {
  throw Error('Configure only local Supabase URL, keys and INGRESS_HMAC_KEY')
}
const admin = createClient(url, service, { auth: { persistSession: false } })
const anon = createClient(url, publishable, { auth: { persistSession: false } })
const user = await admin.auth.admin.createUser({ email: `flow-${randomUUID()}@example.test`,
  password: `local-${randomUUID()}-Pass1!`, email_confirm: true })
if (user.error) throw user.error
const originalFetch = globalThis.fetch

try {
  const occurrence = await admin.from('occurrences').insert({
    reporter_id: user.data.user.id, type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: new Date().toISOString(), description: 'Animal perdido no centro',
  }).select('id').single()
  if (occurrence.error) throw occurrence.error
  const kv = new Map()
  const env = {
    ALLOWED_ORIGINS: 'http://localhost:5173', EXPECTED_HOSTNAME: 'example.test',
    EXPECTED_ACTION: 'report_guest_sighting', TURNSTILE_SECRET_KEY: 'test-only',
    INGRESS_HMAC_KEY: secret, GUEST_SIGHTING_RATE_SECRET: randomUUID(),
    SUPABASE_FUNCTION_URL: `${url}/functions/v1/report-guest-sighting`,
    GUEST_RATE_LIMITER: { idFromName: (name) => name,
      get: (name) => ({ fetch: async (...args) => {
        let data = kv.get(name)
        if (!data) { data = new Map(); kv.set(name, data) }
        const limiter = new GuestRateLimiter({ storage: { kv: {
          get: (key) => data.get(key), put: (key, value) => data.set(key, value),
        } } })
        return limiter.fetch(new Request(...args))
      } }),
    },
  }
  let forwarded
  globalThis.fetch = async (target, options) => {
    if (String(target).includes('siteverify')) {
      return Response.json({ success: true, hostname: env.EXPECTED_HOSTNAME,
        action: env.EXPECTED_ACTION })
    }
    if (String(target) === env.SUPABASE_FUNCTION_URL) {
      forwarded = options
      return originalFetch(target, { ...options, headers: { apikey: publishable, ...options.headers } })
    }
    return originalFetch(target, options)
  }
  const request = new Request('https://api.buscapet.example/report-guest-sighting', {
    method: 'POST', headers: { origin: env.ALLOWED_ORIGINS,
      'cf-connecting-ip': '2001:db8::1234', 'x-forwarded-for': '198.51.100.10' },
    body: JSON.stringify({ occurrenceId: occurrence.data.id,
      observedAt: new Date().toISOString(), area: 'Centro',
      description: 'Avistado perto da praca', challengeToken: 'mock-token',
      latitude: -15.6, longitude: -56.1 }),
  })
  Object.defineProperty(request, 'cf', { value: { colo: 'test' } })
  const response = await worker.fetch(request, env)
  assert.equal(response.status, 202)
  assert.ok(forwarded)
  const replay = await originalFetch(env.SUPABASE_FUNCTION_URL, {
    method: 'POST', headers: { apikey: publishable, ...forwarded.headers }, body: forwarded.body,
  })
  assert.equal(replay.status, 409)
  assert.ok((await anon.from('sightings').select('id')).error)
  const rows = await admin.from('sightings').select('id,reporter_id').eq('occurrence_id', occurrence.data.id)
  assert.equal(rows.data?.length, 1)
  assert.equal(rows.data[0].reporter_id, null)
  assert.ok((await anon.rpc('sighting_coordinates', { p_sighting: rows.data[0].id })).error)
  console.log('Local Worker-to-Edge flow, replay and privacy: passed')
} finally {
  globalThis.fetch = originalFetch
  await admin.auth.admin.deleteUser(user.data.user.id)
}
