// Run against a disposable local Supabase stack only. Never point this at production.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createRemoteStore } from '../src/remote-store.js'

const url = process.env.SUPABASE_URL
const publishable = process.env.SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !publishable || !service || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) {
  throw new Error('Set local SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY')
}
const admin = createClient(url, service, { auth: { persistSession: false } })
const anonymous = createClient(url, publishable, { auth: { persistSession: false } })
const users = []
const unwrap = (result) => {
  if (result.error) throw new Error(`${result.error.code || ''} ${result.error.message}`)
  return result.data
}
async function account() {
  const email = `map-${randomUUID()}@example.test`
  const password = `local-${randomUUID()}-Pass1!`
  const created = unwrap(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
  users.push(created.user.id)
  const client = createClient(url, publishable, { auth: { persistSession: false } })
  unwrap(await client.auth.signInWithPassword({ email, password }))
  return { client, id: created.user.id, store: createRemoteStore(client) }
}
const nearby = { center: { latitude: -15.60, longitude: -56.10, radius_m: 20_000 }, limit: 200 }
const has = (rows, category, occurrenceId) => rows.some((row) => row.category === category && row.occurrence_id === occurrenceId)

try {
  const tutor = await account()
  const reporter = await account()
  const stranger = await account()
  const now = new Date().toISOString()
  const occurrence = await tutor.store.createOccurrence({ type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: now, description: 'Animal perdido na regiao central', visibility: 'public' })
  const noCoordinates = await tutor.store.createOccurrence({ type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: now, description: 'Outro animal perdido sem ponto no mapa', visibility: 'public' })
  assert.equal(await tutor.store.getOccurrencePublicLocation(noCoordinates.id), null)
  await tutor.store.saveOccurrencePublicLocation(occurrence.id, {
    latitude: -15.60123, longitude: -56.10234, radius_m: 900, description: 'Perto da praca central', consent: true,
  })
  assert.deepEqual(
    [-(await tutor.store.getOccurrencePublicLocation(occurrence.id)).latitude,
      (await tutor.store.getOccurrencePublicLocation(occurrence.id)).longitude],
    [15.60, -56.10],
  )
  assert.equal((await anonymous.rpc('get_occurrence_public_location', { p_occurrence: occurrence.id })).data?.length, 1)
  let rows = await tutor.store.listPublicMapPoints(nearby)
  assert.ok(has(rows, 'last-known', occurrence.id))
  assert.ok(!has(rows, 'last-known', noCoordinates.id))
  assert.equal(rows.find((row) => row.occurrence_id === occurrence.id).latitude, -15.60)
  assert.equal((await stranger.client.from('occurrence_public_locations').update({
    approx_location: 'POINT(-56.20 -15.70)',
  }).eq('occurrence_id', occurrence.id).select()).data.length, 0)
  await tutor.store.saveOccurrencePublicLocation(occurrence.id, {
    latitude: -15.62, longitude: -56.12, radius_m: 900, description: 'Regiao revisada', consent: true,
  })
  assert.equal((await tutor.store.getOccurrencePublicLocation(occurrence.id)).latitude, -15.62)

  const sighting = await reporter.store.createSighting({ occurrence_id: occurrence.id,
    observed_at: now, area_description: 'Perto do mercado', description: 'Vi um cao semelhante perto do mercado',
    direction: 'Seguiu para o norte' })
  await reporter.store.saveSightingPublicLocation(sighting.id, {
    latitude: -15.61, longitude: -56.11, radius_m: 900, description: 'Perto do mercado', consent: true,
  })
  rows = unwrap(await anonymous.rpc('search_public_map_points', { p_occurrence: occurrence.id }))
  assert.ok(!has(rows, 'sighting', occurrence.id), 'pending sighting is private')
  const anonymousLocation = await anonymous.from('sighting_public_locations').select('*')
  assert.ok(anonymousLocation.error || anonymousLocation.data?.length === 0)
  const anonymousSighting = await anonymous.from('sightings').select('*')
  assert.ok(anonymousSighting.error || anonymousSighting.data?.length === 0)
  assert.equal((await anonymous.schema('buscapet_private').from('sighting_locations').select('*')).error != null, true)
  await tutor.store.reviewSighting(sighting.id, 'reviewed')
  rows = unwrap(await anonymous.rpc('search_public_map_points', { p_occurrence: occurrence.id }))
  assert.ok(!has(rows, 'sighting', occurrence.id), 'review alone is not publication')
  assert.equal((await stranger.client.from('sighting_public_locations').update({ approved_by_tutor: true })
    .eq('sighting_id', sighting.id).select()).data.length, 0)
  await tutor.store.setSightingPublication(sighting.id, true)
  rows = unwrap(await anonymous.rpc('search_public_map_points', { p_occurrence: occurrence.id }))
  assert.ok(has(rows, 'sighting', occurrence.id), 'approved reviewed sighting is public')
  assert.equal(rows.find((row) => row.category === 'sighting').latitude, -15.61)
  assert.ok(rows.every((row) => !('exact_location' in row)))
  await tutor.store.setSightingPublication(sighting.id, false)
  rows = unwrap(await anonymous.rpc('search_public_map_points', { p_occurrence: occurrence.id }))
  assert.ok(!has(rows, 'sighting', occurrence.id), 'approval is revocable')

  const filtered = unwrap(await anonymous.rpc('search_public_map_points', {
    p_city: 'NoSuchCity', p_limit: 200,
  }))
  assert.equal(filtered.length, 0)
  assert.ok((await anonymous.rpc('search_public_map_points', { p_limit: 201 })).error)
  const partner = await account()
  unwrap(await partner.client.from('partner_profiles').insert({
    user_id: partner.id, organization_type: 'Clinica veterinaria', public_name: 'Clinica local',
    city: 'Cuiaba', region: 'Centro', responsible_name: 'Responsavel local',
  }))
  assert.ok((await partner.client.from('partner_public_locations').insert({
    partner_id: partner.id, commercial_location: 'POINT(-56.10 -15.60)',
    service_category: 'clinic', consented_at: now,
  })).error, 'pending partner cannot publish location')
  assert.ok(!(await tutor.store.listPublicMapPoints(nearby)).some((row) => row.category === 'partner'))
  unwrap(await admin.from('partner_profiles').update({ status: 'approved' }).eq('user_id', partner.id))
  unwrap(await partner.client.from('partner_public_locations').insert({
    partner_id: partner.id, commercial_location: 'POINT(-56.10 -15.60)',
    service_category: 'clinic', consented_at: now,
  }))
  assert.ok((await tutor.store.listPublicMapPoints(nearby)).some((row) => row.category === 'partner'))
  unwrap(await admin.from('partner_profiles').update({ status: 'rejected' }).eq('user_id', partner.id))
  assert.ok(!(await tutor.store.listPublicMapPoints(nearby)).some((row) => row.category === 'partner'))
  unwrap(await admin.from('occurrences').update({ visibility: 'private' }).eq('id', occurrence.id))
  rows = unwrap(await anonymous.rpc('search_public_map_points', { p_occurrence: occurrence.id }))
  assert.equal(rows.length, 0)
  assert.equal(unwrap(await anonymous.rpc('get_occurrence_public_location', { p_occurrence: occurrence.id })).length, 0)
  console.log('Map integration: persistence, public-only view, RLS, consent/review, filters and revocation passed')
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id)
}
