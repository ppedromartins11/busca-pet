const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/local-preview.js"), "utf8")
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

function boot() {
  const window = { BPSupabase: { configured: false } };
  const localStorage = storage();
  const sessionStorage = storage();
  vm.runInNewContext(source, {
    window, localStorage, sessionStorage, crypto: webcrypto,
    TextEncoder, URL, Blob, structuredClone,
  }, { filename: "src/local-preview.js" });
  return { auth: window.BPAuth, store: window.BPRemoteStore };
}

test("WhatsApp permitido pertence ao alerta do tutor e pode ser desativado", async () => {
  const { auth, store } = boot();
  await auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
  const row = await store.createOccurrence({
    type: "lost", visibility: "public", city: "Campo Grande", region: "Centro",
    description: "Alerta inserido na apresentação", last_seen_at: new Date().toISOString(),
    contact_whatsapp: "5567999991234", contact_enabled: true,
  });
  assert.equal((await store.getOccurrence(row.id)).contact_whatsapp, "5567999991234");
  assert.equal((await store.getOccurrence(row.id)).contact_enabled, true);
  await auth.signOut();

  await auth.signIn("admin@buscapet.test", "BuscaPet@2026");
  assert.equal((await store.getOccurrence(row.id)).is_owner, false);
  await assert.rejects(
    store.updateOccurrence(row.id, { contact_whatsapp: "5567999999999" }),
    /Alerta não encontrado/,
  );
  await auth.signOut();

  await auth.signIn("tutor@buscapet.test", "BuscaPet@2026");
  await store.updateOccurrence(row.id, { contact_whatsapp: null, contact_enabled: false });
  assert.equal((await store.getOccurrence(row.id)).contact_whatsapp, null);
  assert.equal((await store.getOccurrence(row.id)).contact_enabled, false);
});

test("as rotas de contato validam dados antes de criar link ao WhatsApp", () => {
  const app = fs.readFileSync(path.join(root, "src/real-app.js"), "utf8");
  for (const marker of [
    'route === "contato"', 'id="real-contact-form"', 'name="contact_whatsapp"',
    'name="contact_enabled"', 'name="real_information"', 'name="observed_at"',
    'name="description"', 'contact_enabled', 'bp.contact-attempts.v1',
    'Preparar mensagem ao tutor', 'https://wa.me/',
  ]) {
    assert.ok(app.includes(marker), "Faltou fluxo: " + marker);
  }
  assert.ok(app.includes("attempts.length >= 3"));
  assert.ok(app.includes("current - time < 600000"));
  assert.ok(app.includes("encodeURIComponent(messageText)"));
});
