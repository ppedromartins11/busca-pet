const BUCKET = "pet-media";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export class RemoteStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RemoteStoreError";
    this.code = code;
    Object.assign(this, details);
  }
}

function problem(code, message) {
  throw new RemoteStoreError(code, message);
}

function requiredUuid(value, label = "Registro") {
  if (typeof value !== "string" || !UUID.test(value))
    problem("VALIDATION", `${label} inválido.`);
  return value.toLowerCase();
}

function requiredText(value, label, min, max) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max)
    problem("VALIDATION", `${label} deve ter entre ${min} e ${max} caracteres.`);
  return text;
}

function optionalText(value, label, max) {
  if (value == null || value === "") return null;
  return requiredText(value, label, 1, max);
}

function choice(value, values, label) {
  if (!values.includes(value)) problem("VALIDATION", `${label} inválido.`);
  return value;
}

function dateTime(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) problem("VALIDATION", `${label} inválida.`);
  return new Date(timestamp).toISOString();
}

function pastDateTime(value, label) {
  const normalized = dateTime(value, label);
  if (Date.parse(normalized) > Date.now() + 60_000)
    problem("VALIDATION", `${label} não pode estar no futuro.`);
  return normalized;
}

function safeError(error) {
  if (error instanceof RemoteStoreError) return error;
  const code = String(error?.code || "");
  const details = {
    status: error?.status ?? error?.statusCode ?? null,
    source: error?.name || "supabase",
  };
  if (code === "42501" || code === "PGRST301" || code === "403")
    return new RemoteStoreError("DENIED", "Você não tem permissão para esta operação.", details);
  if (code === "23503")
    return new RemoteStoreError("DEPENDENCY", "Este registro possui vínculos que impedem a operação.", details);
  if (code === "23505")
    return new RemoteStoreError("CONFLICT", "Este registro já existe.", details);
  if (code === "23514" || code === "22P02" || code === "PGRST204")
    return new RemoteStoreError("VALIDATION", "Revise os dados informados.", details);
  return new RemoteStoreError("UNAVAILABLE", "Não foi possível concluir a operação. Tente novamente.", details);
}

async function checked(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw safeError(error);
  }
}

function cleanPet(input, partial = false) {
  if (!input || typeof input !== "object") problem("VALIDATION", "Dados do animal inválidos.");
  const result = {};
  const add = (key, parse) => {
    if (!partial || Object.hasOwn(input, key)) result[key] = parse(input[key]);
  };
  add("name", (value) => requiredText(value, "Nome", 1, 80));
  add("species", (value) => choice(value, ["dog", "cat", "other"], "Espécie"));
  for (const [key, label, max] of [
    ["breed", "Raça", 120],
    ["coat_description", "Pelagem", 500],
    ["distinctive_features", "Características", 500],
  ]) add(key, (value) => optionalText(value, label, max));
  if (!partial || Object.hasOwn(input, "sex"))
    result.sex = input.sex == null || input.sex === ""
      ? null : choice(input.sex, ["female", "male", "unknown"], "Sexo");
  if (!partial || Object.hasOwn(input, "size"))
    result.size = input.size == null || input.size === ""
      ? null : choice(input.size, ["small", "medium", "large", "unknown"], "Porte");
  if (partial && !Object.keys(result).length) problem("VALIDATION", "Nenhuma alteração informada.");
  return result;
}

function cleanOccurrence(input, partial = false) {
  if (!input || typeof input !== "object") problem("VALIDATION", "Dados da ocorrência inválidos.");
  const result = {};
  const add = (key, parse) => {
    if (!partial || Object.hasOwn(input, key)) result[key] = parse(input[key]);
  };
  add("pet_id", (value) => value ? requiredUuid(value, "Animal") : null);
  if (!partial) {
    result.type = choice(input.type, ["lost", "found"], "Tipo");
    result.visibility = choice(input.visibility || "public", ["public", "private"], "Visibilidade");
  }
  add("city", (value) => requiredText(value, "Cidade", 2, 80));
  add("region", (value) => requiredText(value, "Região", 2, 100));
  add("public_reference", (value) => optionalText(value, "Referência pública", 200));
  add("last_seen_at", (value) => dateTime(value, "Data"));
  add("description", (value) => requiredText(value, "Descrição", 10, 2000));
  add("reward_cents", (value) => {
    const amount = value == null || value === "" ? 0 : Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647)
      problem("VALIDATION", "Recompensa inválida.");
    return amount;
  });
  if (partial && !Object.keys(result).length) problem("VALIDATION", "Nenhuma alteração informada.");
  return result;
}

function cleanSighting(input) {
  if (!input || typeof input !== "object") problem("VALIDATION", "Dados do avistamento inválidos.");
  return {
    occurrence_id: requiredUuid(input.occurrence_id, "Ocorrência"),
    observed_at: pastDateTime(input.observed_at, "Data e hora do avistamento"),
    area_description: requiredText(input.area_description, "Área", 2, 200),
    direction: optionalText(input.direction, "Direção", 200),
    behavior: optionalText(input.behavior, "Comportamento", 300),
    description: requiredText(input.description, "Descrição", 5, 2000),
  };
}

function validPhoto(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_PHOTO_BYTES)
    problem("VALIDATION", "Escolha uma imagem de até 5 MiB.");
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) problem("VALIDATION", "Use uma imagem JPEG, PNG ou WebP.");
  return extension;
}

/** Browser-side operations use the publishable key and the current Auth session.
 * Authorization remains in database RLS and the narrow public RPC wrappers.
 */
export function createRemoteStore(client) {
  function configured() {
    if (!client) problem("CONFIGURATION", "Configure a conexão com o Supabase.");
    return client;
  }

  async function currentUser() {
    let result;
    try { result = await configured().auth.getUser(); }
    catch (error) { throw safeError(error); }
    if (result.error) throw safeError(result.error);
    if (!result.data?.user) problem("AUTH_REQUIRED", "Entre na sua conta para continuar.");
    return result.data.user;
  }

  async function one(request, label = "Registro") {
    const row = await checked(request.maybeSingle());
    if (!row) problem("NOT_FOUND", `${label} não encontrado ou sem permissão.`);
    return row;
  }

  const api = {
    async getProfile() {
      const { id } = await currentUser();
      return one(configured().from("profiles").select("id,full_name,active_role,status,accepted_terms_at,accepted_privacy_at,created_at,updated_at").eq("id", id), "Perfil");
    },
    async updateProfile(patch) {
      const { id } = await currentUser();
      const changes = {};
      if (Object.hasOwn(patch || {}, "full_name")) changes.full_name = requiredText(patch.full_name, "Nome", 2, 80);
      for (const key of ["accepted_terms_at", "accepted_privacy_at"])
        if (Object.hasOwn(patch || {}, key)) changes[key] = patch[key] == null ? null : dateTime(patch[key], "Aceitação");
      if (!Object.keys(changes).length) problem("VALIDATION", "Nenhuma alteração informada.");
      return one(configured().from("profiles").update(changes).eq("id", id).select(), "Perfil");
    },
    async listMyRoles() {
      const { id } = await currentUser();
      return checked(configured().from("user_roles").select("role,granted_at").eq("user_id", id));
    },
    async requestCollaboratorRole() {
      const { id } = await currentUser();
      await checked(configured().from("user_roles").insert({ user_id: id, role: "colaborador" }));
      return true;
    },
    async listOwnPets() {
      const { id } = await currentUser();
      return checked(configured().from("pets").select().eq("owner_id", id).order("created_at", { ascending: false }));
    },
    async getPet(id) {
      await currentUser();
      return checked(configured().from("pets").select().eq("id", requiredUuid(id, "Animal")).maybeSingle());
    },
    async createPet(input) {
      const { id } = await currentUser();
      return one(configured().from("pets").insert({ ...cleanPet(input), owner_id: id }).select(), "Animal");
    },
    async updatePet(id, patch) {
      await currentUser();
      return one(configured().from("pets").update(cleanPet(patch, true)).eq("id", requiredUuid(id, "Animal")).select(), "Animal");
    },
    async deletePet(id) {
      await currentUser();
      const rows = await checked(configured().from("pets").delete().eq("id", requiredUuid(id, "Animal")).select("id"));
      if (!rows?.length) problem("NOT_FOUND", "Animal não encontrado ou sem permissão.");
      return true;
    },
    async listPublicOccurrences(filters = {}) {
      let query = configured().from("occurrences").select().eq("visibility", "public");
      if (filters.type) query = query.eq("type", choice(filters.type, ["lost", "found"], "Tipo"));
      if (filters.status) query = query.eq("status", choice(filters.status, ["active", "located", "reunited", "closed"], "Situação"));
      if (filters.city) query = query.eq("city", requiredText(filters.city, "Cidade", 2, 80));
      const limit = Math.min(200, Math.max(1, Number.parseInt(filters.limit, 10) || 100));
      const page = Math.max(0, Number.parseInt(filters.page, 10) || 0);
      return checked(query.order("created_at", { ascending: false }).range(page * limit, page * limit + limit - 1));
    },
    async listOwnOccurrences() {
      const { id } = await currentUser();
      return checked(configured().from("occurrences").select().eq("reporter_id", id).order("created_at", { ascending: false }));
    },
    async getOccurrence(id) {
      return checked(configured().from("occurrences").select().eq("id", requiredUuid(id, "Ocorrência")).maybeSingle());
    },
    async createOccurrence(input) {
      const { id } = await currentUser();
      return one(configured().from("occurrences").insert({ ...cleanOccurrence(input), reporter_id: id }).select(), "Ocorrência");
    },
    async updateOccurrence(id, patch) {
      await currentUser();
      return one(configured().from("occurrences").update(cleanOccurrence(patch, true)).eq("id", requiredUuid(id, "Ocorrência")).select(), "Ocorrência");
    },
    async setOccurrenceStatus(id, status) {
      await currentUser();
      await checked(configured().rpc("set_occurrence_status", {
        p_occurrence: requiredUuid(id, "Ocorrência"),
        p_status: choice(status, ["active", "located", "reunited", "closed"], "Situação"),
      }));
      return true;
    },
    async listSightings(occurrenceId) {
      await currentUser();
      return checked(configured().from("sightings").select().eq("occurrence_id", requiredUuid(occurrenceId, "Ocorrência")).order("observed_at", { ascending: false }));
    },
    async createSighting(input) {
      const { id } = await currentUser();
      const row = await one(configured().from("sightings").insert({ ...cleanSighting(input), reporter_id: id }).select(), "Avistamento");
      if (input.latitude != null || input.longitude != null) {
        try { await api.addSightingCoordinates(row.id, input.latitude, input.longitude); }
        catch (error) {
          throw new RemoteStoreError("PARTIAL", "Avistamento registrado, mas a localização exata não foi salva.", { sightingId: row.id });
        }
      }
      return row;
    },
    async addSightingCoordinates(id, latitude, longitude) {
      await currentUser();
      if (latitude == null || longitude == null || latitude === "" || longitude === "")
        problem("VALIDATION", "Informe latitude e longitude.");
      const lat = Number(latitude), lon = Number(longitude);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180)
        problem("VALIDATION", "Coordenadas inválidas.");
      await checked(configured().rpc("add_sighting_coordinates", {
        p_sighting: requiredUuid(id, "Avistamento"), p_lat: lat, p_lon: lon,
      }));
      return true;
    },
    async getSightingCoordinates(id) {
      await currentUser();
      const rows = await checked(configured().rpc("sighting_coordinates", { p_sighting: requiredUuid(id, "Avistamento") }));
      return rows?.[0] || null;
    },
    async reviewSighting(id, status) {
      await currentUser();
      await checked(configured().rpc("review_sighting", {
        p_sighting: requiredUuid(id, "Avistamento"),
        p_status: choice(status, ["reviewed", "rejected"], "Revisão"),
      }));
      return true;
    },
    async listPhotos(occurrenceId) {
      return checked(configured().from("occurrence_photos").select().eq("occurrence_id", requiredUuid(occurrenceId, "Ocorrência")).order("created_at", { ascending: true }));
    },
    async listPublicCoverPhotos(occurrenceIds) {
      if (!Array.isArray(occurrenceIds)) problem("VALIDATION", "Lista de ocorrências inválida.");
      const ids = [...new Set(occurrenceIds.map((id) => requiredUuid(id, "Ocorrência")))];
      if (!ids.length) return [];
      return checked(configured().from("occurrence_photos")
        .select("id,occurrence_id,storage_path,mime_type,byte_size,created_at")
        .in("occurrence_id", ids).order("created_at", { ascending: true }));
    },
    async listPetPhotos(petId) {
      await currentUser();
      return checked(configured().from("pet_photos").select().eq("pet_id", requiredUuid(petId, "Animal")).order("is_cover", { ascending: false }).order("created_at", { ascending: true }));
    },
    async uploadPetPhoto(petId, file) {
      const { id } = await currentUser();
      const extension = validPhoto(file);
      const path = `${id}/${crypto.randomUUID()}.${extension}`;
      const bucket = configured().storage.from(BUCKET);
      await checked(bucket.upload(path, file, { contentType: file.type, upsert: false }));
      try {
        return await one(configured().from("pet_photos").insert({
          pet_id: requiredUuid(petId, "Animal"), uploaded_by: id, storage_path: path,
          mime_type: file.type, byte_size: file.size,
        }).select(), "Fotografia");
      } catch (error) {
        try { await checked(bucket.remove([path])); }
        catch { throw new RemoteStoreError("PARTIAL", "A foto não foi associada e a limpeza do arquivo falhou.", { storagePath: path }); }
        throw safeError(error);
      }
    },
    async setPetCover(photoId) {
      const { id } = await currentUser();
      const photo = await one(configured().from("pet_photos").select("id,pet_id,uploaded_by").eq("id", requiredUuid(photoId, "Fotografia")), "Fotografia");
      if (photo.uploaded_by !== id) problem("DENIED", "Somente o tutor pode alterar a foto de capa.");
      await checked(configured().from("pet_photos").update({ is_cover: false }).eq("pet_id", photo.pet_id).eq("uploaded_by", id));
      return one(configured().from("pet_photos").update({ is_cover: true }).eq("id", photo.id).select(), "Fotografia");
    },
    async deletePetPhoto(photoId) {
      const { id } = await currentUser();
      const photo = await one(configured().from("pet_photos").select("id,uploaded_by,storage_path").eq("id", requiredUuid(photoId, "Fotografia")), "Fotografia");
      if (photo.uploaded_by !== id) problem("DENIED", "Somente quem enviou a foto pode excluí-la.");
      const removed = await checked(configured().from("pet_photos").delete().eq("id", photo.id).select("id"));
      if (!removed?.length) problem("NOT_FOUND", "Fotografia não encontrada ou sem permissão.");
      try { await checked(configured().storage.from(BUCKET).remove([photo.storage_path])); }
      catch { throw new RemoteStoreError("PARTIAL", "Metadados excluídos, mas o arquivo privado requer limpeza.", { storagePath: photo.storage_path }); }
      return true;
    },
    async uploadOccurrencePhoto(occurrenceId, file) {
      return api.uploadPhoto({ occurrenceId, file });
    },
    async reusePetPhotosForOccurrence(petId, occurrenceId) {
      const { id } = await currentUser();
      const normalizedPetId = requiredUuid(petId, "Animal");
      const normalizedOccurrenceId = requiredUuid(occurrenceId, "Ocorrência");
      const [photos, existing] = await Promise.all([
        api.listPetPhotos(normalizedPetId),
        api.listPhotos(normalizedOccurrenceId),
      ]);
      if (!photos.length) return [];
      const usedPaths = new Set(existing.map((photo) => photo.storage_path));
      const rows = photos.filter((photo) => !usedPaths.has(photo.storage_path)).slice(0, 5).map((photo) => ({
        occurrence_id: normalizedOccurrenceId,
        sighting_id: null,
        uploaded_by: id,
        storage_path: photo.storage_path,
        mime_type: photo.mime_type,
        byte_size: photo.byte_size,
      }));
      return rows.length ? checked(configured().from("occurrence_photos").insert(rows).select()) : [];
    },
    async uploadPhoto({ occurrenceId = null, sightingId = null, file } = {}) {
      const { id } = await currentUser();
      if (Boolean(occurrenceId) === Boolean(sightingId)) problem("VALIDATION", "Associe a foto a uma ocorrência ou avistamento.");
      const extension = validPhoto(file);
      const path = `${id}/${crypto.randomUUID()}.${extension}`;
      const bucket = configured().storage.from(BUCKET);
      await checked(bucket.upload(path, file, { contentType: file.type, upsert: false }));
      try {
        const row = {
          uploaded_by: id,
          storage_path: path,
          mime_type: file.type,
          byte_size: file.size,
          occurrence_id: occurrenceId ? requiredUuid(occurrenceId, "Ocorrência") : null,
          sighting_id: sightingId ? requiredUuid(sightingId, "Avistamento") : null,
        };
        return await one(configured().from("occurrence_photos").insert(row).select(), "Fotografia");
      } catch (error) {
        try { await checked(bucket.remove([path])); }
        catch { throw new RemoteStoreError("PARTIAL", "A foto não foi associada e a limpeza do arquivo falhou.", { storagePath: path }); }
        throw safeError(error);
      }
    },
    async downloadPhoto(path) {
      if (typeof path !== "string" || !PHOTO_PATH.test(path)) problem("VALIDATION", "Caminho da fotografia inválido.");
      const blob = await checked(configured().storage.from(BUCKET).download(path));
      if (!(blob instanceof Blob) || !blob.size || !/^image\/(jpeg|png|webp)$/i.test(blob.type))
        throw new RemoteStoreError("INVALID_MEDIA", "O arquivo recebido não é uma imagem válida.", {
          source: "storage.download", status: null, blobType: blob?.type || null, blobSize: blob?.size || 0,
        });
      return blob;
    },
    async deletePhoto(photoId) {
      const { id } = await currentUser();
      const photo = await one(configured().from("occurrence_photos").select("id,uploaded_by,storage_path").eq("id", requiredUuid(photoId, "Fotografia")), "Fotografia");
      if (photo.uploaded_by !== id) problem("DENIED", "Somente quem enviou a foto pode excluí-la.");
      const removed = await checked(configured().from("occurrence_photos").delete().eq("id", photo.id).select("id"));
      if (!removed?.length) problem("NOT_FOUND", "Fotografia não encontrada ou sem permissão.");
      try { await checked(configured().storage.from(BUCKET).remove([photo.storage_path])); }
      catch { throw new RemoteStoreError("PARTIAL", "Metadados excluídos, mas o arquivo privado requer limpeza.", { storagePath: photo.storage_path }); }
      return true;
    },
  };

  return Object.freeze(api);
}

// main.js imports supabase-client.js first; tests can inject a client directly.
export const remoteStore = createRemoteStore(
  typeof window !== "undefined" ? window.BPSupabase?.client : null,
);
if (typeof window !== "undefined") window.BPRemoteStore = remoteStore;
