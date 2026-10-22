const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
function storage() { const values = new Map(); return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }; }
function boot() {
  let callback;
  const user = { id: "11111111-1111-1111-1111-111111111111", email: "tutor@example.test", created_at: "2026-01-01T00:00:00.000Z", email_confirmed_at: "2026-01-01T00:00:00.000Z" };
  let roles = [{ role: "tutor" }];
  const profile = { id: user.id, full_name: "Pessoa", active_role: "tutor", status: "active", created_at: user.created_at };
  const resultFor = (table) => ({
    select() { return this; },
    eq() { return this; },
    single: async () => ({ data: profile, error: null }),
    maybeSingle: async () => ({ data: table === "partner_profiles" ? null : null, error: null }),
    then(resolve, reject) { return Promise.resolve({ data: table === "user_roles" ? roles : [], error: null }).then(resolve, reject); },
  });
  const session = { user, expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const supabase = { auth: { getSession: async () => ({ data: { session }, error: null }), getUser: async () => ({ data: { user }, error: null }), onAuthStateChange: (next) => { callback = next; return { data: { subscription: { unsubscribe() {} } } }; }, signOut: async () => ({ error: null }) }, from: resultFor };
  const context = vm.createContext({ window: { BPSupabase: { client: supabase } }, localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout, console, location: { origin: "http://localhost", pathname: "/" } });
  for (const file of ["src/constants.js", "src/storage.js", "src/validation.js", "src/auth.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return { A: context.window.BPAuth, emit: (event) => callback(event, session), setRoles: (value) => { roles = value; } };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("TOKEN_REFRESHED não notifica a interface quando identidade e permissões não mudam", async () => {
  const { A, emit, setRoles } = boot();
  await A.ready;
  const changes = [];
  A.onChange((_, change) => changes.push(change));
  emit("TOKEN_REFRESHED");
  await tick();
  assert.equal(changes.length, 0);
  setRoles([{ role: "tutor" }, { role: "colaborador" }]);
  emit("USER_UPDATED");
  await tick();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "identity-or-permissions-changed");
  emit("SIGNED_OUT");
  assert.equal(changes.at(-1).signedOutUserId, "11111111-1111-1111-1111-111111111111");
});
