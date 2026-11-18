// Explicit, browser-only preview for the modern UI. It never calls Supabase.
if ((import.meta.env.MODE === "presentation" || import.meta.env.VITE_BUSCAPET_LOCAL_PREVIEW === "true") && !window.BPSupabase?.configured) {
  const KEY = "bp.modern-preview.v1";
  const SESSION = "bp.modern-preview.session";
  const USER_ID = "00000000-0000-4000-8000-000000000001";
  const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
  const listeners = new Set();
  const initial = () => ({ pets: [], occurrences: [], sightings: [], petPhotos: [], occurrencePhotos: [], occurrencePoints: [], sightingPoints: [], reports: [], adminHistory: [], tutorStatus: "active" });
  const read = () => {
    try { return { ...initial(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { throw Error("Não foi possível ler os dados desta prévia local."); }
  };
  const write = (data) => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch { throw Error("O armazenamento deste navegador está cheio ou indisponível."); }
  };
  const copy = (row) => row == null ? null : structuredClone(row);
  const requireSession = () => {
    if (sessionStorage.getItem(SESSION) !== "tutor" || read().tutorStatus !== "active") throw Error("Entre como Tutor Local para continuar.");
    return USER_ID;
  };
  const requireAdmin = () => {
    if (sessionStorage.getItem(SESSION) !== "admin") throw Error("Entre como Administrador Local para continuar.");
    return ADMIN_ID;
  };
  const currentRole = () => sessionStorage.getItem(SESSION);
  const mine = (rows, id) => rows.find((row) => row.id === id && row.owner_id === requireSession());
  const found = (row, label) => {
    if (!row) throw Error(`${label} não encontrado nesta prévia local.`);
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
    const row = { id: crypto.randomUUID(), [parentKey]: parentId, uploaded_by: USER_ID,
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
    const row = found(data[collection].find((photo) => photo.id === id && photo.uploaded_by === USER_ID), "Fotografia");
    data[collection] = data[collection].filter((photo) => photo.id !== id);
    write(data);
    if (!data.petPhotos.some((photo) => photo.storage_path === row.storage_path)
      && !data.occurrencePhotos.some((photo) => photo.storage_path === row.storage_path))
      await photoOperation("readwrite", (store) => store.delete(row.storage_path));
    return true;
  };
  const auth = {
    ready: Promise.resolve(),
    getSession: () => currentRole() ? { userId: currentRole() === "admin" ? ADMIN_ID : USER_ID } : null,
    getCurrentUser: () => currentRole() === "admin"
      ? { id: ADMIN_ID, name: "Administrador Local", email: "", status: "active", emailVerified: false, roles: ["administrador"], activeRole: "administrador" }
      : currentRole() === "tutor" ? { id: USER_ID, name: "Tutor Local", email: "", status: read().tutorStatus, emailVerified: false, roles: ["tutor"], activeRole: "tutor" } : null,
    getActiveRole: () => currentRole() === "admin" ? "administrador" : currentRole() === "tutor" ? "tutor" : null,
    getRoles: () => currentRole() === "admin" ? ["administrador"] : currentRole() === "tutor" ? ["tutor"] : [],
    hasRole: (role) => currentRole() === "admin" ? role === "administrador" : currentRole() === "tutor" && role === "tutor",
    requireSession,
    onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    signOut: async () => {
      const signedOutUserId = currentRole() === "admin" ? ADMIN_ID : USER_ID;
      sessionStorage.removeItem(SESSION);
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
      return row && (row.visibility === "public" || (row.owner_id === USER_ID && currentRole() === "tutor"))
        ? { ...copy(row), is_owner: row.owner_id === USER_ID && currentRole() === "tutor" } : null;
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
      const row = { id: crypto.randomUUID(), occurrence_id: id, reporter_id: USER_ID, category, description: description.trim(), report_status: "open", created_at: new Date().toISOString(), test_record: true };
      data.reports.push(row); write(data); return copy(row);
    },
    async localAdminSnapshot() {
      requireAdmin();
      const data = read();
      return copy({ users: [{ id: USER_ID, name: "Tutor Local (registro demonstrativo)", status: data.tutorStatus, test_record: true }], pets: data.pets, occurrences: data.occurrences, reports: data.reports, history: data.adminHistory, sightings: data.sightings });
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
        if (id !== USER_ID || !["active", "suspended"].includes(decision) || data.tutorStatus === decision) throw Error("Esta ação não se aplica ao usuário.");
        data.tutorStatus = decision;
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
    if (!["tutor", "admin"].includes(role)) throw Error("Perfil local inválido.");
    if (role === "tutor" && read().tutorStatus !== "active") throw Error("O Tutor Local está desativado nesta prévia. Entre como Administrador Local para reativá-lo.");
    sessionStorage.setItem(SESSION, role);
    listeners.forEach((listener) => listener(auth.getCurrentUser(), { kind: "local-preview", relevant: true }));
  }, async clear() {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase("bp.modern-preview.photos");
      request.onsuccess = resolve;
      request.onerror = () => reject(Error("Não foi possível remover as fotos desta prévia."));
      request.onblocked = () => reject(Error("Feche outras abas da prévia e tente limpar novamente."));
    });
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(SESSION);
    sessionStorage.removeItem("bp.real.returnTo");
    listeners.forEach((listener) => listener(null, { kind: "signed-out", relevant: true, signedOutUserId: USER_ID }));
  } });
}
