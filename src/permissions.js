/*
 * Autenticação responde quem é a pessoa; este módulo responde se a função
 * ativa pode iniciar uma operação. Relações com o recurso continuam no domínio.
 */
(() => {
  "use strict";

  const commonRoles = Object.freeze(["tutor", "colaborador"]);
  const actionRoles = Object.freeze({
    publishAlert: commonRoles, editAlert: commonRoles, resolveAlert: commonRoles,
    reopenAlert: commonRoles, manageParticipant: commonRoles, reviewSighting: commonRoles,
    createTask: commonRoles, updateTask: commonRoles, createSighting: commonRoles,
    createReport: ["tutor", "colaborador", "parceiro", "moderador", "administrador"],
    moderate: ["moderador", "administrador"], manageAccount: ["administrador"],
    viewAdminDashboard: ["administrador"],
  });

  function can(action, resource = {}) {
    const auth = window.BPAuth;
    // A ausência do provedor não pode liberar uma operação por engano.
    // Os testes isolados registram um BPAuth mínimo quando precisam exercitar
    // esta camada; em produção, a autorização decisiva permanece no RLS.
    if (!auth) return false;
    const user = auth.getCurrentUser();
    const allowed = actionRoles[action];
    if (
      !user ||
      !auth.getSession?.() ||
      (user.status && user.status !== "active") ||
      !allowed ||
      !allowed.some((role) => auth.hasRole(role)) ||
      (resource.userId && resource.userId !== user.id)
    )
      return false;
    if (resource.ownerId !== undefined && resource.ownerId !== user.id)
      return false;
    if (resource.canCoordinate === false) return false;
    if (
      resource.assigneeId !== undefined &&
      resource.assigneeId !== user.id &&
      resource.ownerId !== user.id
    )
      return false;
    return true;
  }

  function require(action, resource = {}) {
    if (!can(action, resource))
      throw Error("Sua conta não permite esta ação.");
    return true;
  }

  window.BPPermissions = {
    actionRoles,
    commonRoles,
    can,
    require,
    requireSession: () => window.BPAuth?.requireSession(),
    requireRole: (role) => window.BPAuth?.requireRole(role),
  };
})();
