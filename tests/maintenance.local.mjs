// Runs only against the disposable R4.4 Supabase stack named below.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const project = process.env.R44_PROJECT;
const localPorts = {
  'buscapet-r44-homologation-20261107': 55721,
  'buscapet-r44-homologation-v2': 55821,
  'buscapet-r44-homologation-v3': 56021,
  'buscapet-r45-homologation': 56221,
};
assert.ok(Object.hasOwn(localPorts, project), 'R44_PROJECT must name an approved disposable stack');
const container = `supabase_db_${project}`;
const root = process.env.R44_WORKDIR;
assert.ok(root?.endsWith(project), 'R44_WORKDIR must name the disposable stack');

const output = execFileSync('cmd.exe', ['/d', '/s', '/c',
  `npx.cmd supabase status --workdir ${root} --output json`],
{ encoding: 'utf8', windowsHide: true });
const status = JSON.parse(output.slice(output.indexOf('{')));
assert.equal(status.API_URL, `http://127.0.0.1:${localPorts[project]}`);
assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY);

const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(status.API_URL, status.ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const password = `Local-${randomUUID()}-Aa1!`;
const users = [];
let checks = 0;
let existingPath;
let privilegedPath;
let copiedPath;
let movedPath;
let blockedSignupId;
let occurrenceId;
let petId;
let initialGeneration;
let initialAudits;
let initialGuestNonces;
let initialGuestLimits;

function check(value, message) {
  assert.ok(value, message);
  checks += 1;
}

function sql(query) {
  return execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres',
    '-d', 'postgres', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', query],
  { encoding: 'utf8', windowsHide: true }).trim();
}

async function beginLongWrite(id) {
  const writer = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres',
    '-d', 'postgres', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
  { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';
  const ready = new Promise((resolve, reject) => {
    writer.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes('R44_WRITER_READY')) resolve();
    });
    writer.on('error', reject);
    writer.on('exit', (code) => {
      if (!stdout.includes('R44_WRITER_READY')) reject(Error(`writer exited before gate: ${code}`));
    });
  });
  writer.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const finished = new Promise((resolve, reject) => {
    writer.on('error', reject);
    writer.on('exit', (code) => code === 0 ? resolve() : reject(Error(
      `writer transaction failed: ${code}; ${stderr.slice(0, 300)}`)));
  });
  writer.stdin.end(`begin;\nupdate public.pets set name=name where id='${id}';\n`
    + `\\echo R44_WRITER_READY\nselect pg_catalog.pg_sleep(2);\ncommit;\n`);
  await ready;
  return { finished };
}

async function account(label) {
  const email = `r44-${label}-${randomUUID()}@example.test`;
  const created = await service.auth.admin.createUser({ email, password,
    email_confirm: true, user_metadata: { full_name: `R44 ${label}` } });
  assert.ifError(created.error);
  const user = { id: created.data.user.id, email };
  users.push(user);
  const client = createClient(status.API_URL, status.ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  return { ...user, client, token: signed.data.session.access_token };
}

function denied(result, label, code = 'PT503') {
  check(Boolean(result.error), `${label}: error returned`);
  check(result.error.code === code,
    `${label}: expected code ${code}, received ${result.error.code}`);
  check(result.data == null || (Array.isArray(result.data) && !result.data.length),
    `${label}: no private payload`);
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=',
  'base64');
const sha = (data) => createHash('sha256').update(data).digest('hex');

try {
  check(sql('select active from buscapet_private.maintenance_state') === 'f',
    'isolated gate starts open');
  initialGeneration = Number(sql('select generation from buscapet_private.maintenance_state'));
  initialAudits = Number(sql('select count(*) from buscapet_private.maintenance_transitions'));
  initialGuestNonces = Number(sql('select count(*) from buscapet_private.guest_sighting_nonces'));
  initialGuestLimits = Number(sql('select count(*) from buscapet_private.guest_sighting_limits'));
  const [owner, other, collaborator, moderator, administrator] = await Promise.all([
    account('owner'), account('other'), account('collaborator'),
    account('moderator'), account('administrator'),
  ]);
  let result = await service.from('user_roles').insert([
    { user_id: collaborator.id, role: 'colaborador' },
    { user_id: moderator.id, role: 'moderador' },
    { user_id: administrator.id, role: 'administrador' },
  ]);
  assert.ifError(result.error);

  petId = randomUUID();
  occurrenceId = randomUUID();
  result = await service.from('pets').insert({ id: petId, owner_id: owner.id,
    name: 'Luna', species: 'dog' });
  assert.ifError(result.error);
  result = await service.from('occurrences').insert({ id: occurrenceId,
    pet_id: petId, reporter_id: owner.id, type: 'lost', city: 'Cuiaba',
    region: 'Centro', last_seen_at: new Date().toISOString(),
    description: 'Animal perdido no centro' });
  assert.ifError(result.error);

  existingPath = `${owner.id}/${randomUUID()}.png`;
  result = await owner.client.storage.from('pet-media').upload(existingPath, png,
    { contentType: 'image/png', upsert: false });
  assert.ifError(result.error);
  const prior = await owner.client.storage.from('pet-media').download(existingPath);
  assert.ifError(prior.error);
  const priorHash = sha(Buffer.from(await prior.data.arrayBuffer()));
  check(priorHash === sha(png), 'authorized photo downloaded before maintenance');

  const { finished: pendingWriter } = await beginLongWrite(petId);
  const activationStarted = Date.now();
  check(sql(`select buscapet_private.set_maintenance(true,'R4.4 REST and Storage verification',${initialGeneration})`) === String(initialGeneration + 1),
    'operator activates gate in committed transaction');
  check(Date.now() - activationStarted >= 1000,
    'activation waited for a prior in-flight database write');
  await pendingWriter;

  const oldClient = await owner.client.from('occurrences').insert({
    reporter_id: owner.id, type: 'lost', city: 'Cuiaba', region: 'Centro',
    last_seen_at: new Date().toISOString(), description: 'Old JavaScript attempt',
  }).select();
  denied(oldClient, 'old JavaScript insert with broad return', '42501');
  denied(await owner.client.from('occurrences').update({ city: 'Varzea Grande' })
    .eq('id', occurrenceId).select('id'), 'owner occurrence update');
  denied(await owner.client.from('pets').insert({ owner_id: owner.id,
    name: 'Novo', species: 'dog' }).select(), 'owner pet insert');
  denied(await collaborator.client.from('occurrence_participants').insert({
    occurrence_id: occurrenceId, user_id: collaborator.id,
  }).select(), 'collaborator participation');
  denied(await other.client.from('sightings').insert({ occurrence_id: occurrenceId,
    reporter_id: other.id, observed_at: new Date().toISOString(),
    area_description: 'Centro', description: 'Vi o animal no centro',
  }).select(), 'other tutor sighting');
  denied(await moderator.client.rpc('admin_moderate_occurrence', {
    p_occurrence: occurrenceId, p_action: 'hide',
    p_reason: 'Teste de bloqueio de moderacao',
  }), 'moderator RPC');
  denied(await administrator.client.rpc('admin_change_account_status', {
    p_user: other.id, p_status: 'suspended',
    p_reason: 'Teste de bloqueio de administracao',
  }), 'administrator RPC');
  denied(await service.rpc('ingest_guest_sighting', {
    p_source_hash: 'a'.repeat(64), p_nonce: randomUUID(),
    p_occurrence: occurrenceId, p_observed_at: new Date().toISOString(),
    p_area: 'Centro', p_description: 'Avistamento de convidado',
  }), 'service role guest RPC');

  const localEnv = readFileSync(join(root, 'supabase', 'functions', '.env'), 'utf8');
  const localSecret = /^INGRESS_HMAC_KEY=(.+)$/m.exec(localEnv)?.[1]?.trim();
  check(Boolean(localSecret && localSecret.length >= 32),
    'isolated Edge has a local test-only ingress secret');
  async function edgeStatus() {
    const stamp = String(Math.floor(Date.now() / 1000));
    const id = randomUUID();
    const signature = createHmac('sha256', localSecret)
      .update(`GET\n/report-guest-sighting/status\n${stamp}\n${id}`).digest('hex');
    return fetch(`${status.API_URL}/functions/v1/report-guest-sighting/status`, {
      method: 'GET', headers: { apikey: status.ANON_KEY,
        'x-buscapet-timestamp': stamp, 'x-buscapet-nonce': id,
        'x-buscapet-signature': signature },
    });
  }
  const invalidStatus = await fetch(
    `${status.API_URL}/functions/v1/report-guest-sighting/status`,
    { headers: { apikey: status.ANON_KEY } });
  check(invalidStatus.status === 401, 'unsigned Edge preflight is unauthorized');
  const closedStatus = await edgeStatus();
  check(closedStatus.status === 503
    && (await closedStatus.json()).error === 'maintenance_active',
  'signed Edge preflight sees closed database gate');
  const guestPayload = JSON.stringify({ occurrenceId, observedAt: new Date().toISOString(),
    area: 'Centro', description: 'Avistamento local durante manutencao' });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const sourceHash = sha(Buffer.from(randomUUID()));
  const bodyHash = sha(Buffer.from(guestPayload));
  const canonical = `POST\n/report-guest-sighting\n${timestamp}\n${nonce}\n${sourceHash}\n${bodyHash}`;
  const signature = createHmac('sha256', localSecret).update(canonical).digest('hex');
  const edge = await fetch(`${status.API_URL}/functions/v1/report-guest-sighting`, {
    method: 'POST', headers: { apikey: status.ANON_KEY,
      'content-type': 'application/json', 'x-buscapet-timestamp': timestamp,
      'x-buscapet-nonce': nonce, 'x-buscapet-source': sourceHash,
      'x-buscapet-signature': signature }, body: guestPayload });
  check(edge.status === 503 && (await edge.json()).error === 'maintenance_active',
    'signed Edge ingress returns standardized maintenance error');

  const direct = await fetch(`${status.API_URL}/rest/v1/pets`, { method: 'POST',
    headers: { apikey: status.ANON_KEY, authorization: `Bearer ${owner.token}`,
      'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ owner_id: owner.id, name: 'REST', species: 'dog' }) });
  check(direct.status === 503 && (await direct.json()).code === 'PT503',
    'direct REST write receives maintenance HTTP 503');
  const publicAttempt = await anon.from('pets').insert({ owner_id: owner.id,
    name: 'Anon', species: 'dog' });
  check(Boolean(publicAttempt.error), 'anonymous write remains denied');
  const blockedSignup = await service.auth.admin.createUser({
    email: `r44-blocked-${randomUUID()}@example.test`, password,
    email_confirm: true,
  });
  blockedSignupId = blockedSignup.data?.user?.id;
  check(Boolean(blockedSignup.error),
    'new Auth user cannot commit while profile trigger is gated');
  const refreshed = await owner.client.auth.refreshSession();
  check(!refreshed.error && Boolean(refreshed.data.session),
    'existing Auth session still refreshes: Auth state must be reconciled');
  const freshLogin = createClient(status.API_URL, status.ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const loggedIn = await freshLogin.auth.signInWithPassword({ email: owner.email, password });
  check(!loggedIn.error && Boolean(loggedIn.data.session),
    'existing Auth user can log in while application gate is closed');
  const recovery = await anon.auth.resetPasswordForEmail(owner.email);
  check(!recovery.error,
    'password recovery request still changes managed Auth state while gate is closed');
  const otherPet = await other.client.from('pets').select('id').eq('id', petId);
  check(!otherPet.error && otherPet.data.length === 0,
    'cross-user pet read remains private');
  const publicRead = await anon.from('public_occurrences').select('id').eq('id', occurrenceId);
  check(!publicRead.error && publicRead.data.length === 1,
    'public projection remains readable');

  const deniedPath = `${owner.id}/${randomUUID()}.png`;
  const upload = await owner.client.storage.from('pet-media').upload(deniedPath, png,
    { contentType: 'image/png', upsert: false });
  check(Boolean(upload.error), 'signed-in Storage upload is denied');
  const upsert = await owner.client.storage.from('pet-media').upload(existingPath, png,
    { contentType: 'image/png', upsert: true });
  check(Boolean(upsert.error), 'signed-in Storage upsert is denied');
  const removal = await owner.client.storage.from('pet-media').remove([existingPath]);
  check(Boolean(removal.error) || !removal.data?.length,
    'signed-in Storage delete is rejected or affects no object');
  const deniedCopyPath = `${owner.id}/${randomUUID()}.png`;
  const deniedCopy = await owner.client.storage.from('pet-media')
    .copy(existingPath, deniedCopyPath);
  check(Boolean(deniedCopy.error), 'signed-in Storage copy is denied');
  const deniedMove = await owner.client.storage.from('pet-media')
    .move(existingPath, deniedCopyPath);
  check(Boolean(deniedMove.error), 'signed-in Storage move is denied');
  const after = await owner.client.storage.from('pet-media').download(existingPath);
  assert.ifError(after.error);
  check(sha(Buffer.from(await after.data.arrayBuffer())) === priorHash,
    'existing authorized photo remains byte-identical');
  const missing = await service.storage.from('pet-media').download(deniedPath);
  check(Boolean(missing.error), 'rejected upload has no retrievable object');
  const missingCopy = await service.storage.from('pet-media').download(deniedCopyPath);
  check(Boolean(missingCopy.error), 'rejected copy and move have no retrievable object');
  const physicallyPresent = execFileSync('docker', ['exec',
    `supabase_storage_${project}`, 'sh', '-c',
    `find /mnt -type f -name '${deniedPath.split('/')[1]}' -print`],
  { encoding: 'utf8', windowsHide: true }).trim();
  check(physicallyPresent === '', 'rejected upload left no physical local file');

  privilegedPath = `${owner.id}/${randomUUID()}.png`;
  const privilegedUpload = await service.storage.from('pet-media').upload(
    privilegedPath, png, { contentType: 'image/png', upsert: false });
  check(!privilegedUpload.error,
    'service role Storage upload bypasses RLS: external ingress remains a release risk');
  copiedPath = `${owner.id}/${randomUUID()}.png`;
  const copied = await service.storage.from('pet-media').copy(existingPath, copiedPath);
  check(!copied.error, 'service role Storage copy bypasses application gate');
  movedPath = `${owner.id}/${randomUUID()}.png`;
  const moved = await service.storage.from('pet-media').move(copiedPath, movedPath);
  check(!moved.error, 'service role Storage move bypasses application gate');
  copiedPath = undefined;
  const replacement = Buffer.concat([png, Buffer.from('r45')]);
  const replaced = await service.storage.from('pet-media').upload(movedPath, replacement,
    { contentType: 'image/png', upsert: true });
  check(!replaced.error, 'service role Storage upsert bypasses application gate');
  const replacedRead = await service.storage.from('pet-media').download(movedPath);
  check(!replacedRead.error
    && sha(Buffer.from(await replacedRead.data.arrayBuffer())) === sha(replacement),
  'privileged replacement bytes are visible during closed gate');
  const movedRemoval = await service.storage.from('pet-media').remove([movedPath]);
  check(!movedRemoval.error && movedRemoval.data?.length === 1,
    'service role Storage delete bypasses application gate');
  movedPath = undefined;
  const privilegedRemoval = await service.storage.from('pet-media').remove([privilegedPath]);
  check(!privilegedRemoval.error && privilegedRemoval.data?.length === 1,
    'test-only privileged object is removed and must be reconciled in release');
  privilegedPath = undefined;

  check(sql(`select count(*) from public.occurrences where id='${occurrenceId}'`) === '1',
    'no extra occurrence was committed');
  check(sql('select count(*) from buscapet_private.guest_sighting_nonces') === String(initialGuestNonces),
    'guest nonce was not partially committed');
  check(sql('select count(*) from buscapet_private.guest_sighting_limits') === String(initialGuestLimits),
    'guest rate state was not partially committed');
  check(sql('select count(*) from buscapet_private.maintenance_transitions') === String(initialAudits + 1),
    'activation audit was committed');

  check(sql(`select buscapet_private.set_maintenance(false,'R4.4 REST and Storage release verification',${initialGeneration + 1})`) === String(initialGeneration + 2),
    'operator reopens gate with expected generation');
  result = await owner.client.from('pets').insert({ owner_id: owner.id,
    name: 'Retorno', species: 'dog' }).select('id').single();
  assert.ifError(result.error);
  check(Boolean(result.data.id), 'normal owner write resumes after reopening');
  result = await owner.client.from('pets').delete().eq('id', result.data.id);
  assert.ifError(result.error);
  check(sql('select count(*) from buscapet_private.maintenance_transitions') === String(initialAudits + 2),
    'deactivation audit was committed');
  const reopenedStatus = await edgeStatus();
  check(reopenedStatus.status === 204, 'signed Edge preflight sees reopened gate');
  console.log(`R4.4 isolated REST, roles, Storage and recovery: ${checks} checks passed`);
} finally {
  if (sql('select active from buscapet_private.maintenance_state') === 't') {
    const generation = sql('select generation from buscapet_private.maintenance_state');
    sql(`select buscapet_private.set_maintenance(false,'R4.4 test cleanup after failure',${generation})`);
  }
  if (existingPath) await service.storage.from('pet-media').remove([existingPath]);
  if (privilegedPath) await service.storage.from('pet-media').remove([privilegedPath]);
  if (copiedPath) await service.storage.from('pet-media').remove([copiedPath]);
  if (movedPath) await service.storage.from('pet-media').remove([movedPath]);
  if (occurrenceId) await service.from('occurrences').delete().eq('id', occurrenceId);
  if (petId) await service.from('pets').delete().eq('id', petId);
  for (const user of users.reverse()) await service.auth.admin.deleteUser(user.id);
  if (blockedSignupId) await service.auth.admin.deleteUser(blockedSignupId);
}
