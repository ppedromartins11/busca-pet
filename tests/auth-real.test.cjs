const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function boot({ initialSession = null, confirmationRequired = false, status = "active" } = {}) {
  const calls = [];
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "pessoa@example.com",
    email_confirmed_at: "2026-10-21T12:00:00Z",
    created_at: "2026-10-21T12:00:00Z",
  };
  const profile = {
    id: user.id,
    full_name: "Pessoa Teste",
    active_role: "tutor",
    status,
    created_at: user.created_at,
  };
  let session = initialSession ? makeSession(user) : null;
  let roles = [{ role: "tutor" }];
  let partner = null;
  let authCallback = () => {};
  const client = {
    auth: {
      onAuthStateChange(callback) { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      async getSession() { return { data: { session }, error: null }; },
      async getUser() { return { data: { user: session ? user : null }, error: null }; },
      async signInWithPassword(credentials) {
        calls.push(["signIn", credentials]);
        if (credentials.password !== "senha válida") return { data: null, error: { code: "invalid_credentials" } };
        session = makeSession(user);
        authCallback("SIGNED_IN", session);
        return { data: { session, user }, error: null };
      },
      async signUp({ email, password, options }) {
        calls.push(["signUp", { email, passwordLength: password.length, options }]);
        session = confirmationRequired ? null : makeSession(user);
        if (session) authCallback("SIGNED_IN", session);
        return { data: { user, session }, error: null };
      },
      async signOut() {
        calls.push(["signOut"]);
        session = null;
        authCallback("SIGNED_OUT", null);
        return { error: null };
      },
      async resetPasswordForEmail(email, options) {
        calls.push(["reset", { email, options }]);
        return { data: {}, error: null };
      },
      async updateUser(input) { calls.push(["updateUser", input]); return { data: { user }, error: null }; },
      async resend(input) { calls.push(["resend", input]); return { data: {}, error: null }; },
    },
    from(table) {
      const state = { table, operation: "select", payload: null };
      const query = {
        select() { state.operation = "select"; return query; },
        update(payload) { state.operation = "update"; state.payload = payload; return query; },
        insert(payload) {
          calls.push(["insert", table, payload]);
          if (table === "user_roles" && !roles.some((row) => row.role === payload.role)) roles.push({ role: payload.role });
          if (table === "partner_profiles") partner = { ...payload, status: "pending" };
          return Promise.resolve({ data: null, error: null });
        },
        eq(column, value) {
          calls.push([state.operation, table, column, value, state.payload]);
          return query;
        },
        async single() { return { data: profile, error: null }; },
        async maybeSingle() { return { data: partner, error: null }; },
        then(resolve) {
          const data = table === "user_roles" ? roles : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
    async rpc(name, args) {
      calls.push(["rpc", name, args]);
      if (name === "switch_active_role") profile.active_role = args.p_role;
      return { data: null, error: null };
    },
  };
  const localStorage = storage();
  const context = vm.createContext({
    window: { BPSupabase: { client, configured: true } },
    location: { origin: "http://localhost:5173", pathname: "/", search: "" },
    localStorage,
    sessionStorage: storage(),
    console,
    setTimeout,
    clearTimeout,
  });
  for (const file of ["src/constants.js", "src/storage.js", "src/validation.js", "src/auth.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return { A: context.window.BPAuth, calls, client, user, localStorage, getSession: () => session,
    emit: (event) => authCallback(event, session) };
}

function makeSession(user) {
  return { user, expires_at: Math.floor(Date.now() / 1000) + 3600 };
}

test("modo real usa a sessão Supabase e papéis concedidos pelo banco", async () => {
  const { A, calls } = boot();
  await A.ready;
  assert.equal(A.getSession(), null);
  await assert.rejects(A.signIn("pessoa@example.com", "errada"), { code: "INVALID_CREDENTIALS" });
  const account = await A.signIn("pessoa@example.com", "senha válida");
  assert.equal(account.id, A.getSession().userId);
  assert.deepEqual([...A.getRoles()], ["tutor"]);
  await assert.rejects(A.setActiveRole("administrador"), { code: "ROLE_NOT_ALLOWED" });
  assert.equal(calls.some((call) => call[0] === "rpc" && call[1] === "switch_active_role"), false);
  await A.signOut();
  assert.equal(A.getSession(), null);
});

test("cadastro com confirmação não inventa sessão e conclui opções após login", async () => {
  const { A, calls } = boot({ confirmationRequired: true });
  await A.ready;
  const created = await A.signUp({
    name: "Pessoa Teste", email: "pessoa@example.com",
    password: "senha válida", passwordConfirmation: "senha válida",
    roles: ["tutor", "colaborador"], activeRole: "colaborador",
    acceptTerms: true, acceptPrivacy: true,
  });
  assert.equal(created.needsEmailConfirmation, true);
  assert.equal(A.getSession(), null);
  const account = await A.signIn("pessoa@example.com", "senha válida");
  assert.deepEqual([...account.roles], ["tutor", "colaborador"]);
  assert.equal(account.activeRole, "colaborador");
  assert.equal(calls.some((call) => call[0] === "insert" && call[1] === "user_roles"), true);
  assert.equal(calls.some((call) => call[0] === "rpc" && call[1] === "switch_active_role"), true);
});

test("parceiro permanece pendente e não recebe o papel por cadastro", async () => {
  const { A, calls } = boot();
  await A.ready;
  const account = await A.signUp({
    name: "Pessoa Teste", email: "pessoa@example.com",
    password: "senha válida", passwordConfirmation: "senha válida",
    roles: ["parceiro"], activeRole: "parceiro",
    acceptTerms: true, acceptPrivacy: true,
    partner: {
      organizationType: "ONG", publicName: "BuscaPet Teste", city: "Cuiabá",
      region: "Centro", responsible: "Pessoa Teste", representationConfirmed: true,
    },
  });
  assert.deepEqual([...account.roles], ["tutor"]);
  assert.equal(account.activeRole, "tutor");
  assert.equal(account.partner.status, "pending");
  assert.equal(calls.some((call) => call[0] === "insert" && call[1] === "partner_profiles"), true);
  assert.equal(calls.some((call) => call[0] === "insert" && call[1] === "user_roles" && call[2].role === "parceiro"), false);
});

test("metadados locais adulterados não concedem administrador", async () => {
  const { A, calls, user, localStorage } = boot();
  localStorage.setItem("buscapet.auth.pending-onboarding.v1", JSON.stringify({
    userId: user.id, email: user.email, roles: ["administrador"],
    activeRole: "administrador", acceptedAt: new Date().toISOString(),
    createdAt: Date.now(),
  }));
  await A.ready;
  const account = await A.signIn("pessoa@example.com", "senha válida");
  assert.deepEqual([...account.roles], ["tutor"]);
  assert.equal(account.activeRole, "tutor");
  assert.equal(calls.some((call) => call[0] === "insert" && call[1] === "user_roles" && call[2].role === "administrador"), false);
});

test("recuperação exige evento real e usa callback sem fragmento de rota", async () => {
  const { A, calls, emit } = boot({ initialSession: true });
  await A.ready;
  await assert.rejects(A.updatePassword("nova senha", "nova senha"), { code: "TOKEN_INVALID" });
  await A.requestPasswordReset("pessoa@example.com");
  const request = calls.find((call) => call[0] === "reset")[1];
  assert.equal(request.options.redirectTo, "http://localhost:5173/?auth=reset");
  emit("PASSWORD_RECOVERY");
  assert.equal(A.canResetPassword(), true);
  await A.updatePassword("nova senha", "nova senha");
  assert.equal(A.canResetPassword(), false);
  assert.equal(A.getSession(), null);
  assert.equal(calls.some((call) => call[0] === "updateUser" && call[1].password === "nova senha"), true);
});

test("conta suspensa não mantém sessão de interface", async () => {
  const { A } = boot({ status: "suspended" });
  await A.ready;
  await assert.rejects(A.signIn("pessoa@example.com", "senha válida"), { code: "ACCOUNT_SUSPENDED" });
  assert.equal(A.getSession(), null);
});
