const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function boot(raw, storage) {
  const memory = storage || { raw: raw ?? null, quota: false };
  const context = vm.createContext({
    window: {},
    console,
    crypto: require("node:crypto").webcrypto,
    localStorage: {
      getItem: () => memory.raw,
      setItem: (key, value) => {
        if (memory.quota) {
          const e = Error("quota");
          e.name = "QuotaExceededError";
          throw e;
        }
        memory.raw = value;
      },
    },
  });
  for (const file of [
    "src/constants.js",
    "src/storage.js",
    "src/validation.js",
    "src/store.js",
  ])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  return { S: context.window.BPStore, R: context.window.BPRules, memory };
}
const alert = {
  type: "perdido",
  name: "Luna",
  species: "cao",
  city: "Campo Grande - MS",
  region: "Centro",
  place: "Praça pública",
  seenDate: "2026-01-01",
  description: "Cachorra caramelo com coleira azul.",
};
const sight = {
  place: "Praça central",
  seenAt: "2026-01-01T12:00:00Z",
  description: "Cão caramelo com coleira azul",
  source: "direta",
};
const task = {
  title: "Verificar a praça",
  place: "Praça central",
  assigneeId: "local",
};
test("publicação exige aceite e ignora campos de controle enviados", () => {
  const { S } = boot();
  assert.throws(() => S.publish(alert, "local"), /aceite/);
  S.accept("Tutor teste");
  const id = S.publish(
    { ...alert, status: "reencontrado", ownerId: "community" },
    "local",
  );
  const a = S.get().alerts.find((a) => a.id === id);
  assert.equal(a.status, "ativo");
  assert.equal(a.ownerId, "local");
});
test("validação rejeita data inexistente, futuro, imagem e espécie inválidos", () => {
  const { R } = boot();
  for (const bad of [
    { seenDate: "2025-02-30" },
    { seenDate: "2999-01-01" },
    { image: "javascript:alert(1)" },
    { species: "invalida" },
    { reward: -1 },
  ])
    assert.throws(() => R.alertData({ ...alert, ...bad }));
});
test("migração v2 preserva alertas e acrescenta estruturas da central", () => {
  const { S } = boot();
  const old = S.get();
  old.version = 2;
  delete old.tasks;
  delete old.participations;
  const { S: m } = boot(JSON.stringify(old));
  assert.equal(m.get().alerts.length, 3);
  assert.equal(m.get().version, 3);
  assert.equal(m.get().tasks.length, 0);
});
test("dados corrompidos ficam exportáveis e não são sobrescritos", () => {
  const { S, memory } = boot("{broken");
  assert.throws(() => S.favorite("hex"), /Exporte/);
  assert.equal(memory.raw, "{broken");
  assert.equal(S.export(), "{broken");
});
test("quota preserva estado anterior na memória e no armazenamento", () => {
  const { S, memory } = boot();
  S.accept("Tutor teste");
  const before = JSON.stringify(S.get()),
    raw = memory.raw;
  memory.quota = true;
  assert.throws(() => S.createTask("hex", task, "local"), /espaço/);
  assert.equal(JSON.stringify(S.get()), before);
  assert.equal(memory.raw, raw);
});
test("aba desatualizada não sobrescreve gravação da outra aba", () => {
  const first = boot();
  first.S.accept("Tutor teste");
  const second = boot(null, first.memory);
  first.S.favorite("hex");
  assert.throws(() => second.S.favorite("bold"), /outra aba/);
  assert.equal(JSON.stringify(first.S.get().favorites), '["hex"]');
});
test("somente responsável revisa pista e justificativa é exigida", () => {
  const { S } = boot();
  S.sighting("hex", sight, "community");
  const id = S.get().sightings[0].id;
  assert.throws(
    () => S.reviewSighting(id, "compativel", "Mesma coleira", "community"),
    /responsável/,
  );
  assert.throws(() => S.reviewSighting(id, "compativel", "", "local"));
  S.reviewSighting(id, "compativel", "Mesma coleira", "local");
  assert.equal(S.get().sightings[0].review, "compativel");
});
test("duplicatas exigem origem da mesma busca e impedem ciclos", () => {
  const { S } = boot();
  S.sighting("hex", sight, "local");
  const a = S.get().sightings[0].id;
  S.sighting("hex", sight, "local");
  const b = S.get().sightings[0].id;
  assert.throws(() =>
    S.reviewSighting(b, "duplicada", "Mesmo relato", "local", b),
  );
  S.reviewSighting(b, "duplicada", "Mesmo relato", "local", a);
  assert.throws(() =>
    S.reviewSighting(a, "duplicada", "Mesmo relato", "local", b),
  );
});
test("colaborador precisa participar, só altera tarefa atribuída e perde acesso ao ser revogado", () => {
  const { S } = boot();
  assert.throws(() =>
    S.createTask("hex", { ...task, assigneeId: "community" }, "local"),
  );
  S.participant("hex", "community", true, "local");
  assert.equal(S.canCoordinate("hex", "community"), true);
  S.createTask("hex", task, "local");
  const own = S.get().tasks[0].id;
  assert.throws(() => S.updateTask(own, "em_andamento", "", "", "community"));
  S.createTask("hex", { ...task, assigneeId: "community" }, "local");
  const id = S.get().tasks[0].id;
  S.updateTask(id, "em_andamento", "", "", "community");
  S.participant("hex", "community", false, "local");
  assert.equal(S.canCoordinate("hex", "community"), false);
  assert.equal(S.get().tasks[0].assigneeId, "local");
  assert.throws(() => S.updateTask(id, "em_andamento", "", "", "community"));
});
test("concluir tarefa exige resultado e método, sem reabrir tarefa finalizada", () => {
  const { S } = boot();
  S.createTask("hex", task, "local");
  const id = S.get().tasks[0].id;
  assert.throws(() => S.updateTask(id, "concluida", "", "", "local"));
  S.updateTask(
    id,
    "concluida",
    "Animal não avistado",
    "Observação pela calçada",
    "local",
  );
  assert.throws(
    () => S.updateTask(id, "pendente", "", "", "local"),
    /finalizada/,
  );
});
test("encerrar como localizado não conta como reencontro e cancela tarefas abertas", () => {
  const { S } = boot();
  S.createTask("hex", task, "local");
  S.resolve(
    "hex",
    "local",
    "localizado",
    "Visto pelo tutor, ainda sem captura.",
  );
  assert.equal(S.get().alerts[0].status, "localizado");
  assert.equal(S.get().tasks[0].status, "cancelada");
  assert.throws(() => S.sighting("hex", sight, "local"));
  S.reopen("hex", "local", "Animal voltou a se deslocar.");
  assert.equal(S.get().alerts[0].status, "ativo");
  assert.equal(S.get().tasks[0].status, "cancelada");
  assert.equal(S.get().audit[0].action, "Reabrir busca");
});
test("suspensão bloqueia colaboração e ações na central", () => {
  const { S } = boot();
  S.account("local", true, "Suspensão de teste", "moderador");
  assert.throws(() => S.sighting("hex", sight, "local"), /suspensa/);
  assert.throws(() => S.createTask("hex", task, "local"), /suspensa/);
  assert.throws(
    () => S.resolve("hex", "local", "cancelado", "Teste de fechamento"),
    /suspensa/,
  );
});
test("moderação bloqueia operações até revisão e mantém histórico", () => {
  const { S } = boot();
  const id = S.report(
    "hex",
    {
      category: "Informação falsa",
      description: "Relato inconsistente para teste",
    },
    "community",
  );
  S.moderate(id, "ocultar", "Ocultado para análise do relato", "moderador");
  assert.equal(S.canCoordinate("hex", "local"), false);
  assert.throws(() => S.sighting("hex", sight, "local"));
  S.appeal(id, "Peço revisão do relato apresentado", "local");
  S.moderate(id, "manter", "Informações revisadas no exemplo", "moderador");
  assert.equal(S.canCoordinate("hex", "local"), true);
  assert.equal(S.get().reports[0].history.length, 3);
});
test("apagar dados limpa também tarefas e participações", () => {
  const { S } = boot();
  S.participant("hex", "community", true, "local");
  S.createTask("hex", task, "local");
  S.erase();
  const s = S.get();
  for (const key of [
    "alerts",
    "sightings",
    "tasks",
    "participations",
    "audit",
    "reports",
    "favorites",
  ])
    assert.equal(s[key].length, 0);
});

test("camada de domínio rejeita denúncia forjada pela interface", () => {
  const { S } = boot();
  assert.throws(
    () =>
      S.report(
        "hex",
        { category: "motivo inventado", description: "Descrição suficiente" },
        "community",
      ),
    /Motivo inválido/,
  );
});

test("migração rejeita referências quebradas sem sobrescrever a origem", () => {
  const original = boot();
  const invalid = original.S.get();
  invalid.alerts[0].ownerId = "conta-inexistente";
  const { S, memory } = boot(JSON.stringify(invalid));
  assert.match(S.issue(), /não puderam ser lidos/);
  assert.equal(S.export(), memory.raw);
});
