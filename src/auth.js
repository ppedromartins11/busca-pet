/*
 * Contrato BPAuth para Supabase Auth e para a demonstração local legada.
 *
 * Com o Supabase configurado, a sessão vem do SDK e as funções do banco/RLS.
 * Sem configuração, o modo legado simula identidade apenas neste navegador;
 * ele não oferece autenticação segura. Nenhuma senha é gravada pelo modo legado.
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
  const supabase = window.BPSupabase?.client;
  if (supabase) {
    const ONBOARDING_KEY = "buscapet.auth.pending-onboarding.v1";
    const listeners = new Set();
    let currentSession = null;
    let currentUser = null;
    let recoveryGranted = false;
    let sessionExpired = false;
    let authIssue = "";
    let authEpoch = 0;
    let explicitAuthOperation = false;
    const copy = (value) => value == null ? null : JSON.parse(JSON.stringify(value));
    const normalizedEmail = V.normalizeEmail;
    const authError = (code, message, details = {}) => Object.assign(Error(message), { code, ...details });
    const comparableUser = (value) => value && JSON.stringify({
      id: value.id, email: value.email, roles: [...value.roles].sort(), activeRole: value.activeRole,
      status: value.status, partnerStatus: value.partner?.status || null,
    });
    const notify = (change) => {
      for (const listener of listeners) {
        try { listener(copy(currentUser), change); } catch { authIssue = "Não foi possível atualizar a interface de sessão."; }
      }
    };
    const unwrap = (result, message) => {
      if (result.error) throw authError(result.error.code || "SUPABASE_ERROR", message || result.error.message);
      return result.data;
    };
    const sessionView = (session) => session ? {
      userId: session.user.id,
      createdAt: session.user.created_at,
      expiresAt: new Date(session.expires_at * 1000).toISOString(),
      persistent: true,
    } : null;
    const setEmpty = (expired = false, reason = "signed-out") => {
      const previousUserId = currentUser?.id || null;
      const hadIdentity = Boolean(currentSession || currentUser);
      authEpoch += 1;
      currentSession = null;
      currentUser = null;
      recoveryGranted = false;
      sessionExpired ||= expired;
      if (hadIdentity) notify({ kind: reason, relevant: true, signedOutUserId: previousUserId });
    };
    const pendingRead = () => {
      try {
        const pending = JSON.parse(localStorage.getItem(ONBOARDING_KEY) || "null");
        if (!pending) return null;
        if (Date.now() - pending.createdAt > 7 * 86400000) {
          localStorage.removeItem(ONBOARDING_KEY);
          return null;
        }
        return pending;
      } catch { return null; }
    };
    const pendingWrite = (pending) => {
      try {
        if (pending) localStorage.setItem(ONBOARDING_KEY, JSON.stringify(pending));
        else localStorage.removeItem(ONBOARDING_KEY);
      } catch { authIssue = "Não foi possível guardar as opções de cadastro neste navegador."; }
    };
    async function completeOnboarding(user) {
      const pending = pendingRead();
      if (!pending || pending.userId !== user.id || pending.email !== normalizedEmail(user.email)) return;
      // As opções locais são apenas pedidos: as políticas RLS decidem cada concessão.
      unwrap(await supabase.from("profiles").update({
        accepted_terms_at: pending.acceptedAt,
        accepted_privacy_at: pending.acceptedAt,
      }).eq("id", user.id), "Não foi possível registrar a aceitação dos termos.");
      if (pending.roles.includes("colaborador")) {
        const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role: "colaborador" });
        if (error && error.code !== "23505") throw authError(error.code || "ROLE_ERROR", "Não foi possível solicitar a função Colaborador.");
      }
      if (pending.roles.includes("parceiro") && pending.partner) {
        const { data: existing, error: lookupError } = await supabase.from("partner_profiles")
          .select("user_id").eq("user_id", user.id).maybeSingle();
        if (lookupError) throw authError(lookupError.code || "PARTNER_ERROR", "Não foi possível consultar a solicitação de parceiro.");
        if (!existing) unwrap(await supabase.from("partner_profiles").insert({
          user_id: user.id,
          organization_type: pending.partner.organizationType,
          public_name: pending.partner.publicName,
          city: pending.partner.city,
          region: pending.partner.region,
          responsible_name: pending.partner.responsible,
          cnpj: pending.partner.cnpj || null,
        }), "Não foi possível enviar a solicitação de parceiro.");
      }
      if (pending.activeRole === "colaborador")
        unwrap(await supabase.rpc("switch_active_role", { p_role: "colaborador" }), "Não foi possível ativar a função Colaborador.");
      pendingWrite(null);
    }
    async function hydrate(session, { onboarding = true, event = "INITIAL_SESSION" } = {}) {
      if (!session) { setEmpty(false, "signed-out"); return null; }
      const epoch = authEpoch;
      const { data: identity, error: identityError } = await supabase.auth.getUser();
      if (identityError || !identity?.user || identity.user.id !== session.user.id)
        throw authError(identityError?.code || "SESSION_INVALID", "Sessão inválida. Entre novamente.");
      if (onboarding) await completeOnboarding(identity.user);
      const [profileResult, rolesResult, partnerResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,active_role,status,created_at").eq("id", identity.user.id).single(),
        supabase.from("user_roles").select("role").eq("user_id", identity.user.id),
        supabase.from("partner_profiles").select("organization_type,public_name,city,region,responsible_name,cnpj,status")
          .eq("user_id", identity.user.id).maybeSingle(),
      ]);
      const profile = unwrap(profileResult, "Não foi possível carregar seu perfil.");
      const roles = unwrap(rolesResult, "Não foi possível carregar suas funções.");
      const partner = unwrap(partnerResult, "Não foi possível carregar a solicitação de parceiro.");
      if (epoch !== authEpoch) return copy(currentUser);
      if (profile.status !== "active") {
        await supabase.auth.signOut();
        setEmpty(false, "account-suspended");
        throw authError("ACCOUNT_SUSPENDED", "Esta conta está suspensa. Consulte a moderação.");
      }
      const granted = roles.map((row) => row.role).filter((role) => ALL_ROLES.includes(role));
      if (!granted.includes(profile.active_role))
        throw authError("ROLE_INCONSISTENT", "O perfil contém uma função sem concessão válida.");
      const previousComparable = comparableUser(currentUser);
      currentSession = sessionView(session);
      currentUser = {
        id: identity.user.id,
        name: profile.full_name,
        email: identity.user.email,
        roles: granted,
        activeRole: profile.active_role,
        status: profile.status,
        emailVerified: Boolean(identity.user.email_confirmed_at),
        createdAt: profile.created_at,
        partner: partner ? {
          organizationType: partner.organization_type,
          publicName: partner.public_name,
          city: partner.city,
          region: partner.region,
          responsible: partner.responsible_name,
          cnpj: partner.cnpj,
          status: partner.status,
        } : null,
      };
      const changed = previousComparable !== comparableUser(currentUser);
      if (changed) notify({
        kind: previousComparable ? "identity-or-permissions-changed" : "signed-in",
        event, relevant: true,
      });
      return copy(currentUser);
    }
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") recoveryGranted = true;
      if (event === "SIGNED_OUT") { setEmpty(false, "signed-out"); return; }
      if (explicitAuthOperation && event === "SIGNED_IN") return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "PASSWORD_RECOVERY") {
        // A chamada ao Data API deve ocorrer fora do callback do GoTrue.
        setTimeout(() => hydrate(session, { event }).catch((error) => {
          authIssue = error.message;
          // Falha transitória de perfil no refresh não é logout.
          if (event !== "TOKEN_REFRESHED") setEmpty(false, "session-invalid");
        }), 0);
      }
    });
    const ready = (async () => {
      try {
        const data = unwrap(await supabase.auth.getSession(), "Não foi possível recuperar a sessão.");
        if (data.session) await hydrate(data.session, { event: "INITIAL_SESSION" });
      } catch (error) {
        authIssue = error.message;
        setEmpty();
      }
    })();
    async function signIn(email, password) {
      await ready;
      let cleanEmail;
      try { cleanEmail = V.email(email); } catch (error) { throw authError("INVALID_EMAIL", error.message); }
      if (!String(password || "")) throw authError("INVALID_CREDENTIALS", "Informe sua senha.");
      explicitAuthOperation = true;
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          if (error.code === "email_not_confirmed")
            throw authError("EMAIL_UNVERIFIED", "Confirme seu e-mail antes de entrar.", { email: cleanEmail });
          if (error.code === "invalid_credentials")
            throw authError("INVALID_CREDENTIALS", "E-mail ou senha inválidos.");
          if (error.status === 429 || /rate_limit/.test(error.code || ""))
            throw authError("RATE_LIMIT", "Muitas tentativas. Aguarde antes de entrar novamente.");
          throw authError("AUTH_UNAVAILABLE", "Não foi possível entrar agora. Tente novamente.");
        }
        return await hydrate(data.session);
      } finally {
        explicitAuthOperation = false;
      }
    }
    async function signUp(data) {
      const validation = V.signUpData(data);
      if (!validation.valid) throw authError("VALIDATION_ERROR", "Revise os campos indicados.", { fields: validation.errors });
      const password = V.password(data.password);
      const redirect = `${location.origin}${location.pathname}#login`;
      explicitAuthOperation = true;
      try {
        const result = await supabase.auth.signUp({
          email: validation.email, password,
          options: { data: { full_name: validation.name }, emailRedirectTo: redirect },
        });
        if (result.error) {
          if (["user_already_exists", "email_exists"].includes(result.error.code))
            throw authError("EMAIL_IN_USE", "Se este e-mail já estiver cadastrado, entre ou recupere sua senha.");
          throw authError(result.error.code || "SIGNUP_ERROR", result.error.message);
        }
        if (!result.data.user) throw authError("SIGNUP_ERROR", "Não foi possível concluir o cadastro.");
        pendingWrite({
          userId: result.data.user.id,
          email: validation.email,
          roles: validation.roles,
          activeRole: data.activeRole,
          partner: validation.roles.includes("parceiro") ? data.partner : null,
          acceptedAt: new Date().toISOString(),
          createdAt: Date.now(),
        });
        if (result.data.session) return { ...(await hydrate(result.data.session)), needsEmailConfirmation: false };
        return {
          id: result.data.user.id, name: validation.name, email: validation.email,
          roles: [], activeRole: null, status: "active", emailVerified: false,
          needsEmailConfirmation: true,
        };
      } finally {
        explicitAuthOperation = false;
      }
    }
    async function signOut() {
      unwrap(await supabase.auth.signOut(), "Não foi possível encerrar a sessão.");
      setEmpty();
    }
    async function requestPasswordReset(email) {
      let cleanEmail;
      try { cleanEmail = V.email(email); } catch (error) { throw authError("INVALID_EMAIL", error.message); }
      const redirectTo = `${location.origin}${location.pathname}?auth=reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (error) throw authError(error.code || "RESET_ERROR", "Não foi possível solicitar a recuperação agora. Tente novamente.");
      return { message: "Se houver uma conta vinculada a esse e-mail, enviaremos as instruções para redefinir a senha." };
    }
    async function updatePassword(password, confirmation) {
      await ready;
      if (!recoveryGranted) throw authError("TOKEN_INVALID", "Abra o link válido de recuperação enviado por e-mail.");
      let cleanPassword;
      try { cleanPassword = V.password(password); } catch (error) { throw authError("WEAK_PASSWORD", error.message); }
      if (cleanPassword !== String(confirmation || "")) throw authError("PASSWORD_MISMATCH", "As senhas precisam ser iguais.");
      unwrap(await supabase.auth.updateUser({ password: cleanPassword }), "Não foi possível alterar a senha. Solicite um novo link.");
      recoveryGranted = false;
      await signOut();
      return { changed: true };
    }
    async function setActiveRole(role) {
      if (!currentUser) throw authError("SESSION_REQUIRED", "Entre para continuar.");
      if (!currentUser.roles.includes(role)) throw authError("ROLE_NOT_ALLOWED", "Esta função não foi concedida à sua conta.");
      unwrap(await supabase.rpc("switch_active_role", { p_role: role }), "Não foi possível trocar de função.");
      await refresh();
      return role;
    }
    async function addRole(role, partner = null) {
      if (!currentUser) throw authError("SESSION_REQUIRED", "Entre para continuar.");
      if (role === "colaborador") {
        if (!currentUser.roles.includes(role)) {
          const { error } = await supabase.from("user_roles").insert({ user_id: currentUser.id, role });
          if (error && error.code !== "23505") throw authError(error.code || "ROLE_ERROR", "Não foi possível solicitar a função.");
        }
      } else if (role === "parceiro" && partner) {
        unwrap(await supabase.from("partner_profiles").insert({
          user_id: currentUser.id, organization_type: partner.organizationType,
          public_name: partner.publicName, city: partner.city, region: partner.region,
          responsible_name: partner.responsible, cnpj: partner.cnpj || null,
        }), "Não foi possível enviar a solicitação de parceiro.");
      } else throw authError("ROLE_NOT_PUBLIC", "Esta função exige um fluxo de concessão autorizado.");
      return refresh();
    }
    async function updateEmail(email) {
      if (!currentUser) throw authError("SESSION_REQUIRED", "Entre para continuar.");
      let cleanEmail;
      try { cleanEmail = V.email(email); } catch (error) { throw authError("INVALID_EMAIL", error.message); }
      unwrap(await supabase.auth.updateUser({ email: cleanEmail }), "Não foi possível solicitar a alteração do e-mail.");
      return refresh();
    }
    async function resendVerification(email) {
      let cleanEmail;
      try { cleanEmail = V.email(email); } catch (error) { throw authError("INVALID_EMAIL", error.message); }
      unwrap(await supabase.auth.resend({ type: "signup", email: cleanEmail,
        options: { emailRedirectTo: `${location.origin}${location.pathname}#login` },
      }), "Não foi possível reenviar o e-mail agora.");
      return { message: "Se o cadastro estiver pendente, enviaremos outro e-mail de confirmação." };
    }
    async function refresh() {
      const { data } = await supabase.auth.getSession();
      return hydrate(data?.session);
    }
    const getSession = () => {
      if (currentSession && Date.parse(currentSession.expiresAt) <= Date.now()) setEmpty(true);
      return copy(currentSession);
    };
    const getUser = () => copy(currentUser);
    const getRoles = () => [...(currentUser?.roles || [])];
    const getActiveRole = () => currentUser?.activeRole || null;
    const hasRole = (role) => getRoles().includes(role);
    const hasAnyRole = (roles) => roles.some(hasRole);
    const requireSession = () => {
      const session = getSession();
      if (!session) throw authError("SESSION_REQUIRED", "Entre para continuar.");
      return session;
    };
    const requireRole = (role) => {
      requireSession();
      if (!hasRole(role) || getActiveRole() !== role)
        throw authError("ROLE_REQUIRED", "Esta área não está disponível para a função ativa.");
      return true;
    };
    window.BPAuth = {
      ready, initialize: () => ready, onChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      PUBLIC_ROLES: [...PUBLIC_ROLES],
      signIn, signUp, signOut, requestPasswordReset, updatePassword,
      getSession, getUser, getCurrentUser: getUser, getRoles, getActiveRole,
      hasRole, hasAnyRole, requireSession, requireRole, setActiveRole,
      addRole, updateEmail, resendVerification, refresh,
      canResetPassword: () => recoveryGranted,
      removeRole: async () => { throw authError("ROLE_NOT_ALLOWED", "A remoção de função ainda não está disponível."); },
      verifyEmail: () => { throw authError("EMAIL_VERIFICATION_REQUIRED", "Confirme seu e-mail pelo link recebido."); },
      setAccountStatus: async (id, status) => {
        requireSession();
        unwrap(await supabase.rpc("set_account_status", { p_user: id, p_status: status }), "Não foi possível alterar o status da conta.");
      },
      validateSignUp: V.signUpData, normalizeEmail: normalizedEmail,
      issue: () => authIssue,
      consumeSessionExpired: () => { const expired = sessionExpired; sessionExpired = false; return expired; },
      _accounts: () => currentUser ? [copy(currentUser)] : [],
    };
    return;
  }
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
