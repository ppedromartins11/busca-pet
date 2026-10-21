/* Operações do domínio sobre uma cópia transacional do estado local. */
(() => {
  "use strict";
  const C = window.BPConfig;
  const Storage = window.BPStorage;
  const KEY = C.storage.domain;
  const R = window.BPRules;
  const POLICY_VERSION = C.policyVersion;
  const id = () =>
    "bp-" +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2));
  const today = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  };
  function seed() {
    const date = today();
    return {
      version: C.dataVersion,
      tasks: [],
      participations: [],
      profile: {
        id: "local",
        name: "Tutor de demonstração",
        acceptedVersion: null,
        acceptedAt: null,
      },
      accounts: [
        {
          id: "local",
          name: "Tutor de demonstração",
          suspended: false,
          acceptedVersion: null,
          acceptedAt: null,
        },
        {
          id: "community",
          name: "Colaborador de demonstração",
          suspended: false,
          acceptedVersion: null,
          acceptedAt: null,
        },
        {
          id: "moderador-demo",
          name: "Moderador de demonstração",
          suspended: false,
          acceptedVersion: null,
          acceptedAt: null,
        },
      ],
      alerts: [
        {
          id: "hex",
          ownerId: "local",
          name: "Hex",
          species: "cao",
          breed: "Golden Retriever",
          age: "7 anos",
          city: "Campo Grande - MS",
          region: "Leste",
          place: "Próximo ao Parque das Nações",
          seenDate: date,
          reward: 5000,
          description:
            "Dócil, usa coleira vermelha. Este alerta é um exemplo fictício para demonstrar o projeto.",
          type: "perdido",
        },
        {
          id: "bold",
          ownerId: "community",
          name: "Bold",
          species: "cao",
          breed: "Sem raça definida",
          age: "3 anos",
          city: "Campo Grande - MS",
          region: "Bálsamo",
          place: "Próximo à praça do bairro",
          seenDate: date,
          reward: 0,
          description:
            "Animal encontrado próximo à praça. Exemplo fictício, sem contato real.",
          type: "encontrado",
        },
        {
          id: "gargamel",
          ownerId: "community",
          name: "Gargamel",
          species: "gato",
          breed: "Gato cinza",
          age: "7 anos",
          city: "Campo Grande - MS",
          region: "Centro",
          place: "Região central",
          seenDate: date,
          reward: 1000,
          description:
            "Gato cinza com peito branco. Exemplo fictício para demonstração.",
          type: "perdido",
        },
      ].map((a) => ({
        ...a,
        status: "ativo",
        visibility: "visivel",
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        contact: "",
        contactPublic: false,
        image: "",
        demo: true,
      })),
      sightings: [],
      reports: [],
      audit: [],
      favorites: [],
    };
  }
  let state,
    issue = "",
    corrupt = false,
    baseline = null;
  try {
    const stored = Storage.readRaw(localStorage, KEY);
    if (!stored.ok) throw stored.error;
    baseline = stored.value;
    state = R.migrate(baseline ? JSON.parse(baseline) : seed());
  } catch (error) {
    state = seed();
    if (
      error instanceof SyntaxError ||
      error.message === "Dados incompatíveis"
    ) {
      corrupt = true;
      issue =
        "Os dados salvos não puderam ser lidos. Exportar dados preserva o conteúdo original. Use “Restaurar exemplos” somente depois de guardar uma cópia.";
    } else
      issue =
        "O navegador bloqueou o armazenamento. Os registros ficarão apenas nesta sessão.";
  }
  function save(next, force = false) {
    if (corrupt && !force)
      throw Error(
        "Dados anteriores não puderam ser lidos. Exporte-os e restaure os exemplos antes de continuar.",
      );
    const serialized = JSON.stringify(next);
    const written = Storage.writeRaw(localStorage, KEY, serialized);
    if (written.ok) {
      baseline = serialized;
      issue = "";
      corrupt = false;
    } else {
      const error = written.error;
      if (error.name === "QuotaExceededError")
        throw Error(
          "O espaço do navegador está cheio. Exporte os dados e use uma foto menor ou remova a foto do formulário.",
        );
      issue =
        "Armazenamento bloqueado: as alterações desta sessão serão perdidas ao fechar ou recarregar a página.";
    }
    state = next;
    return !issue;
  }
  function checkConflict() {
    const stored = Storage.readRaw(localStorage, KEY);
    if (!stored.ok) return;
    const raw = stored.value;
    if (raw !== baseline)
      throw Error(
        "Os dados mudaram em outra aba. Recarregue para evitar sobrescrever alterações. O texto do formulário de publicação fica em rascunho nesta aba.",
      );
  }
  function transaction(change) {
    checkConflict();
    const next = Storage.clone(state);
    change(next);
    return save(next);
  }
  function assertActive(s, userId) {
    const account = s.accounts.find((u) => u.id === userId);
    if (!account) throw Error("Perfil de demonstração inválido.");
    if (account.suspended)
      throw Error(
        "Esta conta de demonstração está suspensa. Consulte a moderação.",
      );
  }
  function requireAction(action, userId) {
    window.BPPermissions?.require(action, { userId });
  }
  function owned(s, key, userId, active = false) {
    assertActive(s, userId);
    const a = s.alerts.find((x) => x.id === key);
    if (!a || a.ownerId !== userId)
      throw Error("Somente o responsável pode gerenciar esta busca.");
    if (a.visibility !== "visivel" || (active && a.status !== "ativo"))
      throw Error("A busca está encerrada ou sob moderação.");
    return a;
  }
  function canCoordinate(s, key, userId) {
    return s.alerts.some(
      (a) =>
        a.id === key &&
        a.visibility === "visivel" &&
        (a.ownerId === userId ||
          s.participations.some(
            (p) => p.alertId === key && p.userId === userId,
          )),
    );
  }
  function log(s, action, target, reason, actor = "moderador-demo") {
    s.audit.unshift({
      id: id(),
      action,
      target,
      reason,
      actor,
      at: new Date().toISOString(),
    });
  }
  window.BPStore = {
    KEY,
    POLICY_VERSION,
    id,
    today,
    get: () => Storage.clone(state),
    issue: () => issue,
    accept(name, userId = "local") {
      name = R.text(name, "Nome", 2, 60);
      return transaction((s) => {
        const account = s.accounts.find((x) => x.id === userId);
        if (!account) throw Error("Conta de demonstração inválida.");
        account.name = name;
        account.acceptedVersion = POLICY_VERSION;
        account.acceptedAt = new Date().toISOString();
        if (userId === "local") {
          s.profile.name = name;
          s.profile.acceptedVersion = POLICY_VERSION;
          s.profile.acceptedAt = account.acceptedAt;
        }
      });
    },
    registerAccount(data) {
      const name = R.text(data.name, "Nome", 2, 80);
      const accountId = R.identifier(data.id, "Conta");
      return transaction((s) => {
        const existing = s.accounts.find((x) => x.id === accountId);
        if (existing) {
          existing.name = name;
          return;
        }
        s.accounts.push({
          id: accountId,
          name,
          suspended: false,
          acceptedVersion: data.acceptedVersion || null,
          acceptedAt: data.acceptedAt || null,
        });
      });
    },
    publish(data, userId) {
      data = R.alertData(data);
      let key;
      transaction((s) => {
        requireAction("publishAlert", userId);
        assertActive(s, userId);
        const account = s.accounts.find((x) => x.id === userId);
        if (account?.acceptedVersion !== POLICY_VERSION)
          throw Error(
            "Ative o perfil de tutor e aceite os termos para publicar.",
          );
        key = id();
        s.alerts.unshift({
          ...data,
          id: key,
          ownerId: userId,
          status: "ativo",
          visibility: "visivel",
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          demo: false,
        });
      });
      return key;
    },
    edit(key, data, userId) {
      data = R.alertData(data);
      return transaction((s) => {
        requireAction("editAlert", userId);
        assertActive(s, userId);
        const a = s.alerts.find((x) => x.id === key);
        if (!a || a.ownerId !== userId)
          throw Error("Somente o autor pode editar este alerta.");
        if (a.visibility !== "visivel")
          throw Error(
            "A publicação está sob moderação. Solicite revisão pela área de denúncias.",
          );
        Object.assign(a, data, { updatedAt: new Date().toISOString() });
      });
    },
    resolve(key, userId, outcome = "reencontrado", note = "") {
      ({ outcome, note } = R.closureData(outcome, note));
      return transaction((s) => {
        requireAction("resolveAlert", userId);
        const a = owned(s, key, userId);
        if (a.status !== "ativo") throw Error("Esta busca já foi encerrada.");
        a.status = outcome;
        a.resolvedAt = new Date().toISOString();
        a.resolutionNote = note;
        for (const t of s.tasks.filter(
          (t) =>
            t.alertId === key &&
            ["pendente", "em_andamento"].includes(t.status),
        )) {
          t.status = "cancelada";
          t.result = "Busca encerrada pelo responsável.";
          t.updatedAt = a.resolvedAt;
        }
        log(
          s,
          "Encerrar busca",
          key,
          R.outcomes[outcome] + ": " + note,
          userId,
        );
      });
    },
    reopen(key, userId, reason) {
      reason = R.justification(reason, "Motivo");
      return transaction((s) => {
        requireAction("reopenAlert", userId);
        const a = owned(s, key, userId);
        if (a.status === "ativo") throw Error("Esta busca já está ativa.");
        log(
          s,
          "Reabrir busca",
          key,
          reason + " (resultado anterior: " + R.outcomes[a.status] + ")",
          userId,
        );
        a.status = "ativo";
        a.resolvedAt = null;
        a.resolutionNote = "";
      });
    },
    canCoordinate(key, userId) {
      return canCoordinate(state, key, userId);
    },
    participant(key, userId, enabled, actorId) {
      return transaction((s) => {
        requireAction("manageParticipant", actorId);
        owned(s, key, actorId, true);
        assertActive(s, userId);
        if (userId === actorId)
          throw Error("O responsável já participa da busca.");
        s.participations = s.participations.filter(
          (p) => !(p.alertId === key && p.userId === userId),
        );
        if (enabled)
          s.participations.push({
            alertId: key,
            userId,
            joinedAt: new Date().toISOString(),
          });
        else
          s.tasks
            .filter(
              (t) =>
                t.alertId === key &&
                t.assigneeId === userId &&
                !["concluida", "cancelada"].includes(t.status),
            )
            .forEach((t) => {
              t.assigneeId = actorId;
              t.status = "pendente";
            });
        log(
          s,
          enabled ? "Incluir colaborador" : "Revogar colaborador",
          key,
          "Perfil local: " + userId,
          actorId,
        );
      });
    },
    reviewSighting(id, status, reason, userId, duplicateOf = "") {
      ({ status, reason } = R.reviewData(status, reason));
      return transaction((s) => {
        requireAction("reviewSighting", userId);
        const v = s.sightings.find((x) => x.id === id);
        if (!v) throw Error("Pista não encontrada.");
        owned(s, v.alertId, userId, true);
        if (
          status === "duplicada" &&
          !s.sightings.some(
            (x) =>
              x.id === duplicateOf &&
              x.id !== id &&
              x.alertId === v.alertId &&
              x.review !== "duplicada",
          )
        )
          throw Error(
            "Selecione uma pista original desta busca, que não seja duplicada.",
          );
        if (
          status === "duplicada" &&
          s.sightings.some((x) => x.duplicateOf === id)
        )
          throw Error(
            "Esta pista já é origem de outra. Revise as duplicatas antes de alterar sua origem.",
          );
        v.review = status;
        v.reviewReason = reason;
        v.reviewedAt = new Date().toISOString();
        v.duplicateOf = status === "duplicada" ? duplicateOf : "";
        log(
          s,
          "Revisar pista",
          v.alertId,
          R.reviews[status] + ": " + reason,
          userId,
        );
      });
    },
    createTask(key, data, userId) {
      const clean = R.taskData(data);
      return transaction((s) => {
        requireAction("createTask", userId);
        owned(s, key, userId, true);
        assertActive(s, clean.assigneeId);
        if (!canCoordinate(s, key, clean.assigneeId))
          throw Error(
            "O responsável pela tarefa precisa participar desta busca.",
          );
        if (
          clean.sightingId &&
          !s.sightings.some(
            (v) => v.id === clean.sightingId && v.alertId === key,
          )
        )
          throw Error("Pista inválida para esta busca.");
        s.tasks.unshift({
          ...clean,
          id: id(),
          alertId: key,
          status: "pendente",
          result: "",
          method: "",
          createdAt: new Date().toISOString(),
        });
        log(s, "Criar tarefa", key, clean.title, userId);
      });
    },
    updateTask(id, status, result, method, userId) {
      ({ status, result, method } = R.taskResult(status, result, method));
      return transaction((s) => {
        requireAction("updateTask", userId);
        assertActive(s, userId);
        const t = s.tasks.find((x) => x.id === id),
          a = s.alerts.find((x) => x.id === t?.alertId);
        if (!a || a.status !== "ativo" || a.visibility !== "visivel")
          throw Error("A busca não permite alterar tarefas.");
        if (
          !canCoordinate(s, a.id, userId) ||
          (t.assigneeId !== userId && a.ownerId !== userId)
        )
          throw Error(
            "Somente o responsável pela busca ou tarefa pode alterá-la.",
          );
        if (["concluida", "cancelada"].includes(t.status))
          throw Error(
            "Esta tarefa já foi finalizada. Crie outra para uma nova verificação.",
          );
        t.status = status;
        t.result = result;
        t.method = method;
        t.updatedAt = new Date().toISOString();
        log(
          s,
          "Atualizar tarefa",
          a.id,
          t.title +
            ": " +
            R.taskStates[status] +
            (result ? " — " + result : ""),
          userId,
        );
      });
    },
    favorite(key) {
      return transaction((s) => {
        if (!s.alerts.some((alert) => alert.id === key))
          throw Error("Alerta não encontrado.");
        s.favorites = s.favorites.includes(key)
          ? s.favorites.filter((x) => x !== key)
          : [...s.favorites, key];
      });
    },
    sighting(key, data, userId) {
      data = R.sightingData(data);
      return transaction((s) => {
        requireAction("createSighting", userId);
        assertActive(s, userId);
        const a = s.alerts.find((x) => x.id === key);
        if (!a || a.status !== "ativo" || a.visibility !== "visivel")
          throw Error("Este alerta não recebe novos avistamentos.");
        s.sightings.unshift({
          ...data,
          id: id(),
          alertId: key,
          userId,
          createdAt: new Date().toISOString(),
        });
      });
    },
    report(key, data, userId) {
      data = R.reportData(data);
      let result;
      transaction((s) => {
        requireAction("createReport", userId);
        assertActive(s, userId);
        const a = s.alerts.find((x) => x.id === key);
        if (!a || a.visibility !== "visivel")
          throw Error("A publicação não está disponível.");
        if (
          s.reports.some(
            (r) =>
              r.alertId === key &&
              r.by === userId &&
              ["pendente", "em_analise", "em_revisao"].includes(r.status),
          )
        )
          throw Error(
            "Você já tem uma denúncia em andamento para este alerta.",
          );
        result = id();
        s.reports.unshift({
          ...data,
          id: result,
          alertId: key,
          by: userId,
          status: "pendente",
          createdAt: new Date().toISOString(),
          decision: null,
          reason: "",
          appeal: "",
          history: [],
        });
        log(s, "Denúncia recebida", result, data.category, userId);
      });
      return result;
    },
    moderate(key, action, reason, mode) {
      ({ action, reason } = R.moderationData(action, reason));
      return transaction((s) => {
        window.BPPermissions?.require("moderate", {
          userId: window.BPAuth?.getCurrentUser()?.id,
        });
        if (mode !== "moderador") throw Error("Selecione o modo de moderação.");
        const r = s.reports.find((x) => x.id === key);
        if (!r) throw Error("Denúncia não encontrada.");
        if (r.status === "concluida")
          throw Error(
            "Esta denúncia já foi decidida. Uma contestação permite revisão.",
          );
        const a = s.alerts.find((x) => x.id === r.alertId);
        if (action === "analisar") r.status = "em_analise";
        else {
          r.status = "concluida";
          r.decision = action;
          if (a)
            a.visibility = {
              manter: "visivel",
              ocultar: "oculto",
              remover: "removido",
            }[action];
        }
        r.reason = reason;
        r.updatedAt = new Date().toISOString();
        r.history.push({ action, reason, at: r.updatedAt });
        log(s, action, r.id, reason);
      });
    },
    appeal(key, text, userId) {
      text = R.justification(text, "Contestação", 10, 800);
      return transaction((s) => {
        const r = s.reports.find((x) => x.id === key);
        const a = s.alerts.find((x) => x.id === r?.alertId);
        if (
          !r ||
          r.status !== "concluida" ||
          (r.by !== userId && a?.ownerId !== userId)
        )
          throw Error("Esta decisão não está disponível para contestação.");
        r.appeal = text;
        r.status = "em_revisao";
        r.history.push({
          action: "contestar",
          reason: text,
          at: new Date().toISOString(),
        });
        log(s, "Contestação", key, text, userId);
      });
    },
    account(key, suspended, reason, mode) {
      reason = R.justification(reason, "Justificativa", 10, 800);
      const result = transaction((s) => {
        window.BPPermissions?.require("manageAccount", {
          userId: window.BPAuth?.getCurrentUser()?.id,
        });
        if (mode !== "moderador") throw Error("Selecione o modo de moderação.");
        const u = s.accounts.find((x) => x.id === key);
        if (!u) throw Error("Conta não encontrada.");
        u.suspended = suspended;
        log(s, suspended ? "Suspender conta" : "Reativar conta", key, reason);
      });
      window.BPAuth?.setAccountStatus?.(key, suspended ? "suspended" : "active");
      return result;
    },
    export() {
      if (corrupt) {
        const stored = Storage.readRaw(localStorage, KEY);
        return stored.ok ? stored.value : null;
      }
      return JSON.stringify(state, null, 2);
    },
    reset() {
      checkConflict();
      return save(seed(), true);
    },
    erase() {
      checkConflict();
      const next = {
        ...seed(),
        alerts: [],
        sightings: [],
        reports: [],
        audit: [],
        favorites: [],
      };
      return save(next, true);
    },
  };
})();
