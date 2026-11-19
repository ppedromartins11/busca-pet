const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "src/local-preview.js"), "utf8")
  .replaceAll("import.meta.env.MODE", '"presentation"')
  .replaceAll("import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW", '"true"')
  .replaceAll("import.meta.url", '"https://buscapet.test/src/local-preview.js"')
  .replace('import { possibleMatches } from "./pet-matching.js";', "const possibleMatches = globalThis.__match;");

function storage() {
  const values = new Map();
  return { getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); } };
}
async function boot(localStorage = storage()) {
  const { possibleMatches } = await import("../src/pet-matching.js");
  const window = { BPSupabase: { configured: false } };
  const sessionStorage = storage();
  vm.runInNewContext(source, {
    window, localStorage, sessionStorage, crypto: webcrypto, TextEncoder, URL, Blob,
    structuredClone, __match: possibleMatches,
  }, { filename: "src/local-preview.js" });
  return { auth: window.BPAuth, store: window.BPRemoteStore,
    preview: window.BPLocalPreview, localStorage };
}
const tutorLogin = async (app) => app.auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
const adminLogin = async (app) => app.auth.signIn("admin@buscapet.test", "BuscaPet@2026");

test("carteirinha privada: persiste somente para o dono e valida campos", async () => {
  const app = await boot();
  await tutorLogin(app);
  const pet = (await app.store.listOwnPets())[0];
  const card = await app.store.savePetCard(pet.id, {
    birth_date: "2021-05-12", weight_kg: "12,5", microchip: "ABC-123",
    vaccines: "Registro preenchido pelo tutor", allergies: "Nenhuma informada",
    medications: "", notes: "Dados de teste",
  });
  assert.equal(card.microchip, "ABC-123");
  assert.equal((await app.store.getPetCard(pet.id)).weight_kg, "12,5");
  await assert.rejects(app.store.savePetCard(pet.id, { birth_date: "2026-02-31" }), /data de nascimento/);
  await assert.rejects(app.store.savePetCard(pet.id, { weight_kg: "-2" }), /peso válido/);
  await app.auth.signOut();
  await adminLogin(app);
  assert.equal(await app.store.getPet(pet.id), null);
  await assert.rejects(app.store.savePetCard(pet.id, {}), /Animal não encontrado/);
  await assert.rejects(app.store.getPetCard(pet.id), /Animal não encontrado/);
  const own = await app.store.createPet({ name: "Pet Admin", species: "dog" });
  await app.store.savePetCard(own.id, { microchip: "ADMIN-1" });
  assert.equal((await app.store.getPetCard(own.id)).microchip, "ADMIN-1");
});

test("agenda: criação, conclusão, reabertura e exclusão respeitam a conta", async () => {
  const app = await boot();
  await tutorLogin(app);
  const initial = await app.store.listCareEvents();
  assert.equal(initial.length, 2);
  const pet = (await app.store.listOwnPets())[0];
  const event = await app.store.createCareEvent({ pet_id: pet.id, title: "Consulta de rotina",
    date: "2027-02-03", category: "vet", notes: "Conferir horário" });
  assert.equal((await app.store.listCareEvents(pet.id)).some((item) => item.id === event.id), true);
  assert.ok((await app.store.setCareEventComplete(event.id, true)).completed_at);
  assert.equal((await app.store.setCareEventComplete(event.id, false)).completed_at, null);
  await assert.rejects(app.store.createCareEvent({ pet_id: pet.id, title: "Boa",
    date: "2026-02-31", category: "vet", notes: "" }), /data válida/);
  await app.auth.signOut();
  await adminLogin(app);
  await assert.rejects(app.store.setCareEventComplete(event.id, true), /Compromisso não encontrado/);
  await assert.rejects(app.store.deleteCareEvent(event.id), /Compromisso não encontrado/);
  assert.equal((await app.store.listCareEvents()).length, 0);
  await app.auth.signOut();
  await tutorLogin(app);
  await app.store.deleteCareEvent(event.id);
  assert.equal((await app.store.listCareEvents()).some((item) => item.id === event.id), false);
});

test("a exclusão do animal remove somente sua carteirinha e seus cuidados", async () => {
  const app = await boot();
  await tutorLogin(app);
  const pet = await app.store.createPet({ name: "Novo pet", species: "cat" });
  await app.store.savePetCard(pet.id, { vaccines: "Anotação de exemplo" });
  await app.store.createCareEvent({ pet_id: pet.id, title: "Banho e tosa",
    date: "2026-12-02", category: "grooming", notes: "" });
  await app.store.deletePet(pet.id);
  assert.equal((await app.store.listCareEvents()).some((event) => event.pet_id === pet.id), false);
  assert.equal((await app.store.listCareEvents()).length, 2);
  await assert.rejects(app.store.getPetCard(pet.id), /Animal não encontrado/);
});

test("navegador antigo preserva pets e recebe agenda preenchida sem duplicação", async () => {
  const old = storage();
  const original = await boot(old);
  await tutorLogin(original);
  assert.equal((await original.store.listCareEvents()).length, 2);
  const next = await boot(old);
  await tutorLogin(next);
  assert.equal((await next.store.listCareEvents()).length, 2);
  await next.preview.clear();
  const afterClear = await boot(old);
  await tutorLogin(afterClear);
  assert.equal((await afterClear.store.listCareEvents()).length, 0);
});

test("novas rotas, formulários e ações estão implementados no aplicativo", () => {
  const s = fs.readFileSync(path.join(__dirname, "..", "src/real-app.js"), "utf8");
  for (const part of [
    'route === "agenda"', 'route === "carteirinha"', 'route === "cartaz"',
    'route === "semelhantes"', 'id="real-pet-card-form"', 'id="real-care-form"',
    'action === "care-toggle"', 'action === "care-delete"',
    'action === "poster-download"', 'id="bp-poster-canvas"',
    'listPossibleMatches', 'listCareEvents', 'drawPoster',
  ]) assert.ok(s.includes(part), "Fluxo ausente: " + part);
});
