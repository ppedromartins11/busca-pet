const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
}

function boot({ state, local, session } = {}) {
  const localStorage = local || storage();
  const sessionStorage = session || storage();
  const storeState =
    state ||
    {
      accounts: [
        { id: "local", name: "Tutor de demonstração", suspended: false },
        { id: "community", name: "Colaborador", suspended: false },
      ],
      alerts: [],
      tasks: [],
    };
  const context = vm.createContext({
    window: {
      BPStore: {
        POLICY_VERSION: "test",
        get: () => JSON.parse(JSON.stringify(storeState)),
        registerAccount: (account) => {
          if (!storeState.accounts.some((item) => item.id === account.id))
            storeState.accounts.push({ ...account, suspended: false });
        },
      },
    },
    console,
    crypto: require("node:crypto").webcrypto,
    localStorage,
    sessionStorage,
    setTimeout,
    clearTimeout,
  });
  for (const file of [
    "src/constants.js",
    "src/storage.js",
    "src/validation.js",
    "src/auth.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return { A: context.window.BPAuth, localStorage, sessionStorage, state: storeState };
}

const base = {
  name: "Pessoa Teste",
  email: "pessoa@example.com",
  password: "uma senha longa",
  passwordConfirmation: "uma senha longa",
  acceptTerms: true,
  acceptPrivacy: true,
  partner: {},
};

test("cadastro aceita apenas Tutor", async () => {
  const { A } = boot();
  const user = await A.signUp({ ...base, roles: ["tutor"], activeRole: "tutor" });
  assert.deepEqual([...user.roles], ["tutor"]);
  assert.equal(user.activeRole, "tutor");
});

test("cadastro aceita apenas Colaborador", async () => {
  const { A } = boot();
  const user = await A.signUp({
    ...base,
    roles: ["colaborador"],
    activeRole: "colaborador",
  });
  assert.deepEqual([...user.roles], ["colaborador"]);
});

test("uma conta pode reunir Tutor e Colaborador", async () => {
  const { A } = boot();
  const user = await A.signUp({
    ...base,
    roles: ["tutor", "colaborador"],
    activeRole: "tutor",
  });
  assert.deepEqual([...user.roles], ["tutor", "colaborador"]);
  A.verifyEmail(user.email);
  A.setActiveRole("colaborador");
  assert.equal(A.getActiveRole(), "colaborador");
  assert.equal(A.getSession().userId, user.id);
});

test("cadastro simplificado aceita Conta BuscaPet sem escolha explícita e rejeita função inicial alheia", () => {
  const { A } = boot();
  const simple = { ...base };
  delete simple.roles;
  assert.deepEqual([...A.validateSignUp(simple).roles], ["tutor"]);
  const result = A.validateSignUp({
    ...base,
    roles: ["tutor", "colaborador"],
    activeRole: "parceiro",
  });
  assert.match(result.errors.activeRole, /selecionadas/);
});

test("Parceiro exige os campos previstos", () => {
  const { A } = boot();
  const result = A.validateSignUp({
    ...base,
    roles: ["parceiro"],
    activeRole: "parceiro",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors["partner.organizationType"]);
  assert.ok(result.errors["partner.representationConfirmed"]);
});

test("Moderador e Administrador não fazem parte do cadastro público", () => {
  const { A } = boot();
  assert.deepEqual([...A.PUBLIC_ROLES], ["tutor", "colaborador", "parceiro"]);
  const result = A.validateSignUp({
    ...base,
    roles: ["moderador", "administrador"],
    activeRole: "moderador",
  });
  assert.equal(result.valid, false);
});

test("pessoa não concede Moderador a si mesma", async () => {
  const { A } = boot();
  await A.signUp({ ...base, roles: ["tutor"], activeRole: "tutor" });
  assert.throws(() => A.addRole("moderador"), /administração/);
});

test("conta de função única não pode alternar para função não concedida", async () => {
  const { A } = boot();
  await A.signUp({ ...base, roles: ["tutor"], activeRole: "tutor" });
  assert.throws(() => A.setActiveRole("colaborador"), /não foi concedida/);
});

test("logout encerra a sessão", async () => {
  const { A } = boot();
  await A.signUp({ ...base, roles: ["tutor"], activeRole: "tutor" });
  assert.ok(A.getSession());
  A.signOut();
  assert.equal(A.getSession(), null);
});

test("sessão expirada deixa de ser aceita", async () => {
  const { A } = boot();
  await A.signUp({ ...base, roles: ["tutor"], activeRole: "tutor" });
  A.expireSession();
  assert.equal(A.getSession(), null);
});

test("senha, confirmação e token nunca são persistidos", async () => {
  const { A, localStorage, sessionStorage } = boot();
  await A.signUp({ ...base, roles: ["tutor"], activeRole: "tutor" });
  await A.requestPasswordReset(base.email);
  const raw = JSON.stringify({ ...localStorage.dump(), ...sessionStorage.dump() });
  assert.equal(raw.includes(base.password), false);
  assert.equal(/password|senha|token/i.test(raw), false);
});

test("migração cria perfis de identidade sem apagar dados operacionais", () => {
  const state = {
    accounts: [
      { id: "local", name: "Tutor anterior", suspended: false },
      { id: "community", name: "Colaborador anterior", suspended: false },
    ],
    alerts: [{ id: "alerta-existente", ownerId: "local", status: "ativo" }],
    tasks: [{ id: "tarefa-existente", assigneeId: "community", status: "pendente" }],
  };
  const { A } = boot({ state });
  assert.equal(A._accounts().find((item) => item.id === "local").activeRole, "tutor");
  assert.equal(
    A._accounts().find((item) => item.id === "community").activeRole,
    "colaborador",
  );
  assert.ok(A._accounts().some((item) => item.id === "moderador-demo"));
  assert.equal(state.alerts[0].id, "alerta-existente");
  assert.equal(state.tasks[0].id, "tarefa-existente");
});

test("dependências impedem remover funções", async () => {
  const state = {
    accounts: [
      { id: "local", name: "Tutor", suspended: false },
      { id: "community", name: "Colaborador", suspended: false },
    ],
    alerts: [],
    tasks: [],
  };
  const { A } = boot({ state });
  const user = await A.signUp({
    ...base,
    roles: ["tutor", "colaborador"],
    activeRole: "tutor",
  });
  state.alerts.push({ id: "a", ownerId: user.id, status: "ativo" });
  assert.throws(() => A.removeRole("tutor"), /Encerre ou transfira/);
  state.alerts.length = 0;
  state.tasks.push({ id: "t", assigneeId: user.id, status: "pendente" });
  assert.throws(() => A.removeRole("colaborador"), /Conclua ou transfira/);
});

test("conta suspensa e e-mail não verificado bloqueiam a entrada", async () => {
  const state = {
    accounts: [
      { id: "local", name: "Tutor", suspended: true },
      { id: "community", name: "Colaborador", suspended: false },
    ],
    alerts: [],
    tasks: [],
  };
  const { A } = boot({ state });
  await assert.rejects(
    A.signIn("tutor@demo.buscapet", "BuscaPetDemo!"),
    (error) => error.code === "ACCOUNT_SUSPENDED",
  );
  const created = await A.signUp({
    ...base,
    email: "nao.verificado@example.com",
    roles: ["tutor"],
    activeRole: "tutor",
  });
  A.signOut();
  await assert.rejects(
    A.signIn(created.email, base.password),
    (error) => error.code === "EMAIL_UNVERIFIED",
  );
});

test("Parceiro criado permanece aguardando análise", async () => {
  const { A } = boot();
  const user = await A.signUp({
    ...base,
    email: "parceiro@example.com",
    roles: ["parceiro"],
    activeRole: "parceiro",
    partner: {
      organizationType: "ONG",
      publicName: "Organização fictícia",
      city: "Campo Grande",
      region: "Centro",
      responsible: "Pessoa Teste",
      representationConfirmed: true,
    },
  });
  assert.equal(user.partner.status, "pending");
});

test("falha de armazenamento mantém estado em memória e gera aviso", async () => {
  const broken = {
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => {
      throw Error("blocked");
    },
    removeItem: () => {
      throw Error("blocked");
    },
  };
  const { A } = boot({ local: broken, session: broken });
  const user = await A.signUp({
    ...base,
    email: "memoria@example.com",
    roles: ["tutor"],
    activeRole: "tutor",
  });
  assert.equal(A.getUser().id, user.id);
  assert.match(
    A.issue(),
    /apenas (?:nesta página|enquanto esta página)|Não foi possível persistir/,
  );
});
