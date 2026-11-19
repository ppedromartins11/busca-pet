const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const localPreview = fs.readFileSync(path.join(root, "src", "local-preview.js"), "utf8")
  .replaceAll("import.meta.env.MODE", '"presentation"')
  .replaceAll("import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW", '"true"')
  .replaceAll("import.meta.url", '"https://buscapet.example/src/local-preview.js"');
const permissions = fs.readFileSync(path.join(root, "src", "permissions.js"), "utf8");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function boot(localStorage = storage()) {
  const sessionStorage = storage();
  const window = { BPSupabase: { configured: false } };
  const context = vm.createContext({
    window, localStorage, sessionStorage, crypto: webcrypto,
    TextEncoder, URL, Blob, structuredClone,
  });
  vm.runInContext(localPreview, context, { filename: "src/local-preview.js" });
  vm.runInContext(permissions, context, { filename: "src/permissions.js" });
  return {
    auth: window.BPAuth, store: window.BPRemoteStore,
    permission: window.BPPermissions, localStorage,
  };
}

const tutorEmail = "tutor@buscapet.test";
const adminEmail = "admin@buscapet.test";
const password = "BuscaPet@2026";

test("admin tem funcoes de tutor e moderação simultaneamente na apresentacao", async () => {
  const { auth, permission } = boot();
  assert.equal(auth.getSession(), null);
  await auth.signIn(adminEmail, password);
  assert.equal(auth.getCurrentUser().activeRole, "administrador");
  assert.equal(auth.hasRole("tutor"), true);
  assert.equal(auth.hasRole("administrador"), true);
  assert.equal(permission.can("publishAlert"), true);
  assert.equal(permission.can("editAlert"), true);
  assert.equal(permission.can("createSighting"), true);
  assert.equal(permission.can("reviewSighting"), true);
  assert.equal(permission.can("createReport"), true);
  assert.equal(permission.can("viewAdminDashboard"), true);
  assert.equal(permission.can("moderate"), true);
  await auth.signOut();
  assert.equal(permission.can("publishAlert"), false);
  assert.equal(permission.can("viewAdminDashboard"), false);
});

test("admin pode cadastrar animal, publicar alerta e mudar a situacao do proprio alerta", async () => {
  const { auth, store, permission } = boot();
  await auth.signIn(adminEmail, password);
  const id = auth.getCurrentUser().id;
  assert.equal((await store.listOwnPets()).length, 0, "pets demonstrativos do tutor nao pertencem ao admin");
  const pet = await store.createPet({ name: "Cachorra da administração", species: "dog" });
  assert.equal(pet.owner_id, id);
  assert.equal((await store.listOwnPets()).length, 1);
  await store.updatePet(pet.id, { breed: "Sem raca definida" });
  assert.equal((await store.getPet(pet.id)).breed, "Sem raca definida");

  const occurrence = await store.createOccurrence({
    type: "lost", visibility: "public", pet_id: pet.id, city: "Campo Grande",
    region: "Centro", description: "Cadastro de teste do administrador",
    last_seen_at: new Date().toISOString(),
  });
  assert.equal(occurrence.owner_id, id);
  assert.equal((await store.getOccurrence(occurrence.id)).is_owner, true);
  assert.equal((await store.listOwnOccurrences()).length, 1);
  await store.saveOccurrencePublicLocation(occurrence.id, { latitude: -20.45, longitude: -54.61, description: "Centro" });
  const sighting = await store.createSighting({
    occurrence_id: occurrence.id, observed_at: new Date().toISOString(),
    area_description: "Centro", description: "Avistamento de teste",
  });
  await store.reviewSighting(sighting.id, "reviewed");
  await store.setOccurrenceStatus(occurrence.id, "reunited");
  assert.equal((await store.getOccurrence(occurrence.id)).status, "reunited");
  assert.equal((await store.listSightings(occurrence.id)).length, 1);
  const snapshot = await store.localAdminSnapshot();
  assert.ok(snapshot.pets.some((p) => p.id === pet.id));
  assert.ok(snapshot.occurrences.some((o) => o.id === occurrence.id));

  await assert.rejects(
    store.updatePet("10000000-0000-4000-8000-000000000001", { name: "Sem permissao" }),
    /Animal não encontrado/,
  );
  assert.equal(permission.can("publishAlert", { ownerId: "00000000-0000-4000-8000-000000000001" }), false);
});

test("tutor nao recebe funcao administrativa nem edita cadastro proprio do admin", async () => {
  const { auth, store, permission, localStorage } = boot();
  await auth.signIn(adminEmail, password);
  const pet = await store.createPet({ name: "Pet do admin", species: "cat" });
  const occurrence = await store.createOccurrence({
    type: "found", visibility: "public", pet_id: pet.id, city: "Campo Grande",
    region: "Centro", description: "Alerta do administrador", last_seen_at: new Date().toISOString(),
  });
  await auth.signOut();
  await auth.signIn(tutorEmail, password);
  assert.equal(permission.can("viewAdminDashboard"), false);
  assert.equal(permission.can("publishAlert"), true);
  assert.equal(await store.getPet(pet.id), null);
  await assert.rejects(store.updatePet(pet.id, { name: "Alteracao" }), /Animal não encontrado/);
  assert.equal((await store.getOccurrence(occurrence.id)).is_owner, false);
  await assert.rejects(store.updateOccurrence(occurrence.id, { description: "Alteracao" }), /Alerta não encontrado/);
  await assert.rejects(store.localAdminSnapshot(), /administração/);
  assert.equal((await store.listOwnPets()).length, 3);
  assert.ok(localStorage.getItem("bp.modern-preview.v1"));
});

test("a interface da apresentacao nao bloqueia as rotas de tutor para o admin", () => {
  const app = fs.readFileSync(path.join(root, "src", "real-app.js"), "utf8");
  assert.match(app, /\["tutor", "administrador"\]\.includes\(user\(\)\?\.activeRole\)/);
  assert.doesNotMatch(app, /\["meus-animais", "novo-animal", "animal", "editar-animal", "publicar"/);
  assert.match(app, /else if \(route === "novo-animal"\) await petForm/);
  assert.match(app, /else if \(route === "publicar"\) await occurrenceForm/);
});
