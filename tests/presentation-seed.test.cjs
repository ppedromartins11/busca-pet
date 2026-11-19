const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "src/local-preview.js"), "utf8")
  .replaceAll("import.meta.env.MODE", '"presentation"')
  .replaceAll("import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW", '"true"')
  .replaceAll("import.meta.url", '"https://buscapet.example/src/local-preview.js"');

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function setup(localStorage = storage()) {
  const sessionStorage = storage();
  const window = { BPSupabase: { configured: false } };
  const pictureRequests = [];
  const indexedDB = {
    deleteDatabase() {
      const request = {};
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  vm.runInNewContext(source, {
    window, localStorage, sessionStorage, crypto: webcrypto, TextEncoder, URL, Blob,
    structuredClone, indexedDB,
    fetch: async (url) => {
      pictureRequests.push(url);
      return { ok: true, blob: async () => new Blob(["foto-exemplo"], { type: "image/png" }) };
    },
  }, { filename: "local-preview.js" });
  return { auth: window.BPAuth, data: window.BPRemoteStore, localStorage,
    preview: window.BPLocalPreview, pictureRequests };
}

test("a apresentacao começa com alertas e fotos de exemplo", async () => {
  const app = setup();
  const occurrences = await app.data.listPublicOccurrences();
  assert.equal(occurrences.length, 3);
  assert.deepEqual(occurrences.map((o) => o.type).sort(), ["found", "lost", "lost"]);
  assert.ok(occurrences.every((o) => o.city === "Campo Grande"));
  assert.ok(occurrences.every((o) => o.description.includes("exemplo") || o.description.includes("fictício") || o.description.includes("fictícia")));

  const covers = await app.data.listPublicCoverPhotos(occurrences.map((o) => o.id));
  assert.equal(covers.length, 3);
  const photo = await app.data.downloadPhoto(covers[0].storage_path);
  assert.equal(photo.type, "image/png");
  assert.equal(app.pictureRequests.length, 1);

  const points = await app.data.listPublicMapPoints({ city: "Campo Grande" });
  assert.equal(points.length, 4);
  assert.equal(points.filter((p) => p.category === "last-known").length, 3);
  assert.equal(points.filter((p) => p.category === "sighting").length, 1);
});

test("o tutor edita exemplos e o administrador encontra registros de moderacao", async () => {
  const app = setup();
  await app.auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
  const pets = await app.data.listOwnPets();
  assert.equal(pets.length, 3);
  const samplePet = pets.find((p) => p.name === "Hex");
  await app.data.updatePet(samplePet.id, { coat_description: "Atualizado na apresentação" });
  const updated = await app.data.getPet(samplePet.id);
  assert.equal(updated.coat_description, "Atualizado na apresentação");
  const alerts = await app.data.listOwnOccurrences();
  assert.equal(alerts.length, 3);
  const sightings = await app.data.listSightings(alerts.find((a) => a.status === "active" && a.type === "lost").id);
  assert.equal(sightings.length, 2);

  await app.auth.signOut();
  await app.auth.signIn("admin@buscapet.test", "BuscaPet@2026");
  const snapshot = await app.data.localAdminSnapshot();
  assert.equal(snapshot.pets.length, 3);
  assert.equal(snapshot.reports.length, 1);
  assert.equal(snapshot.occurrences.length, 3);
});

test("dados editados persistem e a limpeza não repovoa o navegador", async () => {
  const original = setup();
  await original.auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
  await original.data.createPet({ name: "Criado agora", species: "dog" });
  const nextTab = setup(original.localStorage);
  await nextTab.auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
  assert.equal((await nextTab.data.listOwnPets()).length, 4);
  await nextTab.preview.clear();
  assert.equal((await nextTab.data.listPublicOccurrences()).length, 0);
  const afterReload = setup(original.localStorage);
  assert.equal((await afterReload.data.listPublicOccurrences()).length, 0);
});
