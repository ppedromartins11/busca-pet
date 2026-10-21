/* Valores compartilhados. Nenhum módulo deve redefinir papéis ou estados. */
(() => {
  "use strict";

  const roles = {
    public: ["tutor", "colaborador", "parceiro"],
    all: ["tutor", "colaborador", "parceiro", "moderador", "administrador"],
    names: {
      tutor: "Tutor",
      colaborador: "Colaborador",
      parceiro: "Parceiro",
      moderador: "Moderador",
      administrador: "Administrador",
    },
    homes: {
      tutor: "#painel-tutor",
      colaborador: "#painel-colaborador",
      parceiro: "#painel-parceiro",
      moderador: "#admin",
      administrador: "#minha-conta",
    },
  };

  const outcomes = {
    reencontrado: "Reencontrado com o tutor",
    localizado: "Localizado, ainda sem reencontro",
    obito: "Encontrado sem vida",
    cancelado: "Busca cancelada",
    duplicado: "Ocorrência duplicada",
  };
  const reviews = {
    pendente: "A revisar",
    compativel: "Compatível na revisão",
    incompativel: "Incompatível na revisão",
    duplicada: "Pista duplicada",
  };
  const taskStates = {
    pendente: "Pendente",
    em_andamento: "Em andamento",
    concluida: "Concluída",
    cancelada: "Cancelada",
  };

  window.BPConfig = Object.freeze({
    appVersion: "0.5.0",
    dataVersion: 3,
    policyVersion: "0.3-academica-2026-09-26",
    storage: Object.freeze({
      domain: "buscapet.v2",
      accounts: "buscapet.auth.accounts.v1",
      localSession: "buscapet.auth.session.v1",
      tabSession: "buscapet.auth.tab-session.v1",
      resetEmail: "buscapet.auth.reset-email.v1",
      returnTo: "buscapet.auth.return-to",
      draftPrefix: "buscapet.draft:",
    }),
    roles: Object.freeze(roles),
    domain: Object.freeze({ outcomes, reviews, taskStates }),
    ui: Object.freeze({
      species: { cao: "Cão", gato: "Gato", outro: "Outro" },
      reportStatuses: {
        pendente: "Pendente",
        em_analise: "Em análise",
        concluida: "Concluída",
        em_revisao: "Em revisão",
      },
      moderationDecisions: {
        analisar: "Em análise",
        manter: "Manter publicação",
        ocultar: "Ocultar publicação",
        remover: "Remover publicação",
      },
      reportReasons: [
        "Suspeita de golpe",
        "Informação falsa",
        "Exposição de dados",
        "Ameaça ou assédio",
        "Maus-tratos",
        "Outro",
      ],
    }),
  });
})();
