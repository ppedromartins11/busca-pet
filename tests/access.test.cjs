const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function storage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function boot() {
  const state = {
    session: null,
    user: null,
    activeRole: null,
    expired: false,
  };
  const auth = {
    getSession: () => state.session,
    getCurrentUser: () => state.user,
    getActiveRole: () => state.activeRole,
    hasRole: (role) => state.user?.roles.includes(role) || false,
    consumeSessionExpired: () => {
      const expired = state.expired;
      state.expired = false;
      return expired;
    },
    requireSession: () => Boolean(state.session),
    requireRole: (role) => state.user?.roles.includes(role) || false,
  };
  const context = vm.createContext({
    window: { BPAuth: auth },
    sessionStorage: storage(),
  });
  for (const file of [
    "src/constants.js",
    "src/storage.js",
    "src/router.js",
    "src/permissions.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return {
    router: context.window.BPRouter,
    permissions: context.window.BPPermissions,
    state,
  };
}

test("rota pública não exige sessão", () => {
  const { router } = boot();
  assert.equal(router.access("home").status, "allowed");
});

test("guard preserva informação de sessão expirada", () => {
  const { router, state } = boot();
  state.expired = true;
  const first = router.access("publicar");
  assert.equal(first.status, "login");
  assert.equal(first.expired, true);
  assert.equal(router.access("publicar").expired, false);
});

test("guard mantém verificação de e-mail, mas não bloqueia conta comum pela função ativa", () => {
  const { router, state } = boot();
  state.session = { userId: "pessoa" };
  state.user = { id: "pessoa", emailVerified: false, status: "active", roles: ["tutor", "colaborador"] };
  state.activeRole = "tutor";
  assert.equal(router.access("operacao").status, "verify-email");
  state.user.emailVerified = true;
  state.activeRole = "parceiro";
  assert.equal(router.access("operacao").status, "allowed");
});

test("conta comum acessa publicação sem alternar função ativa", () => {
  const { router, state } = boot();
  state.session = { userId: "pessoa" };
  state.user = { id: "pessoa", emailVerified: true, status: "active", roles: ["tutor", "colaborador"] };
  state.activeRole = "colaborador";
  assert.equal(router.access("operacao").status, "allowed");
  assert.equal(router.access("publicar").status, "allowed");
});

test("permissão comum ignora função ativa, mas preserva relação com o recurso", () => {
  const { permissions, state } = boot();
  state.session = { userId: "pessoa" };
  state.user = { id: "pessoa", emailVerified: true, status: "active", roles: ["tutor", "colaborador"] };
  state.activeRole = "tutor";
  assert.equal(
    permissions.can("editAlert", { userId: "pessoa", ownerId: "pessoa" }),
    true,
  );
  assert.equal(
    permissions.can("editAlert", { userId: "pessoa", ownerId: "outra" }),
    false,
  );
  state.activeRole = "colaborador";
  assert.equal(permissions.can("editAlert", { userId: "pessoa" }), true);
});

test("administração exige papel concedido, não apenas active_role", () => {
  const { permissions, state } = boot();
  state.session = { userId: "pessoa" };
  state.user = { id: "pessoa", emailVerified: true, status: "active", roles: ["tutor"] };
  state.activeRole = "administrador";
  assert.equal(permissions.can("manageAccount", { userId: "pessoa" }), false);
  assert.equal(permissions.can("moderate"), false);
  state.activeRole = "moderador";
  assert.equal(permissions.can("moderate"), false);
  state.user.roles.push("administrador");
  state.activeRole = "tutor";
  assert.equal(permissions.can("manageAccount", { userId: "pessoa" }), true);
  assert.equal(permissions.can("moderate"), true);
  state.user.status = "suspended";
  assert.equal(permissions.can("moderate"), false);
});

test("moderação exige papel concedido e conta ativa, mas não exige active_role", () => {
  const { permissions, state } = boot();
  state.session = { userId: "pessoa" };
  state.user = { id: "pessoa", emailVerified: true, status: "active", roles: ["tutor"] };
  state.activeRole = "moderador";
  assert.equal(permissions.can("moderate"), false);
  state.user.roles.push("moderador");
  assert.equal(permissions.can("moderate"), true);
  state.activeRole = "tutor";
  assert.equal(permissions.can("moderate"), true);
  state.user.status = "suspended";
  assert.equal(permissions.can("moderate"), false);
});

test("rota administrativa local aceita papéis concedidos, mas dashboard exige administrador ativo", () => {
  const { router, permissions, state } = boot();
  state.session = { userId: "pessoa" };
  state.user = { id: "pessoa", emailVerified: true, status: "active", roles: ["tutor"] };
  state.activeRole = "administrador";
  assert.equal(router.access("admin").status, "limited");
  assert.equal(permissions.can("viewAdminDashboard"), false);
  state.user.roles.push("moderador");
  assert.equal(router.access("admin").status, "allowed");
  assert.equal(permissions.can("viewAdminDashboard"), false);
  state.user.roles.push("administrador");
  assert.equal(router.access("admin").status, "allowed");
  assert.equal(permissions.can("viewAdminDashboard"), true);
  state.user.status = "suspended";
  assert.equal(router.access("admin").status, "limited");
  assert.equal(permissions.can("viewAdminDashboard"), false);
});

test("rota administrativa preserva seção e identificador de detalhe", () => {
  const { router } = boot();
  const route = router.parse("#admin/usuarios/11111111-1111-4111-8111-111111111111");
  assert.equal(route.route, "admin");
  assert.equal(route.key, "usuarios");
  assert.equal(route.detail, "11111111-1111-4111-8111-111111111111");
});

test("retorno de login é consumido uma única vez", () => {
  const { router } = boot();
  router.remember("#operacao/hex");
  assert.equal(router.takeRemembered(), "#operacao/hex");
  assert.equal(router.takeRemembered(), "");
});
