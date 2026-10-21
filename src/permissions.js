/*
 * Autenticação responde quem é a pessoa; este módulo responde se a função
 * ativa pode iniciar uma operação. Relações com o recurso continuam no domínio.
 */
(() => {
  "use strict";

  const actionRoles = Object.freeze({
    publishAlert: ["tutor"],
    editAlert: ["tutor"],
    resolveAlert: ["tutor"],
    reopenAlert: ["tutor"],
    manageParticipant: ["tutor"],
    reviewSighting: ["tutor"],
    createTask: ["tutor"],
    updateTask: ["tutor", "colaborador"],
    createSighting: ["tutor", "colaborador"],
    createReport: ["tutor", "colaborador", "parceiro"],
    moderate: ["moderador"],
    manageAccount: ["moderador"],
  });

  function can(action, resource = {}) {
    const auth = window.BPAuth;
    // A ausência do provedor não pode liberar uma operação por engano.
    // Os testes isolados registram um BPAuth mínimo quando precisam exercitar
    // esta camada; em produção, a autorização decisiva permanece no RLS.
    if (!auth) return false;
    const user = auth.getCurrentUser();
    const activeRole = auth.getActiveRole();
    const allowed = actionRoles[action];
    if (
      !user ||
      !allowed ||
      !allowed.includes(activeRole) ||
      !auth.hasRole(activeRole) ||
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
      throw Error("A função ativa não permite esta ação.");
    return true;
  }

  window.BPPermissions = {
    actionRoles,
    can,
    require,
    requireSession: () => window.BPAuth?.requireSession(),
    requireRole: (role) => window.BPAuth?.requireRole(role),
  };
})();
