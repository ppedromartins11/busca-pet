/* Teste REMOTO com escritas sintéticas. Nunca é incluído em `npm test`.
 * Só executa com gate explícito, chave service_role no processo Node e projeto fixo.
 * A chave administrativa nunca chega ao navegador; o manifesto não contém senhas.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const PROJECT = "jpnvizdhyrvliqgvyxzx";
const URL = `https://${PROJECT}.supabase.co`;
const gate = process.env.RUN_BUSCAPET_REMOTE_MVP_TEST;
const serviceKey = process.env.BUSCAPET_TEST_SERVICE_ROLE_KEY;
const publicKey = process.env.BUSCAPET_TEST_PUBLISHABLE_KEY;
const browserBase = process.env.BUSCAPET_TEST_BROWSER_URL;
if (gate !== "I_ACCEPT_SYNTHETIC_WRITES" ||
    process.env.BUSCAPET_TEST_PROJECT_REF !== PROJECT ||
    !serviceKey || !publicKey ||
    !/^(?:eyJ|sb_secret_)/.test(serviceKey) ||
    !/^(?:eyJ|sb_publishable_)/.test(publicKey)) {
  throw Error("Gate/credenciais ausentes. Exige projeto fixo, publishable key e service_role somente no processo local.");
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(URL, serviceKey, noSession);
const anon = createClient(URL, publicKey, noSession);
const makeClient = () => createClient(URL, publicKey, noSession);
const fixtureClients = new Map();
const runId = randomUUID();
const marker = `BUSCAPET-QA-${runId}`;
const manifestPath = path.join(process.cwd(), ".tmp", `remote-mvp-${runId}.json`);
const manifest = {
  project: PROJECT, runId, marker, startedAt: new Date().toISOString(),
  emails: [], users: [], paths: [], pets: [], occurrences: [], sightings: [], photos: [],
  checks: [], limitations: [], cleanup: { state: "pending", errors: [] },
};
mkdirSync(path.dirname(manifestPath), { recursive: true });
function save() { writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); }
function remember(kind, value) { if (value && !manifest[kind].includes(value)) { manifest[kind].push(value); save(); } }
save();

function unwrap(result, operation) {
  if (result.error) throw Error(`${operation}: ${result.error.code || result.error.status || "erro"} ${result.error.message}`);
  return result.data;
}
function forbidden(result, operation) {
  assert(result.error || !result.data || (Array.isArray(result.data) && !result.data.length),
    `${operation}: operação não autorizada foi aceita`);
}
async function check(name, fn) {
  await fn();
  manifest.checks.push(name);
  save();
  console.log(`OK ${name}`);
}
async function syntheticUser(suffix) {
  const email = `buscapet-qa-${runId}-${suffix}@example.test`;
  const password = `BpQa-${randomUUID()}!`;
  remember("emails", email); // antes de qualquer possível criação
  const created = unwrap(await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `${marker} ${suffix}` },
  }), `criar usuário ${suffix}`);
  assert(created.user?.id);
  remember("users", created.user.id);
  const client = makeClient();
  const session = unwrap(await client.auth.signInWithPassword({ email, password }), `login ${suffix}`);
  assert.equal(session.user.id, created.user.id);
  fixtureClients.set(created.user.id, client);
  return { id: created.user.id, email, password, client };
}
async function publicSignup() {
  // Domínios reservados (.test e example.com) são rejeitados pelo Auth hospedado.
  // Endereço aleatório e temporário, sem caixa postal; o callback por e-mail não é testado.
  const email = `buscapetqa${runId.replaceAll("-", "").slice(0, 16)}@gmail.com`;
  const password = `BpQa-${randomUUID()}!`;
  remember("emails", email);
  const client = makeClient();
  const result = await client.auth.signUp({
    email, password,
    options: { data: { full_name: `${marker} signup` } },
  });
  if (result.error) {
    const reason = `cadastro público indisponível: ${result.error.code || result.error.status || "erro"}`;
    manifest.limitations.push(reason); save(); console.log(`LIMITE ${reason}`);
    return;
  }
  assert(result.data.user?.id, "cadastro público não retornou usuário");
  const id = result.data.user.id;
  remember("users", id);
  if (!result.data.session) {
    unwrap(await admin.auth.admin.updateUserById(id, { email_confirm: true }), "confirmar conta sintética sem caixa postal");
    manifest.limitations.push("callback de confirmação por e-mail não homologado: conta sintética confirmada por Auth Admin");
    save();
    unwrap(await client.auth.signInWithPassword({ email, password }), "login após cadastro público");
  }
  fixtureClients.set(id, client);
  const profile = unwrap(await client.from("profiles").select("id,full_name,status").eq("id", id).single(), "trigger de perfil no cadastro público");
  assert.equal(profile.id, id);
  assert.equal(profile.full_name, `${marker} signup`);
  assert.equal(profile.status, "active");
  manifest.checks.push("cadastro público e trigger de perfil"); save();
  console.log("OK cadastro público e trigger de perfil");
}
const occurrenceInput = (reporter, pet, visibility) => ({
  reporter_id: reporter.id, pet_id: pet.id, type: "lost", visibility,
  city: "Cuiabá", region: "Centro", public_reference: marker,
  last_seen_at: new Date().toISOString(),
  description: `${marker}: relato sintético de animal desaparecido.`,
});

async function browserFlow(owner, other) {
  if (!browserBase) return;
  assert(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(browserBase), "Browser URL deve ser Vite local.");
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  }) });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const browserErrors = [];
  let debugOccurrenceId = "";
  page.on("pageerror", (error) => browserErrors.push(error.message));
  try {
    await page.goto(`${browserBase}/#login`);
    await page.getByRole("heading", { name: "Entre no BuscaPet" }).waitFor();
    await page.locator('#real-login [name="email"]').fill(owner.email);
    await page.locator('#real-login [name="password"]').fill("senha-incorreta-de-teste");
    await page.locator('#real-login button[type="submit"]').click();
    await page.locator('#real-login .form-error').filter({ hasText: /.+/ }).waitFor();
    assert.match(page.url(), /#login$/);
    await page.locator('#real-login [name="email"]').fill(owner.email);
    await page.locator('#real-login [name="password"]').fill(owner.password);
    await page.locator('#real-login button[type="submit"]').click();
    await page.waitForURL(/#painel-tutor$/);
    await page.getByRole("heading", { name: "Minha área" }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: "Minha área" }).waitFor();
    assert.match(page.url(), /#painel-tutor$/);

    await page.goto(`${browserBase}/#novo-animal`);
    await page.locator('#real-pet-form [name="name"]').fill(`${marker} UI`);
    await page.locator('#real-pet-form [name="species"]').selectOption("dog");
    await page.locator('#real-pet-form button[type="submit"]').click();
    await page.waitForURL(/#animal\/[0-9a-f-]{36}$/);
    const petId = page.url().split("/").at(-1);
    remember("pets", petId);
    assert.equal(unwrap(await owner.client.from("pets").select("owner_id").eq("id", petId).single(), "verificar animal UI").owner_id, owner.id);
    await page.goto(`${browserBase}/#editar-animal/${petId}`);
    await page.locator('#real-pet-form [name="breed"]').fill("Raça sintética");
    await page.locator('#real-pet-form button[type="submit"]').click();
    await page.waitForURL(new RegExp(`#animal/${petId}$`));
    assert.equal(unwrap(await owner.client.from("pets").select("breed").eq("id", petId).single(), "edição de animal UI").breed, "Raça sintética");
    await page.getByRole("button", { name: "Excluir animal" }).click();
    await page.locator("#real-dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    await page.locator("#real-dialog[open]").waitFor({ state: "hidden" });
    assert.equal(unwrap(await owner.client.from("pets").select("id").eq("id", petId), "animal após Escape").length, 1);

    await page.goto(`${browserBase}/#publicar/lost`);
    await page.locator('#real-occurrence-form [name="pet_id"]').selectOption(petId);
    await page.locator('#real-occurrence-form [name="city"]').fill("Cuiabá");
    await page.locator('#real-occurrence-form [name="region"]').fill("Centro");
    await page.locator('#real-occurrence-form [name="description"]').fill(`${marker}: ocorrência sintética criada pela interface.`);
    await page.locator('#real-occurrence-form [name="photo"]').setInputFiles(path.join(process.cwd(), "assets", "hex.png"));
    await page.locator('#real-occurrence-form [name="rights"]').check();
    await page.locator('#real-occurrence-form button[type="submit"]').click();
    await page.waitForURL(/#pet\/[0-9a-f-]{36}$/);
    const occurrenceId = page.url().split("/").at(-1);
    debugOccurrenceId = occurrenceId;
    remember("occurrences", occurrenceId);
    const savedOccurrence = unwrap(await owner.client.from("occurrences").select("reporter_id,pet_id,visibility").eq("id", occurrenceId).single(), "verificar ocorrência UI");
    assert.equal(savedOccurrence.reporter_id, owner.id);
    assert.equal(savedOccurrence.pet_id, petId);
    assert.equal(savedOccurrence.visibility, "public");
    assert.equal(unwrap(await anon.from("occurrences").select("id").eq("id", occurrenceId), "ocorrência UI publicável").length, 1);
    const photos = unwrap(await owner.client.from("occurrence_photos").select("id,storage_path").eq("occurrence_id", occurrenceId), "foto UI");
    assert.equal(photos.length, 1, "upload da foto pela interface");
    for (const photo of photos) { remember("photos", photo.id); remember("paths", photo.storage_path); }
    await page.goto(`${browserBase}/#minha-conta`);
    await page.locator('[data-action="logout"]').click();
    await page.waitForURL(/#login$/);
    await page.waitForFunction(() => window.BPAuth.getSession() === null);
    await page.waitForFunction(async () => (await window.BPSupabase.client.auth.getSession()).data.session === null);

    await page.goto(`${browserBase}/#pet/${occurrenceId}`);
    await page.getByRole("heading", { name: "Animal desaparecido" }).waitFor();
    await page.locator('#real-photo-gallery img[alt="Foto vinculada ao alerta"]').waitFor();
    assert.equal(await page.locator('#real-sightings').innerText(), "");
    await page.goto(`${browserBase}/#login`);
    await page.locator('#real-login [name="email"]').fill(other.email);
    await page.locator('#real-login [name="password"]').fill(other.password);
    await page.locator('#real-login button[type="submit"]').click();
    await page.waitForURL(/#painel-tutor$/);
    await page.goto(`${browserBase}/#avistamento/${occurrenceId}`);
    await page.locator('#real-sighting-form [name="area_description"]').fill("Centro, referência sintética");
    await page.locator('#real-sighting-form [name="description"]').fill(`${marker}: avistamento sintético pela interface.`);
    await page.locator('#real-sighting-form button[type="submit"]').click();
    await page.waitForURL(new RegExp(`#pet/${occurrenceId}$`));
    const sightings = unwrap(await owner.client.from("sightings").select("id").eq("occurrence_id", occurrenceId).eq("reporter_id", other.id), "avistamento UI");
    assert.equal(sightings.length, 1);
    for (const sighting of sightings) remember("sightings", sighting.id);

    await page.goto(`${browserBase}/#minha-conta`);
    await page.locator('[data-action="logout"]').click();
    await page.waitForURL(/#login$/);
    await page.waitForFunction(() => window.BPAuth.getSession() === null);
    await page.waitForFunction(async () => (await window.BPSupabase.client.auth.getSession()).data.session === null);
    assert.deepEqual(browserErrors, []);
    manifest.checks.push("navegador: login inválido, sessão, edição, modal, alerta público, foto, avistamento B, logout");
    save();
    console.log("OK navegador: login inválido, sessão, edição, modal, alerta público, foto, avistamento B, logout");
  } catch (error) {
    const state = { route: new globalThis.URL(page.url()).hash,
      headings: await page.locator("h1").allTextContents().catch(() => []),
      browserErrors };
    if (debugOccurrenceId) {
      state.publicRow = await anon.from("occurrences").select("id,visibility").eq("id", debugOccurrenceId).then(({ data, error }) => ({ data, error: error?.message || null }));
      state.browserRow = await page.evaluate(async (id) => {
        const { data, error } = await window.BPSupabase.client.from("occurrences").select("id,visibility").eq("id", id);
        return { data, error: error?.message || null, authSession: Boolean((await window.BPSupabase.client.auth.getSession()).data.session) };
      }, debugOccurrenceId).catch((e) => ({ error: e.message }));
    }
    console.error(`Navegador: ${JSON.stringify(state)}`);
    throw error;
  } finally { await browser.close(); }
}

async function cleanup() {
  const failures = [];
  const remove = async (label, task) => {
    try { await task(); } catch (error) { failures.push(`${label}: ${error.message}`); }
  };
  // Recupera ID de uma criação cujo retorno se perdeu, sem usar e-mails reais.
  if (manifest.emails.length > manifest.users.length) {
    let exhausted = false;
    for (let page = 1; page <= 10; page++) {
      try {
        const data = unwrap(await admin.auth.admin.listUsers({ page, perPage: 1000 }), "localizar fixture de Auth");
        const users = data?.users || [];
        for (const user of users)
          if (manifest.emails.includes(user.email)) remember("users", user.id);
        if (users.length < 1000) { exhausted = true; break; }
      } catch (error) { failures.push(`localizar fixture de Auth: ${error.message}`); break; }
    }
    if (!exhausted && manifest.emails.length > manifest.users.length)
      failures.push("Busca de Auth incompleta; verificar os e-mails do manifesto.");
  }
  // Remove objetos pela Storage API; SQL direto deixaria objetos órfãos.
  for (const userId of manifest.users) {
    await remove(`Storage ${userId}`, async () => {
      const bucket = admin.storage.from("pet-media");
      for (let pass = 0; pass < 5; pass++) {
        const listed = unwrap(await bucket.list(userId, { limit: 100, offset: 0 }), "listar objetos sintéticos");
        const paths = listed.filter((item) => item.name && item.id).map((item) => `${userId}/${item.name}`);
        if (!paths.length) break;
        for (const objectPath of paths) remember("paths", objectPath);
        unwrap(await bucket.remove(paths), "remover objetos sintéticos");
        if (pass === 4) throw Error("Há mais objetos que o limite de limpeza automática.");
      }
    });
  }
  for (const objectPath of manifest.paths) await remove(`objeto ${objectPath}`, async () => {
    unwrap(await admin.storage.from("pet-media").remove([objectPath]), "remover caminho registrado");
  });
  // A service_role possui Auth Admin e Storage, mas esta migration não concede
  // SELECT/DELETE geral nas tabelas públicas. DML usa cada tutor autenticado.
  for (const [table, key, userField] of [
    ["occurrence_photos", "photos", "uploaded_by"],
    ["occurrences", "occurrences", "reporter_id"],
    ["pets", "pets", "owner_id"],
  ]) {
    for (const [userId, client] of fixtureClients) {
      for (const id of manifest[key]) await remove(`${table} ${id} por ${userId}`, async () => {
        unwrap(await client.from(table).delete().eq("id", id), `remover ${table}`);
      });
      await remove(`${table} por usuário ${userId}`, async () => {
        unwrap(await client.from(table).delete().eq(userField, userId), `remover ${table} do usuário sintético`);
      });
    }
  }
  for (const id of manifest.users) await remove(`Auth ${id}`, async () => {
    unwrap(await admin.auth.admin.deleteUser(id), "remover usuário sintético");
  });
  manifest.cleanup = { state: failures.length ? "incomplete" : "complete", errors: failures, finishedAt: new Date().toISOString() };
  save();
  return failures;
}

let testError = null;
try {
  const a = await syntheticUser("a");
  const b = await syntheticUser("b");
  await check("perfil próprio e isolamento", async () => {
    assert.equal(unwrap(await a.client.from("profiles").select("id,status").eq("id", a.id).single(), "perfil A").status, "active");
    assert.deepEqual(unwrap(await b.client.from("profiles").select("id").eq("id", a.id), "perfil cruzado"), []);
  });

  const petA = unwrap(await a.client.from("pets").insert({ owner_id: a.id, name: `${marker} A`, species: "dog" }).select("id,name").single(), "animal A");
  remember("pets", petA.id);
  const petB = unwrap(await b.client.from("pets").insert({ owner_id: b.id, name: `${marker} B`, species: "cat" }).select("id").single(), "animal B");
  remember("pets", petB.id);
  await check("animais próprios e acesso cruzado", async () => {
    assert.deepEqual(unwrap(await b.client.from("pets").select("id").eq("id", petA.id), "ler animal alheio"), []);
    const changed = await b.client.from("pets").update({ name: `${marker} intrusão` }).eq("id", petA.id).select("id");
    forbidden(changed, "alterar animal alheio");
    assert.equal(unwrap(await a.client.from("pets").select("name").eq("id", petA.id).single(), "conferir animal A").name, petA.name);
  });

  const publicOccurrence = unwrap(await a.client.from("occurrences").insert(occurrenceInput(a, petA, "public")).select("id").single(), "ocorrência pública");
  remember("occurrences", publicOccurrence.id);
  const privateOccurrence = unwrap(await a.client.from("occurrences").insert(occurrenceInput(a, petA, "private")).select("id").single(), "ocorrência privada");
  remember("occurrences", privateOccurrence.id);
  const bOccurrence = unwrap(await b.client.from("occurrences").insert(occurrenceInput(b, petB, "public")).select("id").single(), "ocorrência B");
  remember("occurrences", bOccurrence.id);
  await check("ocorrências públicas, privadas e animal de outro tutor", async () => {
    assert.equal(unwrap(await anon.from("occurrences").select("id").eq("id", publicOccurrence.id), "consulta pública").length, 1);
    assert.deepEqual(unwrap(await anon.from("occurrences").select("id").eq("id", privateOccurrence.id), "consulta privada anônima"), []);
    assert.deepEqual(unwrap(await b.client.from("occurrences").select("id").eq("id", privateOccurrence.id), "consulta privada cruzada"), []);
    const cross = await b.client.from("occurrences").insert(occurrenceInput(b, petA, "public")).select("id");
    if (cross.data?.[0]?.id) remember("occurrences", cross.data[0].id);
    forbidden(cross, "associar animal alheio");
  });

  await check("papéis, suspensão e parceiro sem autopromoção", async () => {
    forbidden(await a.client.from("user_roles").insert({ user_id: a.id, role: "administrador" }).select("role"), "autoatribuir administrador");
    forbidden(await a.client.from("profiles").update({ status: "suspended" }).eq("id", a.id).select("status"), "alterar suspensão");
    const application = await a.client.from("partner_profiles").insert({
      user_id: a.id, organization_type: "protetor", public_name: marker,
      city: "Cuiabá", responsible_name: `${marker} A`,
    });
    unwrap(application, "solicitar parceria");
    forbidden(await a.client.rpc("approve_partner", { p_user: a.id, p_approve: true }), "autoaprovar parceria");
    assert.equal(unwrap(await a.client.from("partner_profiles").select("status").eq("user_id", a.id).single(), "conferir parceria").status, "pending");
  });

  const sighting = unwrap(await b.client.from("sightings").insert({
    occurrence_id: publicOccurrence.id, reporter_id: b.id,
    observed_at: new Date().toISOString(), area_description: "Centro",
    description: `${marker}: avistamento sintético.`,
  }).select("id").single(), "avistamento B");
  remember("sightings", sighting.id);
  await check("avistamentos e coordenadas privadas", async () => {
    assert.equal(unwrap(await a.client.from("sightings").select("id").eq("id", sighting.id), "tutor lê pista").length, 1);
    forbidden(await anon.from("sightings").select("id").eq("id", sighting.id), "visitante lê pista");
    unwrap(await b.client.rpc("add_sighting_coordinates", { p_sighting: sighting.id, p_lat: -15.6, p_lon: -56.1 }), "coordenadas sintéticas");
    const coords = unwrap(await a.client.rpc("sighting_coordinates", { p_sighting: sighting.id }), "coordenadas tutor");
    assert.equal(coords.length, 1);
    forbidden(await anon.rpc("sighting_coordinates", { p_sighting: sighting.id }), "coordenadas anônimas");
    const cross = await b.client.from("sightings").insert({
      occurrence_id: privateOccurrence.id, reporter_id: b.id,
      observed_at: new Date().toISOString(), area_description: "Centro",
      description: `${marker}: pista privada indevida.`,
    }).select("id");
    if (cross.data?.[0]?.id) remember("sightings", cross.data[0].id);
    forbidden(cross, "pista em ocorrência privada alheia");
  });

  const image = readFileSync(path.join(process.cwd(), "assets", "hex.png"));
  const privatePath = `${a.id}/${randomUUID()}.png`;
  remember("paths", privatePath);
  unwrap(await a.client.storage.from("pet-media").upload(privatePath, image, { contentType: "image/png", upsert: false }), "upload privado");
  await check("Storage privado e exclusão cruzada", async () => {
    forbidden(await anon.storage.from("pet-media").download(privatePath), "leitura anônima privada");
    forbidden(await b.client.storage.from("pet-media").download(privatePath), "leitura cruzada privada");
    await b.client.storage.from("pet-media").remove([privatePath]);
    unwrap(await a.client.storage.from("pet-media").download(privatePath), "objeto preservado após exclusão cruzada");
    forbidden(await b.client.storage.from("pet-media").upload(`${a.id}/${randomUUID()}.png`, image, { contentType: "image/png" }), "upload em pasta alheia");
  });
  const privatePhoto = unwrap(await a.client.from("occurrence_photos").insert({
    occurrence_id: privateOccurrence.id, uploaded_by: a.id,
    storage_path: privatePath, mime_type: "image/png", byte_size: image.length,
  }).select("id").single(), "metadado privado");
  remember("photos", privatePhoto.id);
  const publicPath = `${a.id}/${randomUUID()}.png`;
  remember("paths", publicPath);
  unwrap(await a.client.storage.from("pet-media").upload(publicPath, image, { contentType: "image/png", upsert: false }), "upload público antes de vincular");
  await check("arquivo só se torna publicável após vínculo autorizado", async () => {
    forbidden(await anon.storage.from("pet-media").download(publicPath), "arquivo sem metadado");
    const photo = unwrap(await a.client.from("occurrence_photos").insert({
      occurrence_id: publicOccurrence.id, uploaded_by: a.id,
      storage_path: publicPath, mime_type: "image/png", byte_size: image.length,
    }).select("id").single(), "metadado público");
    remember("photos", photo.id);
    unwrap(await anon.storage.from("pet-media").download(publicPath), "download publicável anônimo");
    unwrap(await b.client.storage.from("pet-media").download(publicPath), "download publicável autenticado");
    assert.deepEqual(unwrap(await b.client.from("occurrence_photos").select("id").eq("id", privatePhoto.id), "metadado privado cruzado"), []);
    const unattachedPath = `${a.id}/${randomUUID()}.png`;
    remember("paths", unattachedPath);
    unwrap(await a.client.storage.from("pet-media").upload(unattachedPath, image, { contentType: "image/png", upsert: false }), "upload para teste de vínculo cruzado");
    const wrong = await a.client.from("occurrence_photos").insert({
      occurrence_id: bOccurrence.id, uploaded_by: a.id,
      storage_path: unattachedPath, mime_type: "image/png", byte_size: image.length,
    }).select("id");
    if (wrong.data?.[0]?.id) remember("photos", wrong.data[0].id);
    forbidden(wrong, "anexar foto a ocorrência alheia");
  });
  await check("exclusão autorizada de arquivo", async () => {
    unwrap(await a.client.from("occurrence_photos").delete().eq("id", privatePhoto.id), "excluir metadado próprio");
    const removed = unwrap(await a.client.storage.from("pet-media").remove([privatePath]), "excluir arquivo próprio");
    assert(Array.isArray(removed) && removed.some((item) => item.name === privatePath),
      "Storage.remove não confirmou a exclusão do caminho autorizado");
    const listed = unwrap(await a.client.storage.from("pet-media").list(a.id, { limit: 100 }), "listar após excluir arquivo");
    assert(!listed.some((item) => item.name === privatePath.split("/")[1]), "arquivo ainda listado após exclusão");
    // Smart CDN pode propagar invalidação de um arquivo já baixado por até 60 s.
    if (process.env.BUSCAPET_TEST_FAST_BROWSER !== "1") {
      let inaccessible = false;
      for (let retry = 0; retry < 14; retry++) {
        const result = await a.client.storage.from("pet-media").download(privatePath);
        if (result.error || !result.data) { inaccessible = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      assert(inaccessible, "arquivo excluído permaneceu baixável após janela de invalidação do CDN");
    } else {
      manifest.limitations.push("rodada rápida: leitura pós-invalidação do CDN omitida; comprovada em rodadas anteriores");
      save();
    }
  });
  await browserFlow(a, b);
  await publicSignup();
} catch (error) {
  testError = error;
  console.error(`FALHA: ${error.message}`);
} finally {
  const cleanupErrors = await cleanup();
  console.log(JSON.stringify({
    project: PROJECT, runId, passed: manifest.checks.length,
    checks: manifest.checks, limitations: manifest.limitations, cleanup: manifest.cleanup.state,
    cleanupErrors, manifest: manifestPath,
  }, null, 2));
  if (testError || cleanupErrors.length) process.exitCode = 1;
}
