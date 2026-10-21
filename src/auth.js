/*
 * Identidade e sessão da demonstração local.
 *
 * Esta abstração imita o contrato de um provedor de identidade, mas não oferece
 * autenticação segura. Senhas e tokens nunca são gravados no armazenamento.
 * Contas, funções e a sessão contêm apenas metadados necessários à interface.
 */
(() => {
  "use strict";

  const C = window.BPConfig;
  const V = window.BPRules;
  const Storage = window.BPStorage;
  const ACCOUNTS_KEY = C.storage.accounts;
  const LOCAL_SESSION_KEY = C.storage.localSession;
  const TAB_SESSION_KEY = C.storage.tabSession;
  const RESET_EMAIL_KEY = C.storage.resetEmail;
  const PUBLIC_ROLES = C.roles.public;
  const ALL_ROLES = C.roles.all;
  const SESSION_DURATION = 12 * 60 * 60 * 1000;
  const ephemeralPasswords = new Map();
  const demoPasswords = new Map([
    ["tutor@demo.buscapet", "BuscaPetDemo!"],
    ["colaborador@demo.buscapet", "BuscaPetDemo!"],
    ["moderador@demo.buscapet", "BuscaPetDemo!"],
  ]);
  let memoryAccounts = [];
  let memorySession = null;
  let storageIssue = "";
  let sessionExpired = false;

  const clone = Storage.clone;
  const now = () => new Date().toISOString();
  const normalizeEmail = V.normalizeEmail;
  const newId = () =>
    "user-" +
    (globalThis.crypto?.randomUUID?.() ||
      Date.now().toString(36) + Math.random().toString(36).slice(2));

  function readJSON(storage, key) {
    const read = Storage.readJSON(storage, key);
    if (!read.ok) {
      storageIssue =
        "O navegador bloqueou parte do armazenamento. A sessão funcionará apenas enquanto esta página permanecer aberta.";
      return null;
    }
    return read.value;
  }

  function writeJSON(storage, key, value) {
    const written = Storage.writeJSON(storage, key, value);
    if (!written.ok) {
      storageIssue =
        "Não foi possível persistir os dados de acesso. A alteração vale apenas nesta página.";
      return false;
    }
    return true;
  }

  function demoSeeds() {
    return [
      {
        id: "local",
        name: "Tutor de demonstração",
        email: "tutor@demo.buscapet",
        roles: ["tutor"],
        activeRole: "tutor",
        status: "active",
        emailVerified: true,
        createdAt: now(),
        demo: true,
      },
      {
        id: "community",
        name: "Colaborador de demonstração",
        email: "colaborador@demo.buscapet",
        roles: ["colaborador"],
        activeRole: "colaborador",
        status: "active",
        emailVerified: true,
        createdAt: now(),
        demo: true,
      },
      {
        id: "moderador-demo",
        name: "Moderador de demonstração",
        email: "moderador@demo.buscapet",
        roles: ["moderador"],
        activeRole: "moderador",
        status: "active",
        emailVerified: true,
        createdAt: now(),
        demo: true,
      },
    ];
  }

  function migrateAccounts(raw) {
    const saved = Array.isArray(raw) ? raw.filter((item) => item?.id) : [];
    const byId = new Map(saved.map((item) => [item.id, item]));
    for (const seed of demoSeeds()) {
      const existing = byId.get(seed.id);
      byId.set(seed.id, existing ? { ...seed, ...existing } : seed);
    }
    const storeAccounts = window.BPStore?.get?.().accounts || [];
    for (const account of storeAccounts) {
      if (byId.has(account.id)) {
        if (["local", "community", "moderador-demo"].includes(account.id))
          byId.get(account.id).status = account.suspended
            ? "suspended"
            : "active";
        continue;
      }
      byId.set(account.id, {
        id: account.id,
        name: account.name,
        email: `${account.id}@demo.buscapet`,
        roles: account.id === "community" ? ["colaborador"] : ["tutor"],
        activeRole: account.id === "community" ? "colaborador" : "tutor",
        status: account.suspended ? "suspended" : "active",
        emailVerified: true,
        createdAt: now(),
        demo: true,
      });
    }
    return [...byId.values()].map((account) => {
      const roles = [...new Set((account.roles || []).filter((r) => ALL_ROLES.includes(r)))];
      const safeRoles = roles.length ? roles : ["tutor"];
      return {
        ...account,
        email: normalizeEmail(account.email),
        roles: safeRoles,
        activeRole: safeRoles.includes(account.activeRole)
          ? account.activeRole
          : safeRoles[0],
        status: ["active", "suspended"].includes(account.status)
          ? account.status
          : "active",
      };
    });
  }

  function persistAccounts() {
    writeJSON(localStorage, ACCOUNTS_KEY, memoryAccounts);
  }

  function loadSession() {
    const local = readJSON(localStorage, LOCAL_SESSION_KEY);
    const tab = readJSON(sessionStorage, TAB_SESSION_KEY);
    memorySession = local || tab || memorySession;
    if (memorySession && new Date(memorySession.expiresAt).valueOf() <= Date.now()) {
      sessionExpired = true;
      clearSession();
      return null;
    }
    if (
      memorySession &&
      !memoryAccounts.some((account) => account.id === memorySession.userId)
    ) {
      clearSession();
      return null;
    }
    return memorySession;
  }

  function clearSession() {
    writeJSON(localStorage, LOCAL_SESSION_KEY, null);
    writeJSON(sessionStorage, TAB_SESSION_KEY, null);
    memorySession = null;
  }

  function saveSession(userId, remember = false) {
    const account = memoryAccounts.find((item) => item.id === userId);
    if (!account) throw authError("INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
    memorySession = {
      userId,
      createdAt: now(),
      expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString(),
      persistent: Boolean(remember),
    };
    writeJSON(
      remember ? localStorage : sessionStorage,
      remember ? LOCAL_SESSION_KEY : TAB_SESSION_KEY,
      memorySession,
    );
    writeJSON(
      remember ? sessionStorage : localStorage,
      remember ? TAB_SESSION_KEY : LOCAL_SESSION_KEY,
      null,
    );
    return clone(memorySession);
  }

  function authError(code, message, details = {}) {
    const error = Error(message);
    error.code = code;
    Object.assign(error, details);
    return error;
  }

  function validatePassword(password) {
    try {
      return V.password(password);
    } catch (error) {
      throw authError(
        "WEAK_PASSWORD",
        error.message,
      );
    }
  }

  function validateSignUp(data) {
    return V.signUpData(data);
  }

  async function signUp(data) {
    const result = validateSignUp(data);
    if (!result.valid)
      throw authError("VALIDATION_ERROR", "Revise os campos indicados.", {
        fields: result.errors,
      });
    if (memoryAccounts.some((account) => account.email === result.email))
      throw authError(
        "EMAIL_IN_USE",
        "Este e-mail já está vinculado a uma conta de demonstração.",
      );
    const id = newId();
    const activeRole =
      result.roles.length === 1 ? result.roles[0] : data.activeRole;
    const partner = result.roles.includes("parceiro")
      ? {
          organizationType: String(data.partner.organizationType).trim(),
          publicName: String(data.partner.publicName).trim(),
          city: String(data.partner.city).trim(),
          region: String(data.partner.region).trim(),
          responsible: String(data.partner.responsible).trim(),
          cnpj: String(data.partner.cnpj || "").trim(),
          status: "pending",
        }
      : null;
    const account = {
      id,
      name: result.name,
      email: result.email,
      roles: result.roles,
      activeRole,
      status: "active",
      emailVerified: false,
      createdAt: now(),
      partner,
      demo: false,
    };
    memoryAccounts.push(account);
    ephemeralPasswords.set(id, validatePassword(data.password));
    persistAccounts();
    window.BPStore?.registerAccount?.({
      id,
      name: result.name,
      acceptedVersion: window.BPStore.POLICY_VERSION,
      acceptedAt: now(),
    });
    saveSession(id, Boolean(data.remember));
    return clone(account);
  }

  async function signIn(email, password, options = {}) {
    const normalized = normalizeEmail(email);
    const account = memoryAccounts.find((item) => item.email === normalized);
    const expected = account?.demo
      ? demoPasswords.get(normalized)
      : account
        ? ephemeralPasswords.get(account.id)
        : null;
    if (!account || !expected || String(password || "") !== expected)
      throw authError("INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
    if (account.status === "suspended")
      throw authError(
        "ACCOUNT_SUSPENDED",
        "Esta conta está suspensa. Consulte a moderação da demonstração.",
      );
    if (!account.emailVerified)
      throw authError(
        "EMAIL_UNVERIFIED",
        "Confirme o e-mail antes de entrar.",
        { email: account.email },
      );
    saveSession(account.id, Boolean(options.remember));
    return clone(account);
  }

  function signOut() {
    clearSession();
  }

  async function requestPasswordReset(email) {
    const normalized = normalizeEmail(email);
    if (!Storage.writeRaw(sessionStorage, RESET_EMAIL_KEY, normalized).ok)
      storageIssue =
        "Não foi possível guardar o estado da recuperação nesta aba.";
    return {
      message:
        "Se houver uma conta vinculada a esse e-mail, enviaremos as instruções para redefinir a senha.",
    };
  }

  async function updatePassword(password, confirmation, state = "valid") {
    if (state === "expired")
      throw authError("TOKEN_EXPIRED", "Este link de demonstração expirou.");
    if (state === "invalid")
      throw authError("TOKEN_INVALID", "Este link de demonstração é inválido.");
    if (state === "error")
      throw authError(
        "TEMPORARY_ERROR",
        "Não foi possível salvar agora. Tente novamente.",
      );
    password = validatePassword(password);
    if (password !== String(confirmation || ""))
      throw authError("PASSWORD_MISMATCH", "As senhas precisam ser iguais.");
    const resetEmail = Storage.readRaw(sessionStorage, RESET_EMAIL_KEY);
    const email = normalizeEmail(resetEmail.ok ? resetEmail.value : "");
    const account = memoryAccounts.find((item) => item.email === email);
    if (account && !account.demo) ephemeralPasswords.set(account.id, password);
    return { changed: true };
  }

  function getSession() {
    return loadSession() ? clone(memorySession) : null;
  }

  function getUser() {
    const session = loadSession();
    const account = session
      ? memoryAccounts.find((item) => item.id === session.userId)
      : null;
    return account ? clone(account) : null;
  }

  function getRoles() {
    return getUser()?.roles || [];
  }

  function getActiveRole() {
    return getUser()?.activeRole || null;
  }

  function hasRole(role) {
    return getRoles().includes(role);
  }

  function hasAnyRole(roles) {
    return roles.some(hasRole);
  }

  function setActiveRole(role) {
    const session = loadSession();
    const account = session
      ? memoryAccounts.find((item) => item.id === session.userId)
      : null;
    if (!account) throw authError("SESSION_REQUIRED", "Entre para continuar.");
    if (!account.roles.includes(role))
      throw authError(
        "ROLE_NOT_ALLOWED",
        "Esta função não foi concedida à sua conta.",
      );
    account.activeRole = role;
    persistAccounts();
    return role;
  }

  function requireSession() {
    const session = getSession();
    if (!session) throw authError("SESSION_REQUIRED", "Entre para continuar.");
    return session;
  }

  function requireRole(role) {
    requireSession();
    if (!hasRole(role) || getActiveRole() !== role)
      throw authError(
        "ROLE_REQUIRED",
        "Esta área não está disponível para a função ativa.",
      );
    return true;
  }

  function addRole(role, partner = null) {
    if (!PUBLIC_ROLES.includes(role))
      throw authError(
        "ROLE_NOT_PUBLIC",
        "Moderador e Administrador só podem ser concedidos pela administração.",
      );
    const account = memoryAccounts.find((item) => item.id === getSession()?.userId);
    if (!account) throw authError("SESSION_REQUIRED", "Entre para continuar.");
    if (!account.roles.includes(role)) account.roles.push(role);
    if (role === "parceiro" && partner)
      account.partner = { ...partner, status: "pending" };
    persistAccounts();
    return clone(account);
  }

  function removeRole(role) {
    const account = memoryAccounts.find((item) => item.id === getSession()?.userId);
    if (!account) throw authError("SESSION_REQUIRED", "Entre para continuar.");
    if (!PUBLIC_ROLES.includes(role))
      throw authError("ROLE_NOT_PUBLIC", "Esta função não pode ser removida aqui.");
    if (!account.roles.includes(role)) return clone(account);
    if (account.roles.length === 1)
      throw authError("LAST_ROLE", "A conta precisa manter ao menos uma função.");
    const state = window.BPStore?.get?.();
    if (
      role === "tutor" &&
      state?.alerts?.some(
        (alert) => alert.ownerId === account.id && alert.status === "ativo",
      )
    )
      throw authError(
        "ROLE_DEPENDENCY",
        "Encerre ou transfira suas buscas ativas antes de remover Tutor.",
      );
    if (
      role === "colaborador" &&
      state?.tasks?.some(
        (task) =>
          task.assigneeId === account.id &&
          ["pendente", "em_andamento"].includes(task.status),
      )
    )
      throw authError(
        "ROLE_DEPENDENCY",
        "Conclua ou transfira suas tarefas abertas antes de remover Colaborador.",
      );
    account.roles = account.roles.filter((item) => item !== role);
    if (account.activeRole === role) account.activeRole = account.roles[0];
    persistAccounts();
    return clone(account);
  }

  function verifyEmail(email) {
    const account = memoryAccounts.find(
      (item) => item.email === normalizeEmail(email) || item.id === getSession()?.userId,
    );
    if (account) {
      account.emailVerified = true;
      persistAccounts();
    }
    return Boolean(account);
  }

  function updateEmail(email) {
    const account = memoryAccounts.find((item) => item.id === getSession()?.userId);
    if (!account) throw authError("SESSION_REQUIRED", "Entre para continuar.");
    let normalized;
    try {
      normalized = V.email(email);
    } catch (error) {
      throw authError("INVALID_EMAIL", error.message);
    }
    account.email = normalized;
    account.emailVerified = false;
    persistAccounts();
    return clone(account);
  }

  function expireSession() {
    if (!memorySession) return;
    memorySession.expiresAt = new Date(Date.now() - 1000).toISOString();
    writeJSON(
      memorySession.persistent ? localStorage : sessionStorage,
      memorySession.persistent ? LOCAL_SESSION_KEY : TAB_SESSION_KEY,
      memorySession,
    );
  }

  function consumeSessionExpired() {
    const value = sessionExpired;
    sessionExpired = false;
    return value;
  }

  function setAccountStatus(id, status) {
    if (getActiveRole() !== "moderador" || !hasRole("moderador"))
      throw authError("ROLE_REQUIRED", "Somente a moderação pode alterar contas.");
    const account = memoryAccounts.find((item) => item.id === id);
    if (!account) throw authError("ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    account.status = status === "suspended" ? "suspended" : "active";
    persistAccounts();
    return clone(account);
  }

  memoryAccounts = migrateAccounts(readJSON(localStorage, ACCOUNTS_KEY));
  persistAccounts();
  loadSession();

  window.BPAuth = {
    ACCOUNTS_KEY,
    LOCAL_SESSION_KEY,
    TAB_SESSION_KEY,
    PUBLIC_ROLES: clone(PUBLIC_ROLES),
    signIn,
    signOut,
    signUp,
    requestPasswordReset,
    updatePassword,
    getSession,
    getUser,
    getCurrentUser: getUser,
    getRoles,
    getActiveRole,
    setActiveRole,
    hasRole,
    hasAnyRole,
    requireSession,
    requireRole,
    addRole,
    removeRole,
    verifyEmail,
    updateEmail,
    setAccountStatus,
    validateSignUp,
    normalizeEmail,
    issue: () => storageIssue,
    expireSession,
    consumeSessionExpired,
    _accounts: () => clone(memoryAccounts),
  };
})();
