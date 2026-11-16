import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createRemoteStore } from '../src/remote-store.js';

function getLocalConfig() {
  const output = execFileSync('cmd.exe', [
    '/d', '/s', '/c', 'npx.cmd supabase status --output json',
  ], { encoding: 'utf8', windowsHide: true });
  const jsonStart = output.indexOf('{');
  assert.notEqual(jsonStart, -1, 'Supabase local status returned JSON');
  const status = JSON.parse(output.slice(jsonStart));
  const apiUrl = status.API_URL;
  assert.match(apiUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/,
    'integration test must target a loopback Supabase API');
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY,
    'local Supabase keys are available');
  return { apiUrl, anonKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY };
}

const config = getLocalConfig();
const service = createClient(config.apiUrl, config.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(config.apiUrl, config.anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = `Local-${randomUUID()}-Aa1!`;
const occurrenceIds = {
  aPublic: randomUUID(),
  aPrivate: randomUUID(),
  bPublic: randomUUID(),
  suspendedPrivate: randomUUID(),
};
const petId = randomUUID();
let checks = 0;

function removeSyntheticData() {
  execFileSync('cmd.exe', [
    '/d', '/s', '/c', 'npx.cmd supabase db query --local --file tests/occurrence-read.cleanup.local.sql',
  ], { encoding: 'utf8', windowsHide: true });
}

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

function expectDenied(result, message) {
  check(Boolean(result.error), message);
  check(result.data == null || (Array.isArray(result.data) && result.data.length === 0),
    `${message}: no rows or payload were returned`);
}

function expectSafeRows(rows, message) {
  check(Array.isArray(rows), `${message}: response is an array`);
  check(rows.every((row) => !('reporter_id' in row) && !('owner_id' in row)),
    `${message}: no owner identity is present`);
}

async function createAccount(label) {
  const email = `r4-read-${randomUUID()}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `R4 Local ${label}` },
  });
  assert.ifError(error);
  return { id: data.user.id, email };
}

async function signIn(account, label) {
  const client = createClient(config.apiUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password,
  });
  assert.ifError(error);
  check(true, `${label} authenticated through local Supabase Auth`);
  return client;
}

async function run() {
  const [ownerA, ownerB, moderator, suspendedOwner, suspendedModerator] = await Promise.all([
    createAccount('owner-a'),
    createAccount('owner-b'),
    createAccount('moderator'),
    createAccount('suspended-owner'),
    createAccount('suspended-moderator'),
  ]);

  let { error } = await service.from('user_roles').insert([
    { user_id: moderator.id, role: 'moderador' },
    { user_id: suspendedModerator.id, role: 'moderador' },
  ]);
  assert.ifError(error);

  ({ error } = await service.from('profiles').update({ status: 'suspended' })
    .in('id', [suspendedOwner.id, suspendedModerator.id]));
  assert.ifError(error);

  ({ error } = await service.from('pets').insert({
    id: petId,
    owner_id: ownerA.id,
    name: 'Synthetic R4 pet',
    species: 'dog',
  }));
  assert.ifError(error);

  const occurrenceFixtures = [
    {
      id: occurrenceIds.aPublic, pet_id: petId, reporter_id: ownerA.id,
      type: 'lost', visibility: 'public', city: 'Cuiaba', region: 'Centro',
      last_seen_at: new Date().toISOString(),
      description: 'Synthetic public occurrence for R4 read contract tests.',
    },
    {
      id: occurrenceIds.aPrivate, pet_id: petId, reporter_id: ownerA.id,
      type: 'found', visibility: 'private', city: 'Cuiaba', region: 'Privada',
      last_seen_at: new Date().toISOString(),
      description: 'Synthetic private occurrence for R4 read contract tests.',
    },
    {
      id: occurrenceIds.bPublic, reporter_id: ownerB.id, type: 'found',
      visibility: 'public', city: 'Cuiaba', region: 'Outro bairro',
      last_seen_at: new Date().toISOString(),
      description: 'Synthetic public occurrence owned by account B.',
    },
    {
      id: occurrenceIds.suspendedPrivate, reporter_id: suspendedOwner.id,
      type: 'lost', visibility: 'private', city: 'Cuiaba', region: 'Suspensa',
      last_seen_at: new Date().toISOString(),
      description: 'Synthetic private occurrence for a suspended account.',
    },
  ];
  ({ error } = await service.from('occurrences').insert(occurrenceFixtures));
  assert.ifError(error);

  const anonymousView = await anon.from('public_occurrences').select('*')
    .eq('id', occurrenceIds.aPublic).single();
  assert.ifError(anonymousView.error);
  const publicKeys = Object.keys(anonymousView.data).sort();
  check(!publicKeys.includes('reporter_id') && !publicKeys.includes('pet_id'),
    'anonymous public projection excludes private IDs from response JSON');
  check(publicKeys.includes('description') && publicKeys.includes('region'),
    'anonymous public projection retains necessary public fields');
  const anonymousStore = createRemoteStore(anon);
  const anonymousFeed = await anonymousStore.listPublicOccurrences({ limit: 20 });
  check(anonymousFeed.some((row) => row.id === occurrenceIds.aPublic),
    'frontend public-feed service reads the anonymous safe view');
  check(anonymousFeed.every((row) => !('reporter_id' in row) && !('pet_id' in row)),
    'frontend public-feed response contains no private occurrence identifiers');
  const anonymousDetail = await anonymousStore.getOccurrence(occurrenceIds.aPublic);
  check(anonymousDetail?.is_owner === false && !('reporter_id' in anonymousDetail)
    && !('pet_id' in anonymousDetail),
  'frontend anonymous detail uses the public projection and safe ownership indicator');

  const anonReporter = await anon.from('occurrences').select('reporter_id')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(anonReporter, 'anon cannot project reporter_id through the Data API');
  const anonWildcard = await anon.from('occurrences').select('*')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(anonWildcard, 'anon cannot use wildcard selection to recover private columns');
  const anonPet = await anon.from('occurrences').select('pet_id')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(anonPet, 'anon cannot project pet_id through the Data API');
  const anonFilter = await anon.from('occurrences').select('id')
    .eq('reporter_id', ownerA.id);
  expectDenied(anonFilter, 'anon cannot filter on reporter_id through the Data API');
  const anonEmbed = await anon.from('occurrences').select('id,pets(name)')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(anonEmbed, 'embedded pet relation cannot bypass occurrence column privileges');
  const anonViewFilter = await anon.from('public_occurrences').select('id')
    .eq('pet_id', petId);
  expectDenied(anonViewFilter, 'public projection cannot filter on pet_id');
  const anonOwnership = await anon.rpc('occurrence_is_owner', {
    p_occurrence: occurrenceIds.aPublic,
  });
  assert.ifError(anonOwnership.error);
  check(anonOwnership.data === false, 'anonymous ownership indicator is false');
  const anonAdmin = await anon.rpc('admin_list_occurrences', { p_page: 1, p_page_size: 10 });
  expectDenied(anonAdmin, 'anonymous caller cannot use administrative occurrence RPC');

  const b = await signIn(ownerB, 'user B');
  const bStore = createRemoteStore(b);
  const bFeed = await bStore.listPublicOccurrences({ limit: 20 });
  check(bFeed.some((row) => row.id === occurrenceIds.aPublic),
    'frontend authenticated feed retains other users public alerts');
  check(bFeed.every((row) => !('reporter_id' in row) && !('pet_id' in row)),
    'frontend authenticated feed contains no private occurrence identifiers');
  const bDetail = await bStore.getOccurrence(occurrenceIds.aPublic);
  check(bDetail?.is_owner === false && !('reporter_id' in bDetail) && !('pet_id' in bDetail),
    'frontend third-party detail exposes only public fields and is_owner false');
  check(await bStore.getOccurrence(occurrenceIds.aPrivate) === null,
    'frontend service cannot read a third-party private occurrence');
  const bOwnList = await bStore.listOwnOccurrences();
  check(bOwnList.length === 1 && bOwnList[0].id === occurrenceIds.bPublic
    && !('reporter_id' in bOwnList[0]),
  'frontend owner list contains only the current users rows through its RPC');
  const bPublic = await b.from('public_occurrences').select('*')
    .eq('id', occurrenceIds.aPublic).single();
  assert.ifError(bPublic.error);
  check(!('reporter_id' in bPublic.data) && !('pet_id' in bPublic.data),
    'user B public response JSON excludes private IDs');
  const bReporter = await b.from('occurrences').select('reporter_id')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(bReporter, 'user B cannot project A reporter_id');
  const bWildcard = await b.from('occurrences').select('*')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(bWildcard, 'user B cannot use wildcard selection to recover private columns');
  const bPet = await b.from('occurrences').select('pet_id')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(bPet, 'user B cannot project A pet_id');
  const bPetFilter = await b.from('occurrences').select('id').eq('pet_id', petId);
  expectDenied(bPetFilter, 'user B cannot filter on pet_id');
  const bEmbed = await b.from('occurrences').select('id,pets(name)')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(bEmbed, 'user B cannot embed the linked pet through a public occurrence');
  const bFilter = await b.from('occurrences').select('id')
    .eq('reporter_id', ownerA.id);
  expectDenied(bFilter, 'user B cannot filter on reporter_id');
  const bOwnerList = await b.rpc('my_occurrences');
  assert.ifError(bOwnerList.error);
  expectSafeRows(bOwnerList.data, 'user B own-occurrences RPC');
  check(bOwnerList.data.length === 1 && bOwnerList.data[0].id === occurrenceIds.bPublic,
    'user B owner list contains only B rows');
  const bPrivateA = await b.rpc('my_occurrence', { p_occurrence: occurrenceIds.aPrivate });
  assert.ifError(bPrivateA.error);
  check(Array.isArray(bPrivateA.data) && bPrivateA.data.length === 0,
    'user B owner detail does not return A private occurrence');
  const bOwnership = await b.rpc('occurrence_is_owner', { p_occurrence: occurrenceIds.aPublic });
  assert.ifError(bOwnership.error);
  check(bOwnership.data === false, 'user B ownership indicator for A is false');
  const bAdmin = await b.rpc('admin_list_occurrences', { p_page: 1, p_page_size: 10 });
  expectDenied(bAdmin, 'ordinary user cannot call administrative occurrence RPC');

  const participation = await b.from('occurrence_participants').insert({
    occurrence_id: occurrenceIds.aPublic,
    user_id: ownerB.id,
  }).select('occurrence_id,user_id,status').single();
  assert.ifError(participation.error);
  check(participation.data.occurrence_id === occurrenceIds.aPublic,
    'user B can request participation on an active public occurrence');

  const spoof = await b.from('occurrences').insert({
    reporter_id: ownerA.id, type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: new Date().toISOString(),
    description: 'Synthetic attempt to spoof another account ownership.',
  }).select('id');
  expectDenied(spoof, 'user B cannot insert an occurrence owned by A');

  const ownInsert = await b.from('occurrences').insert({
    reporter_id: ownerB.id, type: 'lost', city: 'Cuiaba',
    region: 'Centro', last_seen_at: new Date().toISOString(),
    description: 'Synthetic own occurrence with a minimal returning projection.',
  }).select('id').single();
  assert.ifError(ownInsert.error);
  check(Boolean(ownInsert.data.id), 'owner insert with safe RETURNING id still works');

  const wildcardInsert = await b.from('occurrences').insert({
    reporter_id: ownerB.id, type: 'lost', city: 'Cuiaba',
    region: 'Centro', last_seen_at: new Date().toISOString(),
    description: 'Synthetic insert wildcard projection must be rejected.',
  }).select('*');
  expectDenied(wildcardInsert, 'RETURNING wildcard cannot bypass column SELECT grants');

  const crossUpdate = await b.from('occurrences')
    .update({ description: 'Unauthorized cross-account update.' })
    .eq('id', occurrenceIds.aPrivate).select('id');
  assert.ifError(crossUpdate.error);
  check(Array.isArray(crossUpdate.data) && crossUpdate.data.length === 0,
    'user B update of A private occurrence returns no rows');
  const crossDelete = await b.from('occurrences').delete()
    .eq('id', occurrenceIds.aPrivate).select('id');
  assert.ifError(crossDelete.error);
  check(Array.isArray(crossDelete.data) && crossDelete.data.length === 0,
    'user B delete of A private occurrence returns no rows');

  const report = await b.rpc('report_occurrence', {
    p_occurrence: occurrenceIds.aPublic,
    p_category: 'other',
    p_description: 'Synthetic report submitted by user B about account A public occurrence.',
  });
  assert.ifError(report.error);
  const reportRow = report.data[0];
  check(Boolean(reportRow?.report_id), 'authorized user can submit a report for a public third-party alert');
  check(!('reporter_id' in reportRow) && !('pet_id' in reportRow),
    'report submission response omits private occurrence IDs');

  const privateSighting = await b.from('sightings').insert({
    occurrence_id: occurrenceIds.aPrivate,
    reporter_id: ownerB.id,
    observed_at: new Date().toISOString(),
    area_description: 'Synthetic unauthorized area',
    description: 'Synthetic attempt to report a sighting on a private occurrence.',
  }).select('id');
  expectDenied(privateSighting,
    'user B cannot register a sighting on A private occurrence without authorization');

  const sighting = await b.from('sightings').insert({
    occurrence_id: occurrenceIds.aPublic,
    reporter_id: ownerB.id,
    observed_at: new Date().toISOString(),
    area_description: 'Synthetic nearby area',
    description: 'Synthetic sighting submitted by user B for public occurrence A.',
  }).select('id').single();
  assert.ifError(sighting.error);
  check(Boolean(sighting.data.id),
    'user B can register an authorized sighting through the Data API');

  const a = await signIn(ownerA, 'user A');
  const aStore = createRemoteStore(a);
  const aPublicDetail = await aStore.getOccurrence(occurrenceIds.aPublic);
  check(aPublicDetail?.is_owner === true && aPublicDetail.pet_id === petId
    && !('reporter_id' in aPublicDetail),
  'frontend owner detail enriches a public projection only through the owner RPC');
  const aPrivateDetail = await aStore.getOccurrence(occurrenceIds.aPrivate);
  check(aPrivateDetail?.is_owner === true && aPrivateDetail.pet_id === petId
    && !('reporter_id' in aPrivateDetail),
  'frontend owner detail uses the private owner contract without returning reporter_id');
  const serviceCreated = await bStore.createOccurrence({
    type: 'lost', city: 'Cuiaba', region: 'Frontend service',
    last_seen_at: new Date().toISOString(),
    description: 'Synthetic occurrence created through the frontend service contract.',
  });
  check(serviceCreated.is_owner === true && Boolean(serviceCreated.id)
    && !('reporter_id' in serviceCreated),
  'frontend service creates an occurrence with id-only RETURNING and owner RPC readback');
  const serviceUpdated = await bStore.updateOccurrence(serviceCreated.id, {
    description: 'Synthetic occurrence updated through the frontend service contract.',
  });
  check(serviceUpdated.is_owner === true && serviceUpdated.description.includes('updated')
    && !('reporter_id' in serviceUpdated),
  'frontend service updates an owned occurrence with a narrow RETURNING projection');
  await bStore.setOccurrenceStatus(serviceCreated.id, 'closed');
  const serviceClosed = await bStore.getOccurrence(serviceCreated.id);
  check(serviceClosed?.status === 'closed' && serviceClosed.is_owner === true,
    'frontend status RPC and owner detail remain functional after the read-contract migration');
  await assert.rejects(bStore.updateOccurrence(occurrenceIds.aPrivate, {
    description: 'Unauthorized frontend update must not be applied.',
  }));
  check(true, 'frontend service cannot update a third-party private occurrence');
  const serviceDeleted = await b.from('occurrences').delete()
    .eq('id', serviceCreated.id).select('id').single();
  assert.ifError(serviceDeleted.error);
  check(serviceDeleted.data.id === serviceCreated.id,
    'owner can still delete an occurrence with a minimal returning projection');
  const aReporterDirect = await a.from('occurrences').select('reporter_id')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(aReporterDirect, 'even the owner cannot read reporter_id through the base Data API');
  const aPetDirect = await a.from('occurrences').select('pet_id')
    .eq('id', occurrenceIds.aPublic);
  expectDenied(aPetDirect, 'owner receives pet_id only through the authorized owner RPC');
  const aList = await a.rpc('my_occurrences');
  assert.ifError(aList.error);
  expectSafeRows(aList.data, 'user A own-occurrences RPC');
  check(aList.data.length === 2, 'user A lists only their own public and private occurrences');
  const aDetail = await a.rpc('my_occurrence', { p_occurrence: occurrenceIds.aPrivate });
  assert.ifError(aDetail.error);
  check(aDetail.data.length === 1 && aDetail.data[0].pet_id === petId,
    'user A can manage their own linked pet occurrence');
  check(!('reporter_id' in aDetail.data[0]), 'owner RPC never returns reporter_id');
  const aOwnership = await a.rpc('occurrence_is_owner', { p_occurrence: occurrenceIds.aPublic });
  assert.ifError(aOwnership.error);
  check(aOwnership.data === true, 'owner A ownership indicator is true for A occurrence');
  const aUpdate = await a.from('occurrences')
    .update({ description: 'Owner A updated own occurrence through REST.' })
    .eq('id', occurrenceIds.aPrivate).select('id').single();
  assert.ifError(aUpdate.error);
  check(aUpdate.data.id === occurrenceIds.aPrivate,
    'owner update remains available with a safe RETURNING projection');
  const ownerParticipants = await a.from('occurrence_participants').select('user_id')
    .eq('occurrence_id', occurrenceIds.aPublic);
  assert.ifError(ownerParticipants.error);
  check(ownerParticipants.data.some((participant) => participant.user_id === ownerB.id),
    'occurrence owner retains access to participant requests');
  const ownerSightings = await a.from('sightings').select('id')
    .eq('id', sighting.data.id);
  assert.ifError(ownerSightings.error);
  check(ownerSightings.data.length === 1,
    'occurrence owner retains authorized access to a submitted sighting');

  const moderatorClient = await signIn(moderator, 'active moderator');
  const adminList = await moderatorClient.rpc('admin_list_occurrences', {
    p_page: 1, p_page_size: 50,
  });
  assert.ifError(adminList.error);
  expectSafeRows(adminList.data, 'authorized administrative occurrence list');
  check(adminList.data.some((row) => row.occurrence_id === occurrenceIds.aPublic),
    'active moderator can use the authorized occurrence list');
  const adminDetail = await moderatorClient.rpc('admin_get_occurrence', {
    p_occurrence: occurrenceIds.aPublic,
  });
  assert.ifError(adminDetail.error);
  check(adminDetail.data.length === 1 && !('reporter_id' in adminDetail.data[0])
    && !('pet_id' in adminDetail.data[0]),
  'moderation detail omits reporter_id and pet_id');
  const reportList = await moderatorClient.rpc('admin_list_occurrence_reports');
  assert.ifError(reportList.error);
  expectSafeRows(reportList.data, 'authorized administrative report list');
  check(reportList.data.some((row) => row.report_id === reportRow.report_id),
    'active moderator can list the submitted report');
  const reportDetail = await moderatorClient.rpc('admin_get_occurrence_report', {
    p_report: reportRow.report_id,
  });
  assert.ifError(reportDetail.error);
  check(reportDetail.data.length === 1
    && !('reporter_id' in reportDetail.data[0])
    && !('pet_id' in reportDetail.data[0])
    && !('owner_id' in reportDetail.data[0]),
  'moderation report detail omits submitter and owner IDs');

  const suspended = await signIn(suspendedOwner, 'suspended owner');
  const suspendedOwnerList = await suspended.rpc('my_occurrences');
  expectDenied(suspendedOwnerList, 'suspended owner cannot use owner read RPC');
  const suspendedOwnerBit = await suspended.rpc('occurrence_is_owner', {
    p_occurrence: occurrenceIds.suspendedPrivate,
  });
  assert.ifError(suspendedOwnerBit.error);
  check(suspendedOwnerBit.data === false, 'suspended account never receives is_owner true');

  const suspendedStaff = await signIn(suspendedModerator, 'suspended moderator');
  const suspendedAdmin = await suspendedStaff.rpc('admin_list_occurrences', {
    p_page: 1, p_page_size: 10,
  });
  expectDenied(suspendedAdmin, 'suspended moderator cannot use admin occurrence RPC');
  const suspendedReports = await suspendedStaff.rpc('admin_list_occurrence_reports');
  expectDenied(suspendedReports, 'suspended moderator cannot use admin report RPC');

  console.log(`Local REST/RPC occurrence contracts: ${checks} assertions passed.`);
}

try {
  removeSyntheticData();
  await run();
} finally {
  removeSyntheticData();
}
