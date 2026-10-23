/* Metadados e decisão de acesso das rotas por hash. */
(() => {
  "use strict";

  const C = window.BPConfig;
  const routes = Object.freeze({
    post: { requiresAuth: true, common: true },
    publicar: { requiresAuth: true, common: true },
    editar: { requiresAuth: true, common: true },
    operacao: { requiresAuth: true, common: true },
    avistamento: { requiresAuth: true, common: true },
    denunciar: {
      requiresAuth: true,
      roles: ["tutor", "colaborador", "parceiro"],
    },
    denuncias: {
      requiresAuth: true,
      roles: ["tutor", "colaborador", "parceiro"],
    },
    perfil: { requiresAuth: true },
    "minha-conta": { requiresAuth: true },
    "painel-tutor": { requiresAuth: true, common: true },
    "painel-colaborador": {
      requiresAuth: true,
      roles: ["colaborador"],
    },
    "painel-parceiro": { requiresAuth: true, roles: ["parceiro"] },
    admin: { requiresAuth: true, roles: ["administrador"] },
  });

  function parse(hash) {
    const parts = String(hash || "#home").replace(/^#/, "").split("/");
    let key = "", detail = "";
    try {
      key = decodeURIComponent(parts[1] || "");
    } catch {
      key = "";
    }
    try {
      detail = decodeURIComponent(parts[2] || "");
    } catch {
      detail = "";
    }
    return { route: parts[0] || "home", key, detail };
  }

  function access(route) {
    const meta = routes[route];
    if (!meta?.requiresAuth) return { status: "allowed", meta };
    const auth = window.BPAuth;
    if (!auth.getSession())
      return {
        status: "login",
        expired: auth.consumeSessionExpired(),
        meta,
      };
    const user = auth.getCurrentUser();
    if (!user || user.status !== "active")
      return { status: "limited", meta, availableRoles: [] };
    if (user && !user.emailVerified)
      return { status: "verify-email", meta };
    if (meta.common && !["tutor", "colaborador"].some((role) => auth.hasRole(role)))
      return { status: "limited", meta, availableRoles: [] };
    if (
      meta.roles?.length &&
      !meta.roles.some((role) => auth.hasRole(role))
    )
      return {
        status: "limited",
        meta,
        availableRoles: meta.roles.filter((role) => auth.hasRole(role)),
      };
    return { status: "allowed", meta };
  }

  function remember(hash) {
    window.BPStorage.writeRaw(
      sessionStorage,
      C.storage.returnTo,
      hash || "#home",
    );
  }

  function takeRemembered() {
    const saved = window.BPStorage.readRaw(sessionStorage, C.storage.returnTo);
    window.BPStorage.remove(sessionStorage, C.storage.returnTo);
    return saved.ok ? saved.value || "" : "";
  }

  window.BPRouter = { routes, parse, access, remember, takeRemembered };
})();
