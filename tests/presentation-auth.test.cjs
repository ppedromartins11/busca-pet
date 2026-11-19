const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "local-preview.js"), "utf8")
  .replaceAll("import.meta.env.MODE", '"presentation"')
  .replaceAll("import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW", '"true"');

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function boot(localStorage = storage(), sessionStorage = storage()) {
  const window = { BPSupabase: { configured: false } };
  const context = vm.createContext({
    window, localStorage, sessionStorage,
    crypto: webcrypto, TextEncoder, structuredClone,
  });
  vm.runInContext(source, context, { filename: "local-preview.js" });
  assert.equal(window.BPLocalPreview.active, true);
  return { auth: window.BPAuth, window, localStorage, sessionStorage };
}

const registration = {
  name: "Maria Teste",
  email: "maria@example.com",
  password: "SenhaTemporaria123",
  passwordConfirmation: "SenhaTemporaria123",
  acceptTerms: true,
  acceptPrivacy: true,
};

test("contas criadas usam apenas papel de tutor e persistem no mesmo navegador", async () => {
  const { auth, localStorage } = boot();
  const created = await auth.signUp({ ...registration, email: " MARIA@EXAMPLE.COM ", role: "admin" });
  assert.equal(created.email, "maria@example.com");
  assert.match(created.recoveryCode, /^[A-F0-9]{12}$/);
  await assert.rejects(auth.signUp(registration), /Já existe uma conta/);
  await assert.rejects(auth.signIn(registration.email, "senha-incorreta"), /E-mail ou senha/);
  const user = await auth.signIn(registration.email, registration.password);
  assert.equal(user.activeRole, "tutor");
  assert.equal(auth.hasRole("administrador"), false);
  assert.equal(auth.getSession().userId, created.id);
  await auth.signOut();
  assert.equal(auth.getSession(), null);

  const otherTab = boot(localStorage);
  assert.equal(otherTab.auth.getSession(), null);
  assert.equal((await otherTab.auth.signIn(registration.email, registration.password)).id, created.id);
});

test("cadastro rejeita email malformado e confirmacao de senha incorreta", async () => {
  const { auth } = boot();
  for (const email of ["maria@site.", "maria@@site.com", "maria site@example.com", "maria@example"]) {
    await assert.rejects(auth.signUp({ ...registration, email }), /e-mail válido/);
  }
  await assert.rejects(auth.signUp({ ...registration, passwordConfirmation: "outra senha" }), /Confirme a senha/);
  await assert.rejects(auth.signUp({ ...registration, acceptPrivacy: false }), /Termos e a Política/);
});

test("recuperacao exige codigo e troca apenas a senha da conta cadastrada", async () => {
  const { auth } = boot();
  const created = await auth.signUp(registration);
  assert.equal(auth.canResetPassword(), false);
  await assert.rejects(auth.requestPasswordReset(registration.email, "000000000000"), /código de recuperação/);
  await assert.rejects(auth.requestPasswordReset("naoexiste@example.com", created.recoveryCode), /código de recuperação/);
  assert.equal(auth.canResetPassword(), false);

  await auth.requestPasswordReset(registration.email, created.recoveryCode);
  assert.equal(auth.canResetPassword(), true);
  await assert.rejects(auth.updatePassword("curta", "curta"), /oito caracteres/);
  await assert.rejects(auth.updatePassword("NovaSenha456", "outra-senha"), /confirme/);
  await auth.updatePassword("NovaSenha456", "NovaSenha456");
  assert.equal(auth.canResetPassword(), false);
  await assert.rejects(auth.signIn(registration.email, registration.password), /E-mail ou senha/);
  assert.equal((await auth.signIn(registration.email, "NovaSenha456")).id, created.id);
});
