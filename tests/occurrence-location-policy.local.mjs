import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function getLocalConfig() {
  const output = execFileSync('cmd.exe', [
    '/d', '/s', '/c', 'npx.cmd supabase status --output json',
  ], { encoding: 'utf8', windowsHide: true });
  const jsonStart = output.indexOf('{');
  assert.notEqual(jsonStart, -1, 'Supabase local status returned JSON');
  const status = JSON.parse(output.slice(jsonStart));
  assert.match(status.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/,
    'integration test must target a loopback Supabase API');
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY,
    'local Supabase keys are available');
  return { url: status.API_URL, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
}

const config = getLocalConfig();
const service = createClient(config.url, config.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(config.url, config.anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = `Local-${randomUUID()}-Aa1!`;
const users = [];
const occurrenceIds = {
  publicLost: randomUUID(),
  privateLost: randomUUID(),
  thirdPartyPublic: randomUUID(),
  foundPublic: randomUUID(),
  suspendedPrivate: randomUUID(),
  ownerInsertTarget: randomUUID(),
};
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function unwrap(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.code || 'unknown'} HTTP ${result.status || 'n/a'}: ${result.error.message}`);
  }
  return result.data;
}

function expectDenied(result, label) {
  check(Boolean(result.error), `${label}: request is denied`);
  check(result.error?.code === '42501', `${label}: denial is PostgreSQL SQLSTATE 42501`);
}

function safeLocationRows(rows, label) {
  check(Array.isArray(rows), `${label}: response is an array`);
  check(rows.every((row) => !('reporter_id' in row) && !('pet_id' in row)),
    `${label}: response contains no private occurrence identifiers`);
}

async function account(label) {
  const email = `r4-map-policy-${label}-${randomUUID()}@example.test`;
  const created = unwrap(await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `R4 map policy ${label}` },
  }), `create synthetic ${label} user`);
  users.push(created.user.id);
  const client = createClient(config.url, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  unwrap(await client.auth.signInWithPassword({ email, password }), `sign in synthetic ${label} user`);
  return { id: created.user.id, client };
}

async function run() {
  const [owner, thirdParty, suspended] = await Promise.all([
    account('owner'), account('third-party'), account('suspended'),
  ]);
  const now = new Date().toISOString();
  const occurrenceRows = [
    { id: occurrenceIds.publicLost, reporter_id: owner.id, type: 'lost', status: 'active',
      visibility: 'public', city: 'Cuiaba', region: 'Centro', last_seen_at: now,
      description: 'Synthetic public lost occurrence.' },
    { id: occurrenceIds.privateLost, reporter_id: owner.id, type: 'lost', status: 'active',
      visibility: 'private', city: 'Cuiaba', region: 'Privada', last_seen_at: now,
      description: 'Synthetic private lost occurrence.' },
    { id: occurrenceIds.thirdPartyPublic, reporter_id: thirdParty.id, type: 'lost', status: 'active',
      visibility: 'public', city: 'Cuiaba', region: 'Outro bairro', last_seen_at: now,
      description: 'Synthetic third-party public occurrence.' },
    { id: occurrenceIds.foundPublic, reporter_id: owner.id, type: 'found', status: 'active',
      visibility: 'public', city: 'Cuiaba', region: 'Centro', last_seen_at: now,
      description: 'Synthetic found occurrence.' },
    { id: occurrenceIds.suspendedPrivate, reporter_id: suspended.id, type: 'lost', status: 'active',
      visibility: 'private', city: 'Cuiaba', region: 'Privada', last_seen_at: now,
      description: 'Synthetic suspended-owner occurrence.' },
    { id: occurrenceIds.ownerInsertTarget, reporter_id: owner.id, type: 'lost', status: 'active',
      visibility: 'private', city: 'Cuiaba', region: 'Privada', last_seen_at: now,
      description: 'Synthetic owner insert target.' },
  ];
  unwrap(await service.from('occurrences').insert(occurrenceRows), 'seed synthetic occurrences');
  unwrap(await service.from('occurrence_public_locations').insert([
    [occurrenceIds.publicLost, -56.10, -15.60, 'Approximate public area'],
    [occurrenceIds.privateLost, -56.11, -15.61, 'Approximate private area'],
    [occurrenceIds.thirdPartyPublic, -56.12, -15.62, 'Third-party public area'],
    [occurrenceIds.suspendedPrivate, -56.13, -15.63, 'Suspended-owner private area'],
  ].map(([occurrence_id, longitude, latitude, public_description]) => ({
    occurrence_id,
    approx_location: `POINT(${longitude} ${latitude})`,
    radius_m: 900,
    public_description,
    consented_at: now,
  }))), 'seed synthetic approximate locations');
  unwrap(await service.from('profiles').update({ status: 'suspended' }).eq('id', suspended.id),
    'suspend synthetic account');

  if (process.env.OCCURRENCE_LOCATION_BASELINE === '1') {
    const baseline = await owner.client.rpc('get_occurrence_public_location', {
      p_occurrence: occurrenceIds.privateLost,
    });
    check(baseline.error?.code === '42501',
      'baseline owner read reproduces SQLSTATE 42501 from the old reporter_id policy');
    check(Boolean(baseline.status), 'baseline REST response contains an HTTP error status');
    console.log(`Baseline reproduced: authenticated owner RPC failed with SQLSTATE ${baseline.error.code}, HTTP ${baseline.status}.`);
    return;
  }

  const anonymousPublic = unwrap(await anon.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'anonymous public location RPC');
  check(anonymousPublic.length === 1, 'anonymous caller reads an authorized public location');
  safeLocationRows(anonymousPublic, 'anonymous RPC');
  check(anonymousPublic[0].latitude === -15.60 && anonymousPublic[0].longitude === -56.10,
    'anonymous RPC returns only the rounded approximate point');
  check(unwrap(await anon.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.privateLost,
  }), 'anonymous private location RPC').length === 0,
  'anonymous caller cannot read a private location');
  const anonDirect = await anon.from('occurrence_public_locations')
    .select('occurrence_id,radius_m,public_description').eq('occurrence_id', occurrenceIds.publicLost);
  check(unwrap(anonDirect, 'anonymous direct public location read').length === 1,
    'anonymous Data API read retains public location access');
  check(unwrap(await anon.from('occurrence_public_locations').select('occurrence_id')
    .eq('occurrence_id', occurrenceIds.privateLost), 'anonymous private direct read').length === 0,
  'anonymous Data API cannot read a private location');
  check(unwrap(await anon.rpc('search_public_map_points', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'anonymous map search').some((row) => row.occurrence_id === occurrenceIds.publicLost),
  'public map search still returns the authorized approximate marker');
  check(!('reporter_id' in anonymousPublic[0]) && !('pet_id' in anonymousPublic[0]),
    'public location RPC does not disclose reporter_id or pet_id');
  check(unwrap(await anon.rpc('occurrence_is_owner', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'anonymous owner indicator') === false, 'anonymous owner indicator remains false');

  const ownerPublic = unwrap(await owner.client.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'owner public location RPC');
  check(ownerPublic.length === 1, 'owner can read their public location');
  const ownerPrivate = unwrap(await owner.client.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.privateLost,
  }), 'owner private location RPC');
  check(ownerPrivate.length === 1, 'owner can read their private location for management');
  check(unwrap(await owner.client.rpc('occurrence_is_owner', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'owner indicator') === true, 'active owner indicator is true');

  const otherPublic = unwrap(await thirdParty.client.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'third-party public location RPC');
  check(otherPublic.length === 1, 'third party can read a public location');
  check(unwrap(await thirdParty.client.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.privateLost,
  }), 'third-party private location RPC').length === 0,
  'third party cannot read a private location');
  check(unwrap(await thirdParty.client.rpc('occurrence_is_owner', {
    p_occurrence: occurrenceIds.publicLost,
  }), 'third-party owner indicator') === false, 'third-party owner indicator is false');

  const insert = await owner.client.from('occurrence_public_locations').insert({
    occurrence_id: occurrenceIds.ownerInsertTarget,
    approx_location: 'POINT(-56.14 -15.64)',
    radius_m: 900,
    public_description: 'Owner-created approximate point',
    consented_at: now,
  }).select('occurrence_id').single();
  check(unwrap(insert, 'owner inserts own lost location').occurrence_id === occurrenceIds.ownerInsertTarget,
    'active owner can insert a location for their own lost occurrence');

  const outsiderInsert = await thirdParty.client.from('occurrence_public_locations').insert({
    occurrence_id: occurrenceIds.publicLost,
    approx_location: 'POINT(-56.15 -15.65)',
    radius_m: 900,
    public_description: 'Unauthorized third-party point',
    consented_at: now,
  }).select('occurrence_id');
  expectDenied(outsiderInsert, 'third-party insert');

  const ownerUpdate = await owner.client.from('occurrence_public_locations').update({
    public_description: 'Owner-updated approximate point',
  }).eq('occurrence_id', occurrenceIds.privateLost)
    .select('occurrence_id,public_description').single();
  check(unwrap(ownerUpdate, 'owner updates own location').public_description
    === 'Owner-updated approximate point', 'active owner can update their own location');
  const outsiderUpdate = await thirdParty.client.from('occurrence_public_locations').update({
    public_description: 'Unauthorized third-party update',
  }).eq('occurrence_id', occurrenceIds.publicLost).select('occurrence_id');
  check(unwrap(outsiderUpdate, 'third-party update').length === 0,
    'third-party update returns no rows and cannot modify the location');
  const unchanged = unwrap(await owner.client.from('occurrence_public_locations')
    .select('public_description').eq('occurrence_id', occurrenceIds.publicLost).single(),
  'verify public location unchanged');
  check(unchanged.public_description === 'Approximate public area',
    'third-party update leaves owner data unchanged');

  const outsiderDelete = await thirdParty.client.from('occurrence_public_locations').delete()
    .eq('occurrence_id', occurrenceIds.publicLost).select('occurrence_id');
  check(unwrap(outsiderDelete, 'third-party delete').length === 0,
    'third-party delete returns no rows');
  const ownerDelete = await owner.client.from('occurrence_public_locations').delete()
    .eq('occurrence_id', occurrenceIds.ownerInsertTarget).select('occurrence_id').single();
  check(unwrap(ownerDelete, 'owner delete').occurrence_id === occurrenceIds.ownerInsertTarget,
    'owner can delete their own location');

  const foundInsert = await owner.client.from('occurrence_public_locations').insert({
    occurrence_id: occurrenceIds.foundPublic,
    approx_location: 'POINT(-56.17 -15.67)',
    radius_m: 900,
    public_description: 'Found occurrence point must be denied',
    consented_at: now,
  }).select('occurrence_id');
  expectDenied(foundInsert, 'found occurrence insert');

  check(unwrap(await suspended.client.rpc('occurrence_is_owner', {
    p_occurrence: occurrenceIds.suspendedPrivate,
  }), 'suspended owner indicator') === false, 'suspended owner receives no ownership privilege');
  check(unwrap(await suspended.client.rpc('get_occurrence_public_location', {
    p_occurrence: occurrenceIds.suspendedPrivate,
  }), 'suspended private location RPC').length === 0,
  'suspended owner cannot read their private location as owner');
  const suspendedInsert = await suspended.client.from('occurrence_public_locations').insert({
    occurrence_id: occurrenceIds.suspendedPrivate,
    approx_location: 'POINT(-56.18 -15.68)',
    radius_m: 900,
    public_description: 'Suspended owner point',
    consented_at: now,
  }).select('occurrence_id');
  expectDenied(suspendedInsert, 'suspended-owner insert');
  const suspendedUpdate = await suspended.client.from('occurrence_public_locations').update({
    public_description: 'Suspended update must be denied',
  }).eq('occurrence_id', occurrenceIds.suspendedPrivate).select('occurrence_id');
  check(unwrap(suspendedUpdate, 'suspended-owner update').length === 0,
    'suspended owner update returns no rows');
  const suspendedDelete = await suspended.client.from('occurrence_public_locations').delete()
    .eq('occurrence_id', occurrenceIds.suspendedPrivate).select('occurrence_id');
  check(unwrap(suspendedDelete, 'suspended-owner delete').length === 0,
    'suspended owner delete returns no rows');

  console.log(`Local occurrence location REST/RPC: ${checks} assertions passed.`);
}

try {
  await run();
} finally {
  for (const id of users) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw error;
  }
}
