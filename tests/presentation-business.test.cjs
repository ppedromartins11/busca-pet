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
  .replaceAll("import.meta.url", '"https://buscapet.test/src/local-preview.js"');
const permissions = fs.readFileSync(path.join(root, "src/permissions.js"), "utf8");

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
function boot(localStorage = storage()) {
  const window = { BPSupabase: { configured: false } };
  const sessionStorage = storage();
  const context = vm.createContext({
    window, localStorage, sessionStorage, crypto: webcrypto, TextEncoder, URL, Blob, structuredClone,
  });
  vm.runInContext(source, context, { filename: "local-preview.js" });
  vm.runInContext(permissions, context, { filename: "permissions.js" });
  return { auth: window.BPAuth, store: window.BPRemoteStore, permissions: window.BPPermissions, localStorage };
}

const company = {
  name: "Clínica Bichos & Cia", category: "veterinary", city: "Campo Grande",
  region: "Centro", address: "Rua Comercial, 123", phone: "(67) 99999-1234",
  website: "https://empresa.example.com", description: "Atendimento veterinário e orientação para tutores.",
  publishConsent: true,
};
const registration = {
  name: "Responsável Empresa", email: "empresa@exemplo.com",
  password: "SenhaComercial123", passwordConfirmation: "SenhaComercial123",
  acceptTerms: true, acceptPrivacy: true, role: "parceiro", business: company,
};

test("empresa se cadastra pendente, acessa perfil e não tem poder administrativo", async () => {
  const app = boot();
  const created = await app.auth.signUp(registration);
  assert.match(created.recoveryCode, /^[A-F0-9]{12}$/);
  assert.equal((await app.store.listApprovedBusinesses()).length, 0);
  await app.auth.signIn(registration.email, registration.password);
  assert.equal(app.auth.getCurrentUser().activeRole, "parceiro");
  assert.equal(app.auth.hasRole("parceiro"), true);
  assert.equal(app.auth.hasRole("administrador"), false);
  assert.equal(app.permissions.can("viewAdminDashboard"), false);
  assert.equal(app.permissions.can("publishAlert"), false);
  await assert.rejects(app.store.localAdminSnapshot(), /administração/);
  await assert.rejects(app.store.listOwnPets(), /conta de tutor/);
  const own = await app.store.getOwnBusiness();
  assert.equal(own.status, "pending");
  assert.equal(own.owner_id, app.auth.getCurrentUser().id);
  assert.equal(own.phone, "5567999991234");
  assert.equal(own.website, company.website);
});

test("empresa só aparece no diretório após aprovação, sem email pessoal", async () => {
  const app = boot();
  await app.auth.signUp(registration);
  await app.auth.signIn("admin@buscapet.test", "BuscaPet@2026");
  const snapshot = await app.store.localAdminSnapshot();
  assert.equal(snapshot.businesses.length, 1);
  const id = snapshot.businesses[0].id;
  await app.store.localAdminAction("business", id, "approve", "Dados comerciais conferidos manualmente.");
  const listings = await app.store.listApprovedBusinesses();
  assert.equal(listings.length, 1);
  assert.equal(listings[0].name, company.name);
  assert.equal(listings[0].phone, "5567999991234");
  assert.equal("owner_id" in listings[0], false);
  assert.equal("email" in listings[0], false);
  assert.equal("status" in listings[0], false);
  await app.store.localAdminAction("business", id, "hide", "Endereço comercial deixou de estar atualizado.");
  assert.equal((await app.store.listApprovedBusinesses()).length, 0);
  await app.store.localAdminAction("business", id, "approve", "Dados conferidos para nova publicação.");
  assert.equal((await app.store.listApprovedBusinesses()).length, 1);
});

test("editar empresa envia perfil aprovado de volta para análise", async () => {
  const app = boot();
  await app.auth.signUp(registration);
  await app.auth.signIn("admin@buscapet.test", "BuscaPet@2026");
  const id = (await app.store.localAdminSnapshot()).businesses[0].id;
  await app.store.localAdminAction("business", id, "approve", "Cadastro comercial com dados completos.");
  await app.auth.signOut();
  await app.auth.signIn(registration.email, registration.password);
  const modified = await app.store.updateOwnBusiness({
    ...company, name: "Clínica Bichos e Amigos", description: "Atendimento para cães e gatos em Campo Grande.",
  });
  assert.equal(modified.status, "pending");
  assert.equal(modified.name, "Clínica Bichos e Amigos");
  assert.equal((await app.store.listApprovedBusinesses()).length, 0);
});

test("contas suspensas não aparecem na rede, mesmo com cadastro aprovado", async () => {
  const app = boot();
  const account = await app.auth.signUp(registration);
  await app.auth.signIn("admin@buscapet.test", "BuscaPet@2026");
  const id = (await app.store.localAdminSnapshot()).businesses[0].id;
  await app.store.localAdminAction("business", id, "approve", "Cadastro apto a divulgação na rede.");
  await app.store.localAdminAction("user", account.id, "suspended", "Conta comercial temporariamente suspensa.");
  assert.equal((await app.store.listApprovedBusinesses()).length, 0);
  await app.store.localAdminAction("user", account.id, "active", "Conta revisada e reativada para uso.");
  assert.equal((await app.store.listApprovedBusinesses()).length, 1);
});

test("valida campos comerciais, não permite papéis administrativos pelo cadastro", async () => {
  const app = boot();
  for (const business of [
    { ...company, phone: "123" }, { ...company, website: "javascript:alert(1)" },
    { ...company, description: "pouco" }, { ...company, category: "administrador" },
    { ...company, publishConsent: false }, { ...company, address: "rua" },
  ]) {
    await assert.rejects(app.auth.signUp({ ...registration, business }), /Informe|Descreva|Selecione|Autorize/);
  }
  const tutor = await app.auth.signUp({ ...registration, email: "tutor2@exemplo.com", role: "administrador" });
  await app.auth.signIn("tutor2@exemplo.com", registration.password);
  assert.equal(app.auth.getCurrentUser().activeRole, "tutor");
  assert.equal(app.auth.hasRole("administrador"), false);
  await assert.rejects(app.store.getOwnBusiness(), /conta empresarial/);
  assert.equal(typeof tutor.recoveryCode, "string");
});

test("a interface contém cadastro de empresas, área própria, diretório e moderação", () => {
  const source = fs.readFileSync(path.join(root, "src/real-app.js"), "utf8");
  for (const value of [
    'route === "cadastro-empresa"', 'route === "minha-empresa"',
    'id="real-business-registration"', 'id="real-business-profile"',
    'id="registered-business-results"', 'section === "empresas"',
    'actionForm("business"', 'listApprovedBusinesses', 'getOwnBusiness',
    'data-registered-business', 'business_publish_consent',
  ]) assert.ok(source.includes(value), "Falta recurso: " + value);
});
