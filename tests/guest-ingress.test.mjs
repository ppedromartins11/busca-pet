import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { GuestRateLimiter } from '../cloudflare/guest-ingress/index.js'

const originalFetch = globalThis.fetch
const base = {
  ALLOWED_ORIGINS: 'https://buscapet.example',
  EXPECTED_HOSTNAME: 'buscapet.example',
  EXPECTED_ACTION: 'report_guest_sighting',
  SUPABASE_FUNCTION_URL: 'https://project.supabase.co/functions/v1/report-guest-sighting',
  TURNSTILE_SECRET_KEY: 'test-secret',
  INGRESS_HMAC_KEY: 'h'.repeat(48),
  GUEST_SIGHTING_RATE_SECRET: 'r'.repeat(48),
}
const payload = () => ({ occurrenceId: crypto.randomUUID(), observedAt: new Date().toISOString(),
  area: 'Centro', description: 'Animal visto perto da praca', challengeToken: 'token',
  latitude: -15.6, longitude: -56.1 })

function harness({ verification = {}, edgeStatus = 202, failSiteverify = false,
  failEdge = false, failLimiter = false } = {}) {
  const counts = new Map()
  const state = { calls: [], forwarded: [] }
  const env = { ...base, GUEST_RATE_LIMITER: {
    idFromName: (name) => name,
    get: (name) => ({ fetch: async (...args) => {
      if (failLimiter) throw Error('limiter unavailable')
      let storage = counts.get(name)
      if (!storage) { storage = new Map(); counts.set(name, storage) }
      const object = new GuestRateLimiter({ storage: { kv: {
        get: (key) => storage.get(key), put: (key, value) => storage.set(key, value),
      } } })
      return object.fetch(new Request(...args))
    } }),
  } }
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('siteverify')) {
      state.calls.push('siteverify')
      if (failSiteverify) throw Error('network')
      return Response.json({ success: true, hostname: base.EXPECTED_HOSTNAME,
        action: base.EXPECTED_ACTION, ...verification })
    }
    state.calls.push('edge')
    state.forwarded.push(options)
    if (failEdge) throw Error('network')
    return Response.json({ accepted: true }, { status: edgeStatus })
  }
  const request = (body = payload(), ip = '2001:db8::1', extra = {}) => {
    const req = new Request('https://api.buscapet.example/report-guest-sighting', {
      method: 'POST', headers: { origin: base.ALLOWED_ORIGINS,
        'content-type': 'application/json', 'cf-connecting-ip': ip, ...extra },
      body: JSON.stringify(body),
    })
    Object.defineProperty(req, 'cf', { value: { colo: 'test' } })
    return req
  }
  return { env, state, request }
}

test.afterEach(() => { globalThis.fetch = originalFetch })

test('legitimate guest request strips token and IP before Edge, with signed body', async () => {
  const h = harness()
  const response = await worker.fetch(h.request(), h.env)
  assert.equal(response.status, 202)
  assert.deepEqual(h.state.calls, ['siteverify', 'edge'])
  assert.equal(JSON.parse(h.state.forwarded[0].body).challengeToken, undefined)
  assert.equal(h.state.forwarded[0].headers['cf-connecting-ip'], undefined)
  assert.match(h.state.forwarded[0].headers['x-buscapet-signature'], /^[0-9a-f]{64}$/)
})

test('missing, invalid and reused Turnstile tokens fail closed', async () => {
  const h = harness({ verification: { success: false } })
  assert.equal((await worker.fetch(h.request({ ...payload(), challengeToken: '' }), h.env)).status, 400)
  assert.equal((await worker.fetch(h.request(), h.env)).status, 403)
  assert.deepEqual(h.state.calls, ['siteverify'])
  const reused = harness({ verification: { success: false, 'error-codes': ['timeout-or-duplicate'] } })
  assert.equal((await worker.fetch(reused.request(), reused.env)).status, 403)
})

test('hostname, action, origin and payload are validated', async () => {
  const h = harness({ verification: { action: 'other' } })
  assert.equal((await worker.fetch(h.request(), h.env)).status, 403)
  const host = harness({ verification: { hostname: 'evil.example' } })
  assert.equal((await worker.fetch(host.request(), host.env)).status, 403)
  const invalid = harness()
  assert.equal((await worker.fetch(invalid.request({ ...payload(), latitude: 999 }), invalid.env)).status, 400)
  assert.equal((await worker.fetch(invalid.request(payload(), '2001:db8::1', { origin: 'https://evil.example' }), invalid.env)).status, 403)
})

test('spoofed forwarding headers do not change rate identity', async () => {
  const h = harness()
  for (let n = 0; n < 20; n++) {
    assert.equal((await worker.fetch(h.request(payload(), '2001:db8::1',
      { 'x-forwarded-for': `192.0.2.${n}` }), h.env)).status, 202)
  }
  assert.equal((await worker.fetch(h.request(payload(), '2001:db8::1',
    { 'x-forwarded-for': '198.51.100.1' }), h.env)).status, 429)
  assert.equal((await worker.fetch(h.request(payload(), '2001:db8::2'), h.env)).status, 202)
  assert.equal(h.state.calls.filter((x) => x === 'siteverify').length, 21)
})

test('missing Cloudflare ingress metadata and dependency failures reject safely', async () => {
  const h = harness()
  const direct = new Request('https://api.buscapet.example/report-guest-sighting', {
    method: 'POST', headers: { origin: base.ALLOWED_ORIGINS, 'cf-connecting-ip': '2001:db8::1' },
    body: JSON.stringify(payload()),
  })
  assert.equal((await worker.fetch(direct, h.env)).status, 503)
  for (const opts of [{ failLimiter: true }, { failSiteverify: true }, { failEdge: true }]) {
    const failure = harness(opts)
    assert.equal((await worker.fetch(failure.request(), failure.env)).status, 503)
  }
})
