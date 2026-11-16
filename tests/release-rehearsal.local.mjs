// Synthetic fixture and reconciliation checks for the disposable R4.5 staging stack.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = process.env.R45_WORKDIR;
const phase = process.argv[2];
assert.ok(root?.endsWith('buscapet-r45-staged'));
assert.ok(['setup', 'legacy-before', 'gated', 'legacy-after', 'resume'].includes(phase));
const manifestPath = join(root, 'rehearsal-fixture.json');
const raw = execFileSync('cmd.exe', ['/d', '/s', '/c',
  `npx.cmd supabase status --workdir ${root} --output json`],
{ encoding: 'utf8', windowsHide: true });
const status = JSON.parse(raw.slice(raw.indexOf('{')));
assert.equal(status.API_URL, 'http://127.0.0.1:56321');
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(status.API_URL, status.ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sql = (query) => execFileSync('docker', ['exec', 'supabase_db_buscapet-r45-staged',
  'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-A', '-t',
  '-v', 'ON_ERROR_STOP=1', '-c', query],
{ encoding: 'utf8', windowsHide: true }).trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=',
  'base64');

if (phase === 'setup') {
  assert.equal(sql('select active from buscapet_private.maintenance_state'), 'f');
  const created = await service.auth.admin.createUser({
    email: `r45-rehearsal-${randomUUID()}@example.test`,
    password: `Local-${randomUUID()}-Aa1!`, email_confirm: true,
  });
  assert.ifError(created.error);
  const owner = created.data.user.id;
  const pet = randomUUID();
  const occurrence = randomUUID();
  const object = `${owner}/${randomUUID()}.png`;
  let result = await service.from('pets').insert({ id: pet, owner_id: owner,
    name: 'Ensaio', species: 'dog' });
  assert.ifError(result.error);
  result = await service.from('occurrences').insert({ id: occurrence,
    pet_id: pet, reporter_id: owner, type: 'lost', city: 'Cuiaba',
    region: 'Centro', last_seen_at: new Date().toISOString(),
    description: 'Alerta sintetico do ensaio' });
  assert.ifError(result.error);
  result = await service.storage.from('pet-media').upload(object, png,
    { contentType: 'image/png', upsert: false });
  assert.ifError(result.error);
  result = await service.from('pet_photos').insert({ pet_id: pet, uploaded_by: owner,
    storage_path: object, mime_type: 'image/png', byte_size: png.length,
    is_cover: true });
  assert.ifError(result.error);
  writeFileSync(manifestPath, JSON.stringify({ owner, pet, occurrence, object,
    objectSha256: sha(png) }) + '\n', { flag: 'wx' });
  console.log('R4.5 isolated fixture: Auth, profile, pet, occurrence, linked photo created');
} else if (phase === 'legacy-before' || phase === 'legacy-after') {
  const broad = await anon.from('occurrences').select('*').limit(1);
  if (phase === 'legacy-before') assert.ifError(broad.error);
  else assert.equal(broad.error?.code, '42501');
  console.log(`R4.5 isolated ${phase}: published frontend broad SELECT compatibility checked`);
} else {
  const fixture = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.match(fixture.owner, /^[0-9a-f-]{36}$/);
  assert.equal(sql(`select count(*) from auth.users where id='${fixture.owner}'`), '1');
  assert.equal(sql(`select count(*) from public.profiles where id='${fixture.owner}'`), '1');
  assert.equal(sql(`select count(*) from public.pets where id='${fixture.pet}'`), '1');
  assert.equal(sql(`select count(*) from public.occurrences where id='${fixture.occurrence}'`), '1');
  assert.equal(sql(`select count(*) from public.pet_photos
    where pet_id='${fixture.pet}' and storage_path='${fixture.object}'`), '1');
  assert.equal(sql(`select count(*) from storage.objects
    where bucket_id='pet-media' and name='${fixture.object}'`), '1');
  const physical = execFileSync('docker', ['exec',
    'supabase_storage_buscapet-r45-staged', 'sh', '-c',
    `find /mnt -type f -path '*/${fixture.object.split('/')[1]}/*' -print`],
  { encoding: 'utf8', windowsHide: true }).trim();
  assert.ok(physical, 'physical object must exist in isolated Storage');
  assert.equal(physical.split('\n').length, 1, 'one physical object version expected');
  const physicalSha = execFileSync('docker', ['exec',
    'supabase_storage_buscapet-r45-staged', 'sha256sum', physical],
  { encoding: 'utf8', windowsHide: true }).trim().split(' ')[0];
  assert.equal(physicalSha, fixture.objectSha256);
  const download = await service.storage.from('pet-media').download(fixture.object);
  assert.ifError(download.error);
  assert.equal(sha(Buffer.from(await download.data.arrayBuffer())), fixture.objectSha256);
  if (phase === 'gated') {
    assert.equal(sql('select active from buscapet_private.maintenance_state'), 't');
    if (Number(sql('select count(*) from supabase_migrations.schema_migrations')) === 16) {
      const projection = await anon.from('public_occurrences').select('id').limit(1);
      assert.ifError(projection.error);
      assert.equal(sql(`select has_function_privilege('authenticated',
        'public.my_occurrences()', 'EXECUTE')`), 't');
    }
    const attempt = await service.from('pets').insert({ owner_id: fixture.owner,
      name: 'Bloqueado', species: 'dog' });
    assert.equal(attempt.error?.code, 'PT503');
    assert.equal(sql(`select count(*) from public.pets where owner_id='${fixture.owner}'`), '1');
  } else {
    assert.equal(sql('select active from buscapet_private.maintenance_state'), 'f');
    const attempt = await service.from('pets').insert({ owner_id: fixture.owner,
      name: 'Retomado', species: 'dog' });
    assert.ifError(attempt.error);
    assert.equal(sql(`select count(*) from public.pets where owner_id='${fixture.owner}'`), '2');
  }
  console.log(`R4.5 isolated ${phase}: Auth/profile, object metadata, physical bytes and linked photo verified`);
}
