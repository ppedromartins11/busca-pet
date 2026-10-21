import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteStore } from "../src/remote-store.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PET_ID = "22222222-2222-4222-8222-222222222222";
const OCCURRENCE_ID = "33333333-3333-4333-8333-333333333333";

function clientMock(reply = () => ({ data: { id: PET_ID }, error: null })) {
  const calls = [];
  const storage = {
    upload: async (path, file, options) => { calls.push({ kind: "upload", path, file, options }); return { data: { path }, error: null }; },
    remove: async (paths) => { calls.push({ kind: "remove", paths }); return { data: paths, error: null }; },
    download: async (path) => { calls.push({ kind: "download", path }); return { data: new Blob(["image"]), error: null }; },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    storage: { from(bucket) { assert.equal(bucket, "pet-media"); return storage; } },
    from(table) {
      const call = { kind: "query", table, action: "select", filters: [] };
      calls.push(call);
      const q = {
        insert(payload) { call.action = "insert"; call.payload = payload; return q; },
        update(payload) { call.action = "update"; call.payload = payload; return q; },
        delete() { call.action = "delete"; return q; },
        select() { return q; },
        eq(key, value) { call.filters.push([key, value]); return q; },
        in(key, values) { call.filters.push([key, values]); return q; },
        order() { return q; },
        range() { return q; },
        maybeSingle() { return Promise.resolve(reply(call)); },
        then(resolve, reject) { return Promise.resolve(reply(call)).then(resolve, reject); },
      };
      return q;
    },
    rpc(name, params) {
      const call = { kind: "rpc", name, params };
      calls.push(call);
      return Promise.resolve(reply(call));
    },
  };
  return { client, calls };
}

test("animal and occurrence derive owner identity from Auth, ignoring forged fields", async () => {
  const { client, calls } = clientMock();
  const store = createRemoteStore(client);
  await store.createPet({ name: "Lua", species: "cat", owner_id: PET_ID, status: "admin" });
  const pet = calls.find((call) => call.table === "pets");
  assert.equal(pet.payload.owner_id, USER_ID);
  assert.deepEqual(Object.keys(pet.payload).sort(), ["breed", "coat_description", "distinctive_features", "name", "owner_id", "sex", "size", "species"]);

  await store.createOccurrence({
    pet_id: PET_ID, type: "lost", city: "Cuiabá", region: "Centro",
    last_seen_at: "2026-10-20T20:00:00.000Z", description: "Animal visto na região central.",
    reporter_id: PET_ID, status: "closed", active_role: "administrador",
  });
  const occurrence = calls.find((call) => call.table === "occurrences");
  assert.equal(occurrence.payload.reporter_id, USER_ID);
  assert.equal(occurrence.payload.visibility, "public");
  assert.equal("status" in occurrence.payload, false);
  assert.equal("active_role" in occurrence.payload, false);
});

test("status and exact coordinates use authorized RPC wrappers", async () => {
  const { client, calls } = clientMock((call) => ({
    data: call.table === "sightings" ? { id: PET_ID } : null, error: null,
  }));
  const store = createRemoteStore(client);
  await store.setOccurrenceStatus(OCCURRENCE_ID, "reunited");
  await store.createSighting({
    occurrence_id: OCCURRENCE_ID, observed_at: "2026-10-20T20:00:00.000Z",
    area_description: "Centro", description: "Vi um animal parecido.",
    latitude: -15.6, longitude: -56.1,
  });
  assert.deepEqual(calls.find((call) => call.name === "set_occurrence_status")?.params,
    { p_occurrence: OCCURRENCE_ID, p_status: "reunited" });
  const inserted = calls.find((call) => call.table === "sightings")?.payload;
  assert.equal(inserted.reporter_id, USER_ID);
  assert.equal("latitude" in inserted, false);
  assert.equal("longitude" in inserted, false);
  assert.deepEqual(calls.find((call) => call.name === "add_sighting_coordinates")?.params,
    { p_sighting: PET_ID, p_lat: -15.6, p_lon: -56.1 });
});

test("private Storage upload is cleaned when photo metadata is rejected", async () => {
  const { client, calls } = clientMock((call) => call.table === "occurrence_photos"
    ? { data: null, error: { code: "42501" } }
    : { data: null, error: null });
  const store = createRemoteStore(client);
  const file = new Blob(["image"]);
  Object.defineProperty(file, "type", { value: "image/png" });
  await assert.rejects(store.uploadOccurrencePhoto(OCCURRENCE_ID, file), { code: "DENIED" });
  const upload = calls.find((call) => call.kind === "upload");
  const metadata = calls.find((call) => call.table === "occurrence_photos");
  const cleanup = calls.find((call) => call.kind === "remove");
  assert.match(upload.path, new RegExp(`^${USER_ID}/[0-9a-f-]{36}\\.png$`));
  assert.equal(upload.options.upsert, false);
  assert.equal(metadata.payload.storage_path, upload.path);
  assert.equal(metadata.payload.uploaded_by, USER_ID);
  assert.deepEqual(cleanup.paths, [upload.path]);
});

test("invalid photos fail before any remote upload", async () => {
  const { client, calls } = clientMock();
  await assert.rejects(createRemoteStore(client).uploadOccurrencePhoto(
    OCCURRENCE_ID, { size: 5 * 1024 * 1024 + 1, type: "image/png" },
  ), { code: "VALIDATION" });
  assert.equal(calls.some((call) => call.kind === "upload"), false);
});

test("private operations require an Auth user", async () => {
  const { client, calls } = clientMock();
  client.auth.getUser = async () => ({ data: { user: null }, error: null });
  await assert.rejects(createRemoteStore(client).listOwnPets(), { code: "AUTH_REQUIRED" });
  assert.equal(calls.length, 0);
});

test("empty coordinate input cannot silently become zero degrees", async () => {
  const { client, calls } = clientMock();
  await assert.rejects(createRemoteStore(client).addSightingCoordinates(PET_ID, "", -56),
    { code: "VALIDATION" });
  assert.equal(calls.some((call) => call.kind === "rpc"), false);
});

test("sighting rejects a future observation before it reaches Supabase", async () => {
  const { client, calls } = clientMock();
  await assert.rejects(createRemoteStore(client).createSighting({
    occurrence_id: OCCURRENCE_ID,
    observed_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    area_description: "Centro", description: "Vi um animal parecido.",
  }), { code: "VALIDATION" });
  assert.equal(calls.some((call) => call.table === "sightings" && call.action === "insert"), false);
});

test("pet photographs use the authenticated private folder and metadata", async () => {
  const { client, calls } = clientMock();
  const file = new Blob(["image"]);
  Object.defineProperty(file, "type", { value: "image/webp" });
  await createRemoteStore(client).uploadPetPhoto(PET_ID, file);
  const upload = calls.find((call) => call.kind === "upload");
  const metadata = calls.find((call) => call.table === "pet_photos");
  assert.match(upload.path, new RegExp(`^${USER_ID}/[0-9a-f-]{36}\\.webp$`));
  assert.equal(metadata.payload.pet_id, PET_ID);
  assert.equal(metadata.payload.uploaded_by, USER_ID);
  assert.equal(metadata.payload.storage_path, upload.path);
});

test("public alert covers request all visible metadata in one RLS-protected query", async () => {
  const anotherOccurrence = "44444444-4444-4444-8444-444444444444";
  const { client, calls } = clientMock((call) => call.table === "occurrence_photos"
    ? { data: [], error: null } : { data: null, error: null });
  const rows = await createRemoteStore(client).listPublicCoverPhotos([OCCURRENCE_ID, anotherOccurrence, OCCURRENCE_ID]);
  assert.deepEqual(rows, []);
  const metadataQueries = calls.filter((call) => call.table === "occurrence_photos");
  assert.equal(metadataQueries.length, 1);
  assert.deepEqual(metadataQueries[0].filters, [["occurrence_id", [OCCURRENCE_ID, anotherOccurrence]]]);
});

test("reusing animal photos avoids paths already attached to the occurrence", async () => {
  const existingPath = `${USER_ID}/55555555-5555-4555-8555-555555555555.jpg`;
  const newPath = `${USER_ID}/66666666-6666-4666-8666-666666666666.jpg`;
  const { client, calls } = clientMock((call) => {
    if (call.table === "pet_photos") return { data: [
      { storage_path: existingPath, mime_type: "image/jpeg", byte_size: 1 },
      { storage_path: newPath, mime_type: "image/jpeg", byte_size: 1 },
    ], error: null };
    if (call.table === "occurrence_photos" && call.action === "select") return { data: [{ storage_path: existingPath }], error: null };
    return { data: [{ id: PET_ID }], error: null };
  });
  await createRemoteStore(client).reusePetPhotosForOccurrence(PET_ID, OCCURRENCE_ID);
  const insert = calls.find((call) => call.table === "occurrence_photos" && call.action === "insert");
  assert.equal(insert.payload.length, 1);
  assert.equal(insert.payload[0].storage_path, newPath);
});
