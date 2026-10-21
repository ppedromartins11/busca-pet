import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

type Submission = {
  occurrenceId: string
  observedAt: string
  area: string
  description: string
  latitude?: number | null
  longitude?: number | null
}

const encoder = new TextEncoder()
const path = '/report-guest-sighting'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hashPattern = /^[0-9a-f]{64}$/
const reply = (status: number, error?: string) => new Response(
  JSON.stringify(error ? { error } : { accepted: true }),
  { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } },
)

async function readLimited(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') || 0) > 8192) throw Error('large')
  if (!request.body) throw Error('invalid')
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
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
  return bytes
}

function valid(value: unknown): value is Submission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Record<string, unknown>
  const observed = typeof body.observedAt === 'string' ? Date.parse(body.observedAt) : NaN
  const noCoordinates = (body.latitude === null || body.latitude === undefined)
    && (body.longitude === null || body.longitude === undefined)
  const coordinates = typeof body.latitude === 'number' && Number.isFinite(body.latitude)
    && body.latitude >= -90 && body.latitude <= 90
    && typeof body.longitude === 'number' && Number.isFinite(body.longitude)
    && body.longitude >= -180 && body.longitude <= 180
  return typeof body.occurrenceId === 'string' && uuid.test(body.occurrenceId)
    && Number.isFinite(observed) && observed <= Date.now()
    && observed >= Date.now() - 30 * 86400000
    && typeof body.area === 'string' && body.area.trim().length >= 2
    && body.area.trim().length <= 200
    && typeof body.description === 'string' && body.description.trim().length >= 5
    && body.description.trim().length <= 2000 && (noCoordinates || coordinates)
}

async function authenticated(request: Request, bytes: Uint8Array, secret: string): Promise<{
  nonce: string; source: string
} | null> {
  const timestamp = request.headers.get('x-buscapet-timestamp') || ''
  const nonce = request.headers.get('x-buscapet-nonce') || ''
  const source = request.headers.get('x-buscapet-source') || ''
  const signature = request.headers.get('x-buscapet-signature') || ''
  if (!/^\d{10}$/.test(timestamp) || !uuid.test(nonce)
    || !hashPattern.test(source) || !hashPattern.test(signature)) return null
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 60) return null
  const bodyHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (b) => b.toString(16).padStart(2, '0')).join('')
  const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${source}\n${bodyHash}`
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const signatureBytes = Uint8Array.from(signature.match(/../g)!, (part) => parseInt(part, 16))
  const ok = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(canonical))
  return ok ? { nonce, source } : null
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return reply(405, 'method_not_allowed')
  const secret = Deno.env.get('INGRESS_HMAC_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!secret || secret.length < 32 || !serviceKey || !supabaseUrl) {
    return reply(503, 'unavailable')
  }
  let bytes: Uint8Array
  try { bytes = await readLimited(request) } catch (error) {
    return reply(error instanceof Error && error.message === 'large' ? 413 : 400,
      error instanceof Error && error.message === 'large' ? 'payload_too_large' : 'invalid_request')
  }
  const ingress = await authenticated(request, bytes, secret).catch(() => null)
  if (!ingress) return reply(401, 'unauthorized')
  let body: unknown
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { return reply(400, 'invalid_request') }
  if (!valid(body)) return reply(400, 'invalid_request')

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await db.rpc('ingest_guest_sighting', {
    p_source_hash: ingress.source,
    p_nonce: ingress.nonce,
    p_occurrence: body.occurrenceId,
    p_observed_at: body.observedAt,
    p_area: body.area.trim(),
    p_description: body.description.trim(),
    p_lat: body.latitude ?? null,
    p_lon: body.longitude ?? null,
  })
  if (error) {
    if (error.message.includes('rate limit exceeded')) return reply(429, 'rate_limited')
    if (error.message.includes('replayed request')) return reply(409, 'replayed_request')
    return reply(400, 'sighting_unavailable')
  }
  return reply(202)
})
