const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/local-preview.js"), "utf8")
  .replaceAll("import.meta.env.MODE", '"presentation"')
  .replaceAll("import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW", '"true"')
  .replaceAll("import.meta.url", '"https://buscapet.test/src/local-preview.js"');
function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
function create(localStorage = storage()) {
  const window = { BPSupabase: { configured: false } };
  vm.runInNewContext(source, {
    window, localStorage, sessionStorage: storage(), crypto: webcrypto,
    TextEncoder, URL, Blob, structuredClone,
    fetch: async () => ({ ok: true, blob: async () => new Blob(["imagem"], { type: "image/png" }) }),
  }, { filename: "local-preview.js" });
  return { store: window.BPRemoteStore, auth: window.BPAuth, localStorage };
}
const tutor = (app) => app.auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
const admin = (app) => app.auth.signIn("admin@buscapet.test", "BuscaPet@2026");
const lostId = "20000000-0000-4000-8000-000000000001";
const petId = "10000000-0000-4000-8000-000000000001";

test("pistas e locais não revisados não ficam expostos a outras identidades", async () => {
  const app = create();
  await tutor(app);
  const lost = (await app.store.getOccurrence(lostId));
  assert.equal(lost.is_owner, true);
  const published = await app.store.listSightingPublicLocations([
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
  ]);
  assert.equal(published.length, 1);
  await app.auth.signOut();
  const visitor = await app.store.listSightingPublicLocations([
    "30000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000002",
  ]);
  assert.equal(visitor.length, 1);
  await admin(app);
  await assert.rejects(app.store.listSightings(lostId), /Alerta não encontrado/);
  assert.equal((await app.store.getOccurrence(lostId)).is_owner, false);
  await app.auth.signOut();
  await tutor(app);
  assert.equal((await app.store.listSightings(lostId)).length, 2);
});

test("fotos e coordenadas privadas permanecem sob a identidade proprietária", async () => {
  const app = create();
  await tutor(app);
  const ownPhotos = await app.store.listPetPhotos(petId);
  assert.equal(ownPhotos.length, 1);
  const privateRow = await app.store.createOccurrence({
    type: "lost", visibility: "private", city: "Campo Grande", region: "Centro",
    description: "Dados privados de um alerta", last_seen_at: new Date().toISOString(),
  });
  await app.store.saveOccurrencePublicLocation(privateRow.id, {
    latitude: -20.45, longitude: -54.61, description: "Região privada",
  });
  assert.ok(await app.store.getOccurrencePublicLocation(privateRow.id));
  await app.auth.signOut();
  assert.equal(await app.store.getOccurrencePublicLocation(privateRow.id), null);
  assert.deepEqual(await app.store.listPhotos(privateRow.id), []);
  await admin(app);
  await assert.rejects(app.store.listPetPhotos(petId), /Animal não encontrado/);
  await assert.rejects(app.store.downloadPhoto(ownPhotos[0].storage_path + "-invalido"), /Fotografia não disponível/);
  assert.equal(await app.store.getOccurrencePublicLocation(privateRow.id), null);
});

test("denúncias se separam por autor, evitando bloquear relatos de outras pessoas", async () => {
  const app = create();
  await tutor(app);
  const original = await app.store.getMyActiveOccurrenceReport("20000000-0000-4000-8000-000000000002");
  assert.ok(original);
  await app.auth.signOut();
  await admin(app);
  assert.equal(await app.store.getMyActiveOccurrenceReport("20000000-0000-4000-8000-000000000002"), null);
  const reported = await app.store.reportOccurrence("20000000-0000-4000-8000-000000000002", "other",
    "Preciso revisar as informações do aviso antes de entrar em contato.");
  assert.equal(reported.already_active, undefined);
  const repeated = await app.store.reportOccurrence("20000000-0000-4000-8000-000000000002", "other",
    "Minha segunda tentativa de enviar o mesmo relato.");
  assert.equal(repeated.already_active, true);
  assert.equal((await app.store.localAdminSnapshot()).reports.length, 2);
});

test("telefone no cartaz só é recuperado pelo próprio anunciante", async () => {
  const app = create();
  await tutor(app);
  await app.store.updateOccurrence(lostId, { contact_enabled: true,
    contact_whatsapp: "5567999991234" });
  assert.equal((await app.store.getPublicPosterData(lostId)).contact_whatsapp, "5567999991234");
  await app.auth.signOut();
  assert.equal((await app.store.getPublicPosterData(lostId)).contact_whatsapp, null);
  await admin(app);
  assert.equal((await app.store.getPublicPosterData(lostId)).contact_whatsapp, null);
  const source = fs.readFileSync(path.join(root, "src/real-app.js"), "utf8");
  assert.ok(source.includes("const ownsPhone = /^55\\d{10,11}$/"));
  assert.equal(source.includes("const ownsPhone = /^55\\\\d{10,11}$/"), false);
});

test("textos da demonstração são naturais e a migração não altera conteúdo personalizado", async () => {
  const app = create();
  const key = "bp.modern-preview.v1";
  const state = JSON.parse(app.localStorage.getItem(key) || "{}");
  assert.equal(Object.keys(state).length, 0); // a população inicial só ocorre na primeira leitura
  await tutor(app);
  const current = JSON.parse(app.localStorage.getItem(key));
  assert.equal(current.copyPolishVersion, 1);
  assert.equal(current.occurrences.every((row) => !/fictício|fictícia|exemplo de busca/i.test(row.description)), true);
  const fixedId = "20000000-0000-4000-8000-000000000002";
  current.occurrences.find((row) => row.id === fixedId).description = "Texto escrito por um tutor e mantido após a atualização.";
  current.copyPolishVersion = 0;
  current.occurrences.find((row) => row.id === lostId).description =
    "Hex desapareceu na região do parque. É dócil e pode estar assustado. Alerta fictício para apresentação.";
  app.localStorage.setItem(key, JSON.stringify(current));
  const migrated = create(app.localStorage);
  const rows = await migrated.store.listPublicOccurrences();
  assert.match(rows.find((row) => row.id === lostId).description, /região do parque|proximidades do parque/);
  assert.equal(rows.find((row) => row.id === fixedId).description,
    "Texto escrito por um tutor e mantido após a atualização.");
  assert.equal(JSON.parse(app.localStorage.getItem(key)).copyPolishVersion, 1);
});
