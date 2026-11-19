// Explicit, browser-only preview for the modern UI. It never calls Supabase.
if ((import.meta.env.MODE === "presentation" || import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW === "true") && !window.BPSupabase?.configured) {
  const KEY = "bp.modern-preview.v1";
  const SESSION = "bp.modern-preview.session";
  const SESSION_ID = "bp.modern-preview.account-id";
  const RESET_ID = "bp.modern-preview.reset-account";
  const USER_ID = "00000000-0000-4000-8000-000000000001";
  const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
  const DEMO_PASSWORD = "BuscaPet@2026";
  const SAMPLE_TUTOR = { id: USER_ID, name: "Tutor BuscaPet", email: "tutor@buscapet.test", role: "tutor", status: "active" };
  const SAMPLE_ADMIN = { id: ADMIN_ID, name: "Administrador BuscaPet", email: "admin@buscapet.test", role: "admin", status: "active" };
  const listeners = new Set();
  const initial = () => ({ pets: [], occurrences: [], sightings: [], petPhotos: [], occurrencePhotos: [], occurrencePoints: [], sightingPoints: [], reports: [], adminHistory: [], tutorStatus: "active", accounts: [] });
  const read = () => {
    try { return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { throw Error("Não foi possível ler os dados deste dispositivo."); }
  };
  const write = (data) => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { throw Error("O armazenamento deste navegador está cheio ou indisponível."); }
  };
  const copy = (row) => row == null ? null : structuredClone(row);
  const currentRole = () => sessionStorage.getItem(SESSION);
  const currentId = () => sessionStorage.getItem(SESSION_ID) || USER_ID;
  const getRegistered = (email) => read().accounts.find((a) => a.email === String(email || "").trim().toLowerCase()) || null;
  const findAccount = (email) => {
    const key = String(email || "").trim().toLowerCase();
    return key === SAMPLE_TUTOR.email ? SAMPLE_TUTOR : key === SAMPLE_ADMIN.email ? SAMPLE_ADMIN : getRegistered(key);
  };
  const currentTutor = () => currentId() === USER_ID
    ? { ...SAMPLE_TUTOR, status: read().tutorStatus }
    : read().accounts.find((a) => a.id === currentId());
  const requireSession = () => {
    if (currentRole() !== "tutor" || currentTutor()?.status !== "active")
      throw Error("Entre com sua conta de tutor para continuar.");
    return currentTutor().id;
  };
  const requireAdmin = () => {
    if (currentRole() !== "admin") throw Error("Acesso restrito à administração.");
    return ADMIN_ID;
  };
  const hex = (bytes) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const makeSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
  const derive = async (password, salt) => {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return hex(new Uint8Array(await crypto.subtle.deriveBits({
      name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120000, hash: "SHA-256",
    }, material, 256)));
  };
  const notify = (kind) => listeners.forEach((listener) => listener(auth.getCurrentUser(), { kind, relevant: true }));
  async function demoSignIn(email, password) {
    const account = findAccount(email);
    const valid = account && ([USER_ID, ADMIN_ID].includes(account.id)
      ? password === DEMO_PASSWORD
      : await derive(password, account.salt) === account.passwordHash);
    if (!valid) throw Error("E-mail ou senha inválidos.");
    if (account.status !== "active" || (account.id === USER_ID && read().tutorStatus !== "active"))
      throw Error("Esta conta está desativada.");
    sessionStorage.setItem(SESSION, account.role);
    sessionStorage.setItem(SESSION_ID, account.id);
    notify("signed-in");
    return auth.getCurrentUser();
  }
  async function demoSignUp(input) {
    const name = String(input.name || "").trim(), email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (name.length < 2 || name.length > 80) throw Error("Informe seu nome completo.");
    if (!email.includes("@") || !email.includes(".") || email.includes(" ")) throw Error("Informe um e-mail válido.");
    if (password.length < 8 || password !== input.passwordConfirmation) throw Error("Confirme a senha com pelo menos oito caracteres.");
    if (!input.acceptTerms || !input.acceptPrivacy) throw Error("Aceite os Termos e a Política de Privacidade.");
    if (findAccount(email)) throw Error("Já existe uma conta com esse e-mail.");
    const recoveryCode = hex(crypto.getRandomValues(new Uint8Array(6))).toUpperCase();
    const salt = makeSalt(), recoverySalt = makeSalt();
    const account = { id: crypto.randomUUID(), name, email, role: "tutor", status: "active",
      salt, passwordHash: await derive(password, salt),
      recoverySalt, recoveryHash: await derive(recoveryCode, recoverySalt), created_at: new Date().toISOString() };
    const data = read(); data.accounts.push(account); write(data);
    return { id: account.id, name, email, recoveryCode, needsEmailConfirmation: false };
  }
  async function demoRequestPasswordReset(email, code) {
    const account = getRegistered(email);
    if (!account || !code || await derive(String(code).trim().toUpperCase(), account.recoverySalt) !== account.recoveryHash)
      throw Error("Confira o e-mail e o código de recuperação recebido ao criar a conta.");
    sessionStorage.setItem(RESET_ID, account.id);
    return { message: "Código confirmado. Defina a nova senha." };
  }
  async function demoUpdatePassword(password, confirmation) {
    const id = sessionStorage.getItem(RESET_ID);
    if (!id) throw Error("Confirme seu código de recuperação primeiro.");
    if (password.length < 8 || password !== confirmation) throw Error("Use uma senha de ao menos oito caracteres e confirme.");
    const data = read(), account = data.accounts.find((a) => a.id === id);
    if (!account) throw Error("Conta não encontrada neste navegador.");
    account.salt = makeSalt(); account.passwordHash = await derive(password, account.salt);
    write(data); sessionStorage.removeItem(RESET_ID);
    return { changed: true };
  }
  const mine = (rows, id) => rows.find((row) => row.id === id && row.owner_id === requireSession());
  const found = (row, label) => {
    if (!row) throw Error(`${label} não encontrado.`);
    return row;
  };
  const update = (collection, id, patch, label) => {
    const data = read();
    const row = found(mine(data[collection], id), label);
    Object.assign(row, patch, { updated_at: new Date().toISOString() });
    write(data);
    return copy(row);
  };
  const photoDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("bp.modern-preview.photos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(Error("Fotografias locais indisponíveis neste navegador."));
  });
  const photoOperation = async (mode, action) => {
    const db = await photoDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("photos", mode);
        const request = action(transaction.objectStore("photos"));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(Error("Não foi possível acessar a fotografia local."));
        transaction.onerror = () => reject(Error("Não foi possível salvar a fotografia local."));
      });
    } finally { db.close(); }
  };
  const savePhoto = async (collection, parentKey, parentId, file) => {
    requireSession();
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)
      throw Error("Use JPEG, PNG ou WebP de até 5 MiB.");
    const data = read();
    const siblings = data[collection].filter((row) => row[parentKey] === parentId);
    if (siblings.length >= 5) throw Error("O limite é de cinco fotografias por registro.");
    const row = { id: crypto.randomUUID(), [parentKey]: parentId, uploaded_by: requireSession(),
      storage_path: `local/${crypto.randomUUID()}`, mime_type: file.type, byte_size: file.size,
      created_at: new Date().toISOString(), is_cover: siblings.length === 0 };
    await photoOperation("readwrite", (store) => store.put(file, row.storage_path));
    data[collection].push(row);
    try { write(data); }
    catch (error) { await photoOperation("readwrite", (store) => store.delete(row.storage_path)); throw error; }
    return copy(row);
  };
  const removePhoto = async (collection, id) => {
    requireSession();
    const data = read();
    const row = found(data[collection].find((photo) => photo.id === id && photo.uploaded_by === requireSession()), "Fotografia");
    data[collection] = data[collection].filter((photo) => photo.id !== id);
    write(data);
    if (!data.petPhotos.some((photo) => photo.storage_path === row.storage_path)
      && !data.occurrencePhotos.some((photo) => photo.storage_path === row.storage_path))
      await photoOperation("readwrite", (store) => store.delete(row.storage_path));
    return true;
  };
  const auth = {
    ready: Promise.resolve(),
    getSession: () => currentRole() ? { userId: currentRole() === "admin" ? ADMIN_ID : currentTutor()?.id } : null,
    getCurrentUser: () => {
      if (currentRole() === "admin") return { ...SAMPLE_ADMIN, roles: ["administrador"], activeRole: "administrador", emailVerified: false };
      if (currentRole() !== "tutor") return null;
      const a = currentTutor();
      return a ? { id: a.id, name: a.name, email: a.email, status: a.status,
        emailVerified: false, roles: ["tutor"], activeRole: "tutor" } : null;
    },
    getActiveRole: () => currentRole() === "admin" ? "administrador" : currentRole() === "tutor" ? "tutor" : null,
    getRoles: () => currentRole() === "admin" ? ["administrador"] : currentRole() === "tutor" ? ["tutor"] : [],
    hasRole: (role) => currentRole() === "admin" ? role === "administrador" : currentRole() === "tutor" && role === "tutor",
    requireSession,
    onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    signIn: demoSignIn, signUp: demoSignUp,
    requestPasswordReset: demoRequestPasswordReset,
    canResetPassword: () => Boolean(sessionStorage.getItem(RESET_ID)),
    updatePassword: demoUpdatePassword,
    signOut: async () => {
      const signedOutUserId = currentRole() === "admin" ? ADMIN_ID : currentId();
      sessionStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION_ID);
      listeners.forEach((listener) => listener(null, { kind: "signed-out", relevant: true, signedOutUserId }));
    },
  };
  const store = {
    async listPublicOccurrences() { return copy(read().occurrences.filter((row) => row.visibility === "public").sort((a, b) => b.created_at.localeCompare(a.created_at))); },
    async listOwnPets() { return copy(read().pets.filter((row) => row.owner_id === requireSession())); },
    async getPet(id) { return copy(mine(read().pets, id)); },
    async createPet(input) {
      const data = read();
      const row = { ...input, id: crypto.randomUUID(), owner_id: requireSession(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      data.pets.push(row); write(data); return copy(row);
    },
    async updatePet(id, patch) { return update("pets", id, patch, "Animal"); },
    async deletePet(id) {
      const data = read(); found(mine(data.pets, id), "Animal");
      const removedPhotos = data.petPhotos.filter((row) => row.pet_id === id);
      data.pets = data.pets.filter((row) => row.id !== id);
      data.petPhotos = data.petPhotos.filter((row) => row.pet_id !== id);
      data.occurrences.forEach((row) => { if (row.pet_id === id) row.pet_id = null; });
      write(data);
      for (const photo of removedPhotos) {
        if (!data.occurrencePhotos.some((row) => row.storage_path === photo.storage_path))
          await photoOperation("readwrite", (store) => store.delete(photo.storage_path));
      }
      return true;
    },
    async listOwnOccurrences() { return copy(read().occurrences.filter((row) => row.owner_id === requireSession())); },
    async getOccurrence(id) {
      const row = read().occurrences.find((item) => item.id === id);
      return row && (row.visibility === "public" || (row.owner_id === currentId() && currentRole() === "tutor"))
        ? { ...copy(row), is_owner: row.owner_id === currentId() && currentRole() === "tutor" } : null;
    },
    async createOccurrence(input) {
      const data = read();
      const row = { ...input, id: crypto.randomUUID(), owner_id: requireSession(), status: "active", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_owner: true };
      data.occurrences.push(row); write(data); return copy(row);
    },
    async updateOccurrence(id, patch) { return { ...update("occurrences", id, patch, "Alerta"), is_owner: true }; },
    async setOccurrenceStatus(id, status) {
      if (!["active", "located", "reunited", "closed"].includes(status)) throw Error("Situação inválida.");
      update("occurrences", id, { status }, "Alerta"); return true;
    },
    async getOccurrencePublicLocation(id) { return copy(read().occurrencePoints.find((row) => row.occurrence_id === id) || null); },
    async saveOccurrencePublicLocation(id, point) {
      const data = read(); found(mine(data.occurrences, id), "Alerta");
      data.occurrencePoints = data.occurrencePoints.filter((row) => row.occurrence_id !== id);
      const row = { occurrence_id: id, latitude: point.latitude, longitude: point.longitude, radius_m: 900, public_description: point.description || "" };
      data.occurrencePoints.push(row); write(data); return copy(row);
    },
    async deleteOccurrencePublicLocation(id) {
      const data = read(); found(mine(data.occurrences, id), "Alerta");
      data.occurrencePoints = data.occurrencePoints.filter((row) => row.occurrence_id !== id); write(data); return true;
    },
    async listPublicMapPoints(filters = {}) {
      const data = read();
      const occurrencePoints = data.occurrencePoints.flatMap((point) => {
        const occurrence = data.occurrences.find((row) => row.id === point.occurrence_id);
        if (!occurrence || occurrence.visibility !== "public" || (filters.occurrenceId && filters.occurrenceId !== occurrence.id)
          || (filters.city && !occurrence.city.toLowerCase().includes(filters.city.toLowerCase()))
          || (filters.region && !occurrence.region.toLowerCase().includes(filters.region.toLowerCase()))
          || (filters.status && filters.status !== occurrence.status)
          || (filters.since && occurrence.last_seen_at < filters.since)) return [];
        return [{ ...point, id: point.occurrence_id, category: "last-known", city: occurrence.city, region: occurrence.region,
          title: "Última região conhecida", event_at: occurrence.last_seen_at, occurrence_status: occurrence.status,
          description: point.public_description }];
      });
      const sightingPoints = data.sightingPoints.flatMap((point) => {
        const sighting = data.sightings.find((row) => row.id === point.sighting_id && row.status === "reviewed");
        const occurrence = data.occurrences.find((row) => row.id === sighting?.occurrence_id && row.visibility === "public");
        if (!point.approved_by_tutor || !occurrence || (filters.occurrenceId && filters.occurrenceId !== occurrence.id)
          || (filters.city && !occurrence.city.toLowerCase().includes(filters.city.toLowerCase()))
          || (filters.region && !occurrence.region.toLowerCase().includes(filters.region.toLowerCase()))
          || (filters.status && filters.status !== occurrence.status)
          || (filters.since && sighting.observed_at < filters.since)) return [];
        return [{ ...point, id: point.sighting_id, occurrence_id: occurrence.id, category: "sighting",
          city: occurrence.city, region: occurrence.region, title: "Região de avistamento",
          event_at: sighting.observed_at, occurrence_status: occurrence.status, description: point.public_description }];
      });
      return copy([...occurrencePoints, ...sightingPoints]);
    },
    async listSightings(id) { requireSession(); return copy(read().sightings.filter((row) => row.occurrence_id === id)); },
    async createSighting(input) {
      const data = read(); found(data.occurrences.find((row) => row.id === input.occurrence_id && row.visibility === "public" && row.status === "active"), "Alerta disponível para avistamento");
      const row = { ...input, id: crypto.randomUUID(), reporter_id: requireSession(), status: "pending", created_at: new Date().toISOString() };
      data.sightings.push(row); write(data); return copy(row);
    },
    async listSightingPublicLocations(ids) { return copy(read().sightingPoints.filter((row) => ids.includes(row.sighting_id))); },
    async saveSightingPublicLocation(id, point) {
      const data = read(); found(data.sightings.find((row) => row.id === id), "Avistamento");
      const row = { sighting_id: id, latitude: point.latitude, longitude: point.longitude, radius_m: 900, public_description: point.description || "", approved_by_tutor: false };
      data.sightingPoints.push(row); write(data); return copy(row);
    },
    async reviewSighting(id, status) {
      const data = read(); const row = found(data.sightings.find((item) => item.id === id), "Avistamento");
      found(mine(data.occurrences, row.occurrence_id), "Alerta"); row.status = status; write(data); return copy(row);
    },
    async setSightingPublication(id, approved) {
      const data = read(); const point = found(data.sightingPoints.find((row) => row.sighting_id === id), "Regiao");
      const sighting = found(data.sightings.find((row) => row.id === id), "Avistamento");
      found(mine(data.occurrences, sighting.occurrence_id), "Alerta");
      if (sighting.status !== "reviewed") throw Error("Revise o avistamento antes de publicar a região.");
      point.approved_by_tutor = approved === true; write(data); return copy(point);
    },
    async listPhotos(id) { return copy(read().occurrencePhotos.filter((row) => row.occurrence_id === id)); },
    async listPublicCoverPhotos(ids) {
      const data = read(); const publicIds = new Set(data.occurrences.filter((row) => row.visibility === "public").map((row) => row.id));
      return copy(data.occurrencePhotos.filter((row) => ids.includes(row.occurrence_id) && publicIds.has(row.occurrence_id)));
    },
    async listPetPhotos(id) { requireSession(); return copy(read().petPhotos.filter((row) => row.pet_id === id)); },
    async uploadPetPhoto(id, file) { found(mine(read().pets, id), "Animal"); return savePhoto("petPhotos", "pet_id", id, file); },
    async uploadOccurrencePhoto(id, file) { found(mine(read().occurrences, id), "Alerta"); return savePhoto("occurrencePhotos", "occurrence_id", id, file); },
    async reusePetPhotosForOccurrence(petId, occurrenceId) {
      const data = read(); found(mine(data.pets, petId), "Animal"); found(mine(data.occurrences, occurrenceId), "Alerta");
      const existing = data.occurrencePhotos.filter((row) => row.occurrence_id === occurrenceId);
      const reused = data.petPhotos.filter((row) => row.pet_id === petId && !existing.some((photo) => photo.storage_path === row.storage_path))
        .slice(0, Math.max(0, 5 - existing.length)).map((row) => ({ ...row, id: crypto.randomUUID(), occurrence_id: occurrenceId }));
      data.occurrencePhotos.push(...reused); write(data); return copy(reused);
    },
    async downloadPhoto(path) {
      const blob = await photoOperation("readonly", (photoStore) => photoStore.get(path));
      if (!(blob instanceof Blob)) throw Error("Fotografia local indisponível.");
      return blob;
    },
    async setPetCover(id) {
      const data = read(); const photo = found(data.petPhotos.find((row) => row.id === id && row.uploaded_by === requireSession()), "Fotografia");
      data.petPhotos.forEach((row) => { if (row.pet_id === photo.pet_id) row.is_cover = row.id === id; });
      write(data); return copy(photo);
    },
    async deletePetPhoto(id) { return removePhoto("petPhotos", id); },
    async deletePhoto(id) { return removePhoto("occurrencePhotos", id); },
    async getMyActiveOccurrenceReport(id) { requireSession(); return copy(read().reports.find((row) => row.occurrence_id === id && ["open", "in_review"].includes(row.report_status)) || null); },
    async reportOccurrence(id, category, description) {
      requireSession();
      const data = read();
      found(data.occurrences.find((row) => row.id === id && row.visibility === "public" && row.status === "active"), "Alerta");
      if (!["false_misleading", "suspected_fraud", "inappropriate_content", "duplicate_occurrence", "misuse_of_information", "other"].includes(category)
        || typeof description !== "string" || description.trim().length < 10 || description.trim().length > 1000)
        throw Error("Informe um motivo válido e uma descrição entre 10 e 1.000 caracteres.");
      const existing = data.reports.find((row) => row.occurrence_id === id && ["open", "in_review"].includes(row.report_status));
      if (existing) return { ...copy(existing), already_active: true };
      const row = { id: crypto.randomUUID(), occurrence_id: id, reporter_id: requireSession(), category, description: description.trim(), report_status: "open", created_at: new Date().toISOString(), test_record: true };
      data.reports.push(row); write(data); return copy(row);
    },
    async localAdminSnapshot() {
      requireAdmin();
      const data = read();
      return copy({ users: [{ ...SAMPLE_TUTOR, status: data.tutorStatus, test_record: true }, ...data.accounts.map((a) => ({ id: a.id, name: a.name, email: a.email, status: a.status, test_record: true }))], pets: data.pets, occurrences: data.occurrences, reports: data.reports, history: data.adminHistory, sightings: data.sightings });
    },
    async localAdminAction(kind, id, decision, reason) {
      requireAdmin();
      const data = read();
      const explanation = String(reason || "").trim();
      if (explanation.length < 10 || explanation.length > 500) throw Error("Informe um motivo entre 10 e 500 caracteres.");
      let row;
      if (kind === "occurrence") {
        row = found(data.occurrences.find((item) => item.id === id), "Alerta");
        if (!["hide", "restore"].includes(decision)) throw Error("Ação inválida.");
        if ((decision === "hide" && row.visibility !== "public") || (decision === "restore" && row.visibility !== "under_review")) throw Error("Esta ação não se aplica à publicação.");
        row.visibility = decision === "hide" ? "under_review" : "public";
      } else if (kind === "report") {
        row = found(data.reports.find((item) => item.id === id), "Denúncia");
        if (!["in_review", "resolved", "dismissed"].includes(decision) || !["open", "in_review"].includes(row.report_status)) throw Error("Esta decisão não se aplica à denúncia.");
        row.report_status = decision;
        if (decision === "resolved") {
          const occurrence = found(data.occurrences.find((item) => item.id === row.occurrence_id), "Alerta");
          occurrence.visibility = "under_review";
        }
      } else if (kind === "user") {
        if (!["active", "suspended"].includes(decision)) throw Error("Esta ação não se aplica ao usuário.");
        if (id === USER_ID) {
          if (data.tutorStatus === decision) throw Error("Esta ação não se aplica ao usuário.");
          data.tutorStatus = decision;
        } else {
          const account = found(data.accounts.find((a) => a.id === id), "Conta");
          if (account.status === decision) throw Error("Esta ação não se aplica ao usuário.");
          account.status = decision;
        }
        row = { id, status: decision };
      } else throw Error("Ação administrativa inválida.");
      const entry = { id: crypto.randomUUID(), kind, target_id: id, decision, reason: explanation, created_at: new Date().toISOString(), actor_name: "Administrador Local", test_record: true };
      data.adminHistory.unshift(entry); write(data);
      return copy({ row, entry });
    },
  };
  window.BPAuth = auth;
  window.BPRemoteStore = Object.freeze(store);
  window.BPLocalPreview = Object.freeze({ active: true, enter(role = "tutor") {
    if (!["tutor", "admin"].includes(role)) throw Error("Perfil inválido.");
    if (role === "tutor" && read().tutorStatus !== "active") throw Error("Esta conta de tutor está desativada.");
    sessionStorage.setItem(SESSION, role);
    sessionStorage.setItem(SESSION_ID, role === "admin" ? ADMIN_ID : USER_ID);
    notify("presentation-account");
  }, async clear() {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("bp.modern-preview.photos");
      request.onsuccess = resolve;
      request.onerror = () => reject(Error("Não foi possível remover as fotos cadastradas."));
      request.onblocked = () => reject(Error("Feche outras abas do BuscaPet e tente limpar novamente."));
    });
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(SESSION);
    sessionStorage.removeItem(SESSION_ID);
    sessionStorage.removeItem(RESET_ID);
    sessionStorage.removeItem("bp.real.returnTo");
    listeners.forEach((listener) => listener(null, { kind: "signed-out", relevant: true, signedOutUserId: USER_ID }));
  } });
}
