// Run only against a disposable local Supabase stack with the migration applied.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const publishable = process.env.SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !publishable || !service || !/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error('Set local SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY')
}

const admin = createClient(url, service, { auth: { persistSession: false } })
const anonymous = createClient(url, publishable, { auth: { persistSession: false } })
const users = []
const unwrap = (result) => {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function account() {
  const email = `storage-${randomUUID()}@example.test`
  const password = `local-${randomUUID()}-Pass1!`
  const created = unwrap(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
  users.push(created.user.id)
  const client = createClient(url, publishable, { auth: { persistSession: false } })
  unwrap(await client.auth.signInWithPassword({ email, password }))
  return { client, id: created.user.id }
}

try {
  const owner = await account()
  const stranger = await account()
  assert.equal(unwrap(await owner.client.auth.getUser()).user.id, owner.id)
  assert.equal(unwrap(await owner.client.from('profiles').select('status').eq('id', owner.id).single()).status, 'active')
  const occurrence = unwrap(await owner.client.from('occurrences').insert({
    reporter_id: owner.id,
    type: 'lost',
    city: 'Cuiaba',
    region: 'Centro',
    last_seen_at: new Date().toISOString(),
    description: 'Animal perdido no centro',
    visibility: 'public',
  }).select('id').single())
  const bytes = await readFile(new URL('../assets/hex.png', import.meta.url))
  const path = `${owner.id}/${randomUUID()}.png`
  unwrap(await owner.client.storage.from('pet-media').upload(path, bytes, {
    contentType: 'image/png', upsert: false,
  }))
  assert.ok(unwrap(await owner.client.storage.from('pet-media').download(path)))
  assert.ok((await stranger.client.storage.from('pet-media').download(path)).error)
  assert.ok((await anonymous.storage.from('pet-media').download(path)).error)

  const photo = unwrap(await owner.client.from('occurrence_photos').insert({
    occurrence_id: occurrence.id,
    uploaded_by: owner.id,
    storage_path: path,
    mime_type: 'image/png',
    byte_size: bytes.length,
  }).select('id').single())
  assert.ok(unwrap(await anonymous.storage.from('pet-media').download(path)))
  assert.ok(unwrap(await stranger.client.storage.from('pet-media').download(path)))
  unwrap(await admin.from('occurrences').update({ visibility: 'under_review' }).eq('id', occurrence.id))
  assert.ok((await anonymous.storage.from('pet-media').download(path)).error)
  unwrap(await admin.from('occurrences').update({ visibility: 'public' }).eq('id', occurrence.id))

  const privateOccurrence = unwrap(await owner.client.from('occurrences').insert({
    reporter_id: owner.id,
    type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: new Date().toISOString(),
    description: 'Outro animal perdido no centro', visibility: 'private',
  }).select('id').single())
  const privatePath = `${owner.id}/${randomUUID()}.png`
  unwrap(await owner.client.storage.from('pet-media').upload(privatePath, bytes, {
    contentType: 'image/png', upsert: false,
  }))
  unwrap(await owner.client.from('occurrence_photos').insert({
    occurrence_id: privateOccurrence.id, uploaded_by: owner.id,
    storage_path: privatePath, mime_type: 'image/png', byte_size: bytes.length,
  }))
  assert.ok((await anonymous.storage.from('pet-media').download(privatePath)).error)
  assert.ok((await stranger.client.storage.from('pet-media').download(privatePath)).error)
  await stranger.client.storage.from('pet-media').remove([privatePath])
  assert.ok(unwrap(await owner.client.storage.from('pet-media').download(privatePath)))
  unwrap(await owner.client.from('occurrence_photos').delete().eq('id', photo.id))
  assert.ok((await anonymous.storage.from('pet-media').download(path)).error)
  unwrap(await owner.client.storage.from('pet-media').remove([path, privatePath]))
  assert.ok((await owner.client.storage.from('pet-media').download(path)).error)
  console.log('Storage upload, private/public read, cross-user denial and delete: passed')
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id)
}
