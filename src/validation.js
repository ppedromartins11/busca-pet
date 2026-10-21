/* Validação reutilizável de identidade, domínio e migração. */
(() => {
  "use strict";
  const C = window.BPConfig;
  const { outcomes, reviews, taskStates } = C.domain;
  function text(value, label, min = 0, max = 1200) {
    const result = String(value ?? "").trim();
    if (result.length < min || result.length > max)
      throw Error(`${label}: informe de ${min} a ${max} caracteres.`);
    return result;
  }
  function choice(value, allowed, label) {
    if (!allowed.includes(value)) throw Error(`${label} inválido.`);
    return value;
  }
  function identifier(value, label = "Identificador") {
    const result = text(value, label, 1, 120);
    if (!/^[A-Za-z0-9._:@-]+$/.test(result)) throw Error(`${label} inválido.`);
    return result;
  }
  function number(value, label, min, max) {
    const result = Number(value);
    if (!Number.isFinite(result) || result < min || result > max)
      throw Error(`${label} inválido.`);
    return result;
  }
  function justification(value, label = "Justificativa", min = 5, max = 800) {
    return text(value, label, min, max);
  }
  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }
  function email(value) {
    const normalized = normalizeEmail(value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      throw Error("Informe um e-mail válido.");
    return normalized;
  }
  function password(value) {
    const clean = String(value || "");
    if (clean.length < 8)
      throw Error("Use uma senha com pelo menos 8 caracteres.");
    return clean;
  }
  function publicRoles(values) {
    return [
      ...new Set((values || []).filter((role) => C.roles.public.includes(role))),
    ];
  }
  function signUpData(data) {
    const errors = {};
    let cleanEmail = normalizeEmail(data.email);
    const name = String(data.name || "").trim();
    const roles = publicRoles(data.roles);
    if (name.length < 2 || name.length > 80)
      errors.name = "Informe um nome entre 2 e 80 caracteres.";
    try {
      cleanEmail = email(cleanEmail);
    } catch (error) {
      errors.email = error.message;
    }
    try {
      password(data.password);
    } catch (error) {
      errors.password = error.message;
    }
    if (String(data.password || "") !== String(data.passwordConfirmation || ""))
      errors.passwordConfirmation = "As senhas precisam ser iguais.";
    if (!roles.length) errors.roles = "Escolha ao menos uma forma de participar.";
    if (roles.length > 1 && !roles.includes(data.activeRole))
      errors.activeRole = "Escolha uma área inicial entre as funções selecionadas.";
    if (!data.acceptTerms) errors.acceptTerms = "Aceite os Termos de Uso.";
    if (!data.acceptPrivacy)
      errors.acceptPrivacy = "Confirme a leitura da Política de Privacidade.";
    if (roles.includes("parceiro")) {
      const partner = data.partner || {};
      for (const [key, label] of [
        ["organizationType", "tipo de organização"],
        ["publicName", "nome público"],
        ["city", "cidade"],
        ["region", "bairro ou região"],
        ["responsible", "responsável"],
      ])
        if (!String(partner[key] || "").trim())
          errors[`partner.${key}`] = `Informe ${label}.`;
      if (!partner.representationConfirmed)
        errors["partner.representationConfirmed"] =
          "Confirme que você representa a organização.";
    }
    return {
      valid: Object.keys(errors).length === 0,
      errors,
      name,
      email: cleanEmail,
      roles,
    };
  }
  function date(value, dateOnly = false) {
    const raw = String(value || "");
    if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(raw))
      throw Error("Informe uma data válida.");
    const result = new Date(dateOnly ? `${raw}T12:00:00` : raw);
    const localToday = new Date();
    localToday.setHours(23, 59, 59, 999);
    if (
      !Number.isFinite(result.valueOf()) ||
      result > (dateOnly ? localToday : new Date())
    )
      throw Error("Informe uma data válida, sem horário futuro.");
    if (
      dateOnly &&
      `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, "0")}-${String(result.getDate()).padStart(2, "0")}` !==
        raw
    )
      throw Error("Data inexistente.");
    return dateOnly ? raw : result.toISOString();
  }
  function image(value) {
    if (!value) return "";
    if (
      typeof value !== "string" ||
      value.length > 600000 ||
      !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value)
    )
      throw Error("Foto inválida. Use o envio de imagem do formulário.");
    return value;
  }
  function alertData(d) {
    const reward = number(d.reward || 0, "Recompensa", 0, 1000000);
    const contact = text(d.contact, "Contato", 0, 100);
    if (d.contactPublic && !contact)
      throw Error("Informe o contato ou desmarque sua divulgação.");
    return {
      type: choice(d.type, ["perdido", "encontrado"], "Tipo"),
      species: choice(d.species, ["cao", "gato", "outro"], "Espécie"),
      name: text(d.name, "Identificação", 1, 60),
      breed: text(d.breed, "Raça", 0, 60),
      age: text(d.age, "Idade", 0, 25),
      city: text(d.city, "Cidade", 1, 80),
      region: text(d.region, "Região", 1, 60),
      place: text(d.place, "Local", 1, 120),
      seenDate: date(d.seenDate, true),
      description: text(d.description, "Descrição", 10, 1200),
      reward,
      contact,
      contactPublic: d.contactPublic === true,
      image: image(d.image),
    };
  }
  function sightingData(d) {
    return {
      place: text(d.place, "Local", 1, 120),
      seenAt: date(d.seenAt),
      description: text(d.description, "Observação", 5, 600),
      source: choice(d.source || "direta", ["direta", "encaminhada"], "Origem"),
      timeApproximate: d.timeApproximate === true,
      image: image(d.image),
      review: "pendente",
      reviewReason: "",
      reviewedAt: null,
    };
  }
  function closureData(outcome, note) {
    return {
      outcome: choice(outcome, Object.keys(outcomes), "Resultado"),
      note: justification(note, "Resumo do encerramento"),
    };
  }
  function reviewData(status, reason) {
    return {
      status: choice(status, Object.keys(reviews), "Revisão"),
      reason: justification(reason, "Justificativa", 5, 600),
    };
  }
  function taskData(data) {
    return {
      title: text(data.title, "Tarefa", 5, 100),
      place: text(data.place, "Local", 1, 120),
      assigneeId: identifier(data.assigneeId, "Responsável"),
      sightingId: data.sightingId
        ? identifier(data.sightingId, "Pista")
        : "",
    };
  }
  function taskResult(status, result, method) {
    const cleanStatus = choice(
      status,
      Object.keys(taskStates),
      "Situação da tarefa",
    );
    return {
      status: cleanStatus,
      result: text(
        result,
        "Resultado",
        ["concluida", "cancelada"].includes(cleanStatus) ? 5 : 0,
        600,
      ),
      method: text(
        method,
        "Método de verificação",
        cleanStatus === "concluida" ? 3 : 0,
        120,
      ),
    };
  }
  function reportData(data) {
    return {
      category: choice(data.category, C.ui.reportReasons, "Motivo"),
      description: text(data.description, "Descrição", 10, 1000),
    };
  }
  function moderationData(action, reason) {
    return {
      action: choice(
        action,
        Object.keys(C.ui.moderationDecisions),
        "Decisão",
      ),
      reason: justification(reason, "Motivo", 10, 800),
    };
  }
  // Migração mantém a chave v2: os dados existentes não precisam ser descartados.
  function migrate(s) {
    if (
      !s ||
      ![2, C.dataVersion].includes(s.version) ||
      !s.profile ||
      typeof s.profile.name !== "string"
    )
      throw Error("Dados incompatíveis");
    for (const key of [
      "accounts",
      "alerts",
      "sightings",
      "reports",
      "audit",
      "favorites",
    ]) {
      if (!Array.isArray(s[key])) throw Error("Dados incompatíveis");
    }
    if (
      !s.accounts.some((u) => u?.id === "local") ||
      !s.accounts.some((u) => u?.id === "community")
    )
      throw Error("Dados incompatíveis");
    if (!s.accounts.some((u) => u?.id === "moderador-demo"))
      s.accounts.push({
        id: "moderador-demo",
        name: "Moderador de demonstração",
        suspended: false,
      });
    for (const key of ["accounts", "alerts", "sightings", "reports", "audit"]) {
      if (
        s[key].some((v) => !v || typeof v.id !== "string") ||
        new Set(s[key].map((v) => v.id)).size !== s[key].length
      )
        throw Error("Dados incompatíveis");
    }
    if (
      s.alerts.some(
        (a) =>
          typeof a.name !== "string" ||
          typeof a.region !== "string" ||
          typeof a.city !== "string" ||
          !["ativo", ...Object.keys(outcomes)].includes(a.status),
      )
    )
      throw Error("Dados incompatíveis");
    if (
      s.reports.some((r) => !Array.isArray(r.history)) ||
      s.audit.some((e) => typeof e.target !== "string")
    )
      throw Error("Dados incompatíveis");
    if (
      s.version === C.dataVersion &&
      (!Array.isArray(s.tasks) || !Array.isArray(s.participations))
    )
      throw Error("Dados incompatíveis");
    s.tasks ??= [];
    s.participations ??= [];
    if (
      s.tasks.some(
        (t) =>
          !t ||
          typeof t.id !== "string" ||
          !Object.hasOwn(taskStates, t.status),
      ) ||
      s.participations.some((p) => !p || typeof p.userId !== "string")
    )
      throw Error("Dados incompatíveis");
    if (
      s.accounts.some((u) => typeof u.name !== "string") ||
      s.favorites.some((id) => typeof id !== "string") ||
      new Set(s.favorites).size !== s.favorites.length ||
      new Set(
        s.participations.map((item) => `${item.alertId}:${item.userId}`),
      ).size !== s.participations.length
    )
      throw Error("Dados incompatíveis");
    s.accounts.forEach((u) => {
      u.suspended = u.suspended === true;
      u.acceptedVersion ??= u.id === "local" ? s.profile.acceptedVersion : null;
      u.acceptedAt ??= u.id === "local" ? s.profile.acceptedAt : null;
    });
    if (
      s.alerts.some(
        (a) =>
          !["visivel", "oculto", "removido"].includes(a.visibility) ||
          typeof a.ownerId !== "string" ||
          typeof a.seenDate !== "string",
      )
    )
      throw Error("Dados incompatíveis");
    if (
      s.sightings.some(
        (v) => typeof v.alertId !== "string" || typeof v.seenAt !== "string",
      ) ||
      s.tasks.some(
        (t) =>
          typeof t.alertId !== "string" || typeof t.assigneeId !== "string",
      ) ||
      new Set(s.tasks.map((t) => t.id)).size !== s.tasks.length
    )
      throw Error("Dados incompatíveis");
    const accountIds = new Set(s.accounts.map((item) => item.id));
    const alertIds = new Set(s.alerts.map((item) => item.id));
    const sightingIds = new Set(s.sightings.map((item) => item.id));
    if (
      s.alerts.some((item) => !accountIds.has(item.ownerId)) ||
      s.sightings.some(
        (item) =>
          !alertIds.has(item.alertId) ||
          !accountIds.has(item.userId),
      ) ||
      s.participations.some(
        (item) =>
          !alertIds.has(item.alertId) || !accountIds.has(item.userId),
      ) ||
      s.tasks.some(
        (item) =>
          !alertIds.has(item.alertId) ||
          !accountIds.has(item.assigneeId) ||
          (item.sightingId && !sightingIds.has(item.sightingId)),
      ) ||
      s.reports.some(
        (item) => !alertIds.has(item.alertId) || !accountIds.has(item.by),
      ) ||
      s.favorites.some((id) => !alertIds.has(id))
    )
      throw Error("Dados incompatíveis");
    s.sightings.forEach((v) => {
      v.source ??= "nao_informada";
      v.review ??= "pendente";
      v.image ??= "";
      v.reviewReason ??= "";
      if (
        !["direta", "encaminhada", "nao_informada"].includes(v.source) ||
        !Object.hasOwn(reviews, v.review)
      )
        throw Error("Dados incompatíveis");
    });
    s.version = C.dataVersion;
    return s;
  }
  window.BPRules = {
    outcomes,
    reviews,
    taskStates,
    text,
    choice,
    identifier,
    number,
    justification,
    normalizeEmail,
    email,
    password,
    publicRoles,
    signUpData,
    date,
    image,
    alertData,
    sightingData,
    closureData,
    reviewData,
    taskData,
    taskResult,
    reportData,
    moderationData,
    migrate,
  };
})();
