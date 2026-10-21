const path = '/report-guest-sighting'
const encoder = new TextEncoder()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
const hash = async (value) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
const reply = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json', 'cache-control': 'no-store',
  ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
} })

async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 8192) throw Error('large')
  if (!request.body) throw Error('invalid')
  const reader = request.body.getReader()
  const parts = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 8192) throw Error('large')
      parts.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function valid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const seen = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN
  const noCoordinates = value.latitude === undefined && value.longitude === undefined
  const coordinates = typeof value.latitude === 'number' && Number.isFinite(value.latitude)
    && value.latitude >= -90 && value.latitude <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude)
    && value.longitude >= -180 && value.longitude <= 180
  return typeof value.occurrenceId === 'string' && uuid.test(value.occurrenceId)
    && Number.isFinite(seen) && seen <= Date.now() && seen >= Date.now() - 30 * 86400000
    && typeof value.area === 'string' && value.area.trim().length >= 2 && value.area.trim().length <= 200
    && typeof value.description === 'string' && value.description.trim().length >= 5
    && value.description.trim().length <= 2000
    && typeof value.challengeToken === 'string' && value.challengeToken.length > 0
    && value.challengeToken.length <= 2048 && (noCoordinates || coordinates)
}

export class GuestRateLimiter {
  constructor(state) { this.state = state }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/consume') return new Response(null, { status: 404 })
    const hour = Math.floor(Date.now() / 3600000)
    const kv = this.state.storage.kv
    const saved = kv.get('attempts')
    const count = saved?.hour === hour ? saved.count : 0
    if (count >= 20) return new Response(null, { status: 429 })
    kv.put('attempts', { hour, count: count + 1 })
    return new Response(null, { status: 204 })
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin')
    const origins = (env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean)
    const allowed = origin && origins.includes(origin) ? origin : undefined
    if (new URL(request.url).pathname !== path) return reply(404, { error: 'not_found' })
    if (!allowed) return reply(403, { error: 'origin_forbidden' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': allowed,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type', vary: 'Origin',
    } })
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' }, allowed)
    if (!env.GUEST_RATE_LIMITER || !env.TURNSTILE_SECRET_KEY || !env.INGRESS_HMAC_KEY
      || env.INGRESS_HMAC_KEY.length < 32 || !env.GUEST_SIGHTING_RATE_SECRET
      || env.GUEST_SIGHTING_RATE_SECRET.length < 32 || !env.SUPABASE_FUNCTION_URL
      || !env.EXPECTED_HOSTNAME || !env.EXPECTED_ACTION) return reply(503, { error: 'unavailable' }, allowed)
    // CF-Connecting-IP is assigned by Cloudflare on the configured zone route.
    // request.cf must exist; never use a client-supplied X-Forwarded-For value.
    const ip = request.cf && request.headers.get('cf-connecting-ip')
    if (!ip || ip.length > 45 || !/^[0-9a-f:.]+$/i.test(ip)) return reply(503, { error: 'unavailable' }, allowed)
    let input
    try { input = await readBody(request) } catch (error) {
      return reply(error?.message === 'large' ? 413 : 400,
        { error: error?.message === 'large' ? 'payload_too_large' : 'invalid_request' }, allowed)
    }
    if (!valid(input)) return reply(400, { error: 'invalid_request' }, allowed)

    const sourceHash = await hash(`${env.GUEST_SIGHTING_RATE_SECRET}:ip:${ip}`)
    try {
      const stub = env.GUEST_RATE_LIMITER.get(env.GUEST_RATE_LIMITER.idFromName(sourceHash))
      const limit = await stub.fetch('https://internal/consume', { method: 'POST' })
      if (limit.status === 429) return reply(429, { error: 'rate_limited' }, allowed)
      if (limit.status !== 204) return reply(503, { error: 'unavailable' }, allowed)
    } catch { return reply(503, { error: 'unavailable' }, allowed) }

    let verified
    try {
      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', signal: AbortSignal.timeout(5000),
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY,
          response: input.challengeToken, remoteip: ip }),
      })
      if (!response.ok) return reply(503, { error: 'unavailable' }, allowed)
      verified = await response.json()
    } catch { return reply(503, { error: 'unavailable' }, allowed) }
    if (verified?.success !== true || verified.hostname !== env.EXPECTED_HOSTNAME
      || verified.action !== env.EXPECTED_ACTION) return reply(403, { error: 'challenge_failed' }, allowed)

    const payload = JSON.stringify({ occurrenceId: input.occurrenceId, observedAt: input.observedAt,
      area: input.area.trim(), description: input.description.trim(),
      latitude: input.latitude ?? null, longitude: input.longitude ?? null })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = crypto.randomUUID()
    const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${sourceHash}\n${await hash(payload)}`
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.INGRESS_HMAC_KEY),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = hex(await crypto.subtle.sign('HMAC', key, encoder.encode(canonical)))
    try {
      const response = await fetch(env.SUPABASE_FUNCTION_URL, { method: 'POST',
        signal: AbortSignal.timeout(7000),
        headers: { 'content-type': 'application/json',
          'x-buscapet-timestamp': timestamp, 'x-buscapet-nonce': nonce,
          'x-buscapet-source': sourceHash, 'x-buscapet-signature': signature },
        body: payload,
      })
      if (response.status === 202) return reply(202, { accepted: true }, allowed)
      if (response.status === 429) return reply(429, { error: 'rate_limited' }, allowed)
      if (response.status === 400) return reply(400, { error: 'sighting_unavailable' }, allowed)
      return reply(503, { error: 'unavailable' }, allowed)
    } catch { return reply(503, { error: 'unavailable' }, allowed) }
  },
}
