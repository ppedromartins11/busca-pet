const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function storage() {
  const values = new Map();
  return {
    get length() { return values.size; }, key: (index) => [...values.keys()][index] || null,
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key), dump: () => Object.fromEntries(values),
  };
}
function field(type, value = "") { return { type, value, checked: false, files: [], listeners: {}, addEventListener(event, listener) { this.listeners[event] = listener; } }; }
function form(fields) {
  return {
    elements: { namedItem: (name) => fields[name] || null },
    addEventListener() {}, querySelectorAll: () => Object.values(fields).filter((item) => item.type === "file"),
  };
}
function boot() {
  const localStorage = storage();
  const listeners = {};
  const context = vm.createContext({ window: { localStorage, addEventListener: (event, listener) => { listeners[event] = listener; } }, setTimeout, clearTimeout, Date, encodeURIComponent, Object });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/drafts.js"), "utf8"), context);
  return { drafts: context.window.BPDrafts, localStorage, pagehide: () => listeners.pagehide() };
}

test("rascunho restaura somente campos permitidos para a mesma conta", () => {
  const { drafts } = boot();
  const fields = { name: field("text", "Luna"), region: field("text", "Centro"), location_consent: field("checkbox") };
  drafts.attach(form(fields), { userId: "conta-a", formType: "pet", fields: ["name", "region"] });
  drafts.write({ version: 1, userId: "conta-a", formType: "pet", recordId: "new", updatedAt: Date.now(), values: { name: "Luna", region: "Centro", location_consent: true }, hadFiles: false });
  const restored = { name: field("text"), region: field("text"), location_consent: field("checkbox") };
  const result = drafts.attach(form(restored), { userId: "conta-a", formType: "pet", fields: ["name", "region"] });
  assert.equal(result.restored, true);
  assert.equal(restored.name.value, "Luna");
  assert.equal(restored.region.value, "Centro");
  assert.equal(restored.location_consent.checked, false);
  const other = { name: field("text") };
  assert.equal(drafts.attach(form(other), { userId: "conta-b", formType: "pet", fields: ["name"] }).restored, false);
  assert.equal(other.name.value, "");
});

test("rascunho expira, não supera servidor mais novo e limpa somente a conta encerrada", () => {
  const { drafts, localStorage } = boot();
  drafts.write({ version: 1, userId: "conta-a", formType: "occurrence-lost", recordId: "id", updatedAt: Date.now() - drafts.TTL - 1, values: { city: "Cuiabá" }, hadFiles: true });
  assert.equal(drafts.read("conta-a", "occurrence-lost", "id"), null);
  drafts.write({ version: 1, userId: "conta-a", formType: "pet", recordId: "new", updatedAt: Date.now(), values: { name: "Luna" }, hadFiles: false });
  drafts.write({ version: 1, userId: "conta-b", formType: "pet", recordId: "new", updatedAt: Date.now(), values: { name: "Mia" }, hadFiles: false });
  const restored = { name: field("text") };
  assert.equal(drafts.attach(form(restored), { userId: "conta-a", formType: "pet", fields: ["name"], serverUpdatedAt: new Date(Date.now() + 1000).toISOString() }).restored, false);
  drafts.clearUser("conta-a");
  assert.equal(drafts.read("conta-a", "pet", "new"), null);
  assert.equal(drafts.read("conta-b", "pet", "new").values.name, "Mia");
  assert.equal(JSON.stringify(localStorage.dump()).includes("token"), false);
});

test("pagehide descarrega alteração pendente sem depender do tempo do debounce", () => {
  const { drafts, pagehide } = boot();
  const fields = { description: field("text", "Texto ainda no debounce") };
  drafts.attach(form(fields), { userId: "conta-a", formType: "sighting", recordId: "alerta", fields: ["description"] });
  pagehide();
  assert.equal(drafts.read("conta-a", "sighting", "alerta").values.description, "Texto ainda no debounce");
});
