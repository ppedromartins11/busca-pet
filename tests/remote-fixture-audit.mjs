/* Leitura de um manifesto de fixture remoto. Sem operações de escrita. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ref = "jpnvizdhyrvliqgvyxzx";
const manifest = JSON.parse(readFileSync(process.env.BUSCAPET_TEST_MANIFEST, "utf8"));
assert.equal(manifest.project, ref);
const key = process.env.BUSCAPET_TEST_SERVICE_ROLE_KEY;
assert(key && /^(?:eyJ|sb_secret_)/.test(key));
const client = createClient(`https://${ref}.supabase.co`, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const remainingUsers = [], remainingObjects = [];
for (const id of manifest.users) {
  const auth = await client.auth.admin.getUserById(id);
  if (auth.data?.user) remainingUsers.push(id);
  else if (!auth.error || (auth.error.status !== 404 && auth.error.code !== "user_not_found"))
    throw Error(`Auth ${id}: resposta inesperada ao verificar exclusão (${auth.error?.status || auth.error?.code || "sem código"})`);
  const folder = await client.storage.from("pet-media").list(id, { limit: 100 });
  if (folder.error) throw Error(`Storage ${id}: ${folder.error.message}`);
  for (const item of folder.data || []) if (item.id) remainingObjects.push(`${id}/${item.name}`);
}
for (const objectPath of manifest.paths) {
  const file = await client.storage.from("pet-media").download(objectPath);
  if (file.data && !file.error) remainingObjects.push(objectPath);
}
for (let page = 1; page <= 10; page++) {
  const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (result.error) throw Error(`Auth listUsers: ${result.error.message}`);
  const users = result.data?.users || [];
  for (const user of users) if (manifest.emails.includes(user.email)) remainingUsers.push(user.id);
  if (users.length < 1000) break;
  if (page === 10) throw Error("Auditoria Auth atingiu limite de páginas.");
}
console.log(JSON.stringify({
  project: ref, runId: manifest.runId,
  authUsersRemaining: [...new Set(remainingUsers)],
  storageObjectsRemaining: [...new Set(remainingObjects)],
  petRows: "não verificáveis pela service_role: sem SELECT em public.pets",
}, null, 2));
if (remainingUsers.length || remainingObjects.length) process.exitCode = 1;
