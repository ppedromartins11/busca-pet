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
