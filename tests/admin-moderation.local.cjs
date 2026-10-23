/* Browser -> local Supabase Auth, RPC and private Storage integration.
 * Requires local loopback URLs plus local anon/service keys. It creates and
 * removes only synthetic local accounts and records.
 */
const { chromium } = require("playwright-core");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const base = process.env.BASE_URL || "http://127.0.0.1:5177";
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url || "")
  || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)
  || !anonKey || !serviceKey) throw new Error("Use somente URLs e chaves do Supabase local.");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => fs.existsSync(path));
const users = [];
let photoPath = "";
let occurrenceId = "";
let browser;

async function createAccount(role = null) {
  const email = `moderation-${randomUUID()}@example.test`;
  const password = `local-${randomUUID()}-Pass1!`;
  const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error) throw result.error;
  users.push(result.data.user.id);
  if (role) {
    const granted = await service.from("user_roles").insert({ user_id: result.data.user.id, role });
    if (granted.error) throw granted.error;
  }
  return { id: result.data.user.id, email, password };
}

async function removeAuditRows(occurrenceId) {
  const sql = `delete from buscapet_private.admin_audit where occurrence_id = '${occurrenceId}'`;
  const sqlFile = path.join(os.tmpdir(), `buscapet-moderation-cleanup-${randomUUID()}.sql`);
  fs.writeFileSync(sqlFile, sql, { flag: "wx" });
  try {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `npx.cmd supabase db query --local --file ${sqlFile}`], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true, stdio: "pipe",
    });
  } finally {
    fs.rmSync(sqlFile, { force: true });
  }
}

(async () => {
  let context;
  try {
    const moderator = await createAccount("moderador");
    const owner = await createAccount();
    occurrenceId = randomUUID();
    const petId = randomUUID();
    const photoId = randomUUID();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=", "base64");
    photoPath = `${owner.id}/${photoId}.png`;

    let result = await service.from("pets").insert({ id: petId, owner_id: owner.id, name: "Pet de teste local", species: "dog" });
    if (result.error) throw result.error;
    result = await service.from("occurrences").insert({
      id: occurrenceId, pet_id: petId, reporter_id: owner.id, type: "lost",
      status: "active", visibility: "public", city: "Cuiabá", region: "Centro",
      public_reference: "Praça pública", last_seen_at: new Date().toISOString(),
      description: "Ocorrência sintética para teste local de moderação.",
    });
    if (result.error) throw result.error;
    result = await service.storage.from("pet-media").upload(photoPath, png, { contentType: "image/png", upsert: false });
    if (result.error) throw result.error;
    result = await service.from("occurrence_photos").insert({
      id: photoId, occurrence_id: occurrenceId, uploaded_by: owner.id,
      storage_path: photoPath, mime_type: "image/png", byte_size: png.length,
    });
    if (result.error) throw result.error;

    const ownerClient = createClient(url, anonKey, { auth: { persistSession: false } });
    result = await ownerClient.auth.signInWithPassword({ email: owner.email, password: owner.password });
    if (result.error) throw result.error;
    const forbidden = await ownerClient.rpc("admin_list_occurrences");
    assert.equal(forbidden.error?.code, "42501", "usuário comum deve ser rejeitado pelo RPC real");
    const moderatorClient = createClient(url, anonKey, { auth: { persistSession: false } });
    result = await moderatorClient.auth.signInWithPassword({ email: moderator.email, password: moderator.password });
    if (result.error) throw result.error;
    const list = await moderatorClient.rpc("admin_list_occurrences", {
      p_query: "Pet de teste local", p_type: "lost", p_status: "active",
      p_visibility: "public", p_created_from: null, p_created_to: null, p_page: 1, p_page_size: 20,
    });
    if (list.error) throw list.error;
    assert.ok(list.data.some((row) => row.occurrence_id === occurrenceId));

    browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("http://127.0.0.1:54321/**", (route) => route.continue());
    await context.route("http://localhost:54321/**", (route) => route.continue());
    await context.route("https://**/*", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
    await page.goto(`${base}/#login`, { waitUntil: "domcontentloaded" });
    await page.locator('#real-login [name="email"]').fill(moderator.email);
    await page.locator('#real-login [name="password"]').fill(moderator.password);
    await page.locator('#real-login button[type="submit"]').click();
    await page.waitForURL(/#painel-tutor$/);
    await page.goto(`${base}/#admin/ocorrencias`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const status = document.querySelector("#admin-occurrence-results-status")?.textContent || "";
      return status && !status.includes("Carregando");
    }, null, { timeout: 10000 }).catch(async () => {
      throw new Error(`Fila não terminou: ${await page.locator("#real-screen").innerText()}`);
    });
    const queueText = await page.locator("#real-screen").innerText();
    if (!queueText.includes("Pet de teste local")) throw new Error(`Ocorrência não apareceu na fila: ${queueText}`);
    await page.getByRole("link", { name: "Analisar ocorrência" }).click();
    await page.getByRole("heading", { name: /Pet de teste local/ }).waitFor();
    await page.locator(".admin-occurrence-photos img").waitFor();

    await page.locator("#admin-occurrence-reason").fill("Duplicidade confirmada no teste de integração local.");
    await page.getByRole("button", { name: "Ocultar publicação" }).click();
    await page.getByText("Ocorrência ocultada", { exact: true }).waitFor();
    const hidden = await anonymous.from("occurrences").select("id,status,visibility").eq("id", occurrenceId);
    assert.equal(hidden.data.length, 0, "alerta ocultado precisa sair do feed anônimo");
    const stillHidden = await service.from("occurrences").select("status,visibility").eq("id", occurrenceId).single();
    assert.equal(stillHidden.data.status, "active", "a decisão não deve alterar o status da busca");
    assert.equal(stillHidden.data.visibility, "under_review");
    const ownerDenied = await ownerClient.rpc("admin_get_occurrence", { p_occurrence: occurrenceId });
    assert.equal(ownerDenied.error?.code, "42501", "usuário comum não pode contornar a interface");

    await page.locator("#admin-occurrence-reason").fill("Revisão concluída, alerta pode ser restaurado.");
    await page.getByRole("button", { name: "Restaurar visibilidade pública" }).click();
    await page.getByText("Publicação restaurada", { exact: true }).waitFor();
    const restored = await anonymous.from("occurrences").select("id,status,visibility").eq("id", occurrenceId).single();
    assert.equal(restored.data.visibility, "public", "restauração volta a expor a ocorrência pelo feed público");
    assert.equal(restored.data.status, "active");
    await page.getByText("Duplicidade confirmada no teste de integração local.").waitFor();
    await page.getByText("Revisão concluída, alerta pode ser restaurado.").waitFor();
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      result: "passed",
      backend: "local Supabase Auth, RPC, RLS and private Storage",
      checks: ["moderator login", "real queue/detail", "private photo read for moderator", "common-user RPC denial", "hide/restore", "public feed visibility", "status preserved", "audit"],
      browserErrors: errors,
    }, null, 2));
  } finally {
    await context?.close();
    await browser?.close();
    const cleanupErrors = [];
    if (photoPath) {
      const removed = await service.storage.from("pet-media").remove([photoPath]);
      if (removed.error) cleanupErrors.push("Storage object cleanup failed");
    }
    for (const id of users) {
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error) cleanupErrors.push("Local test account cleanup failed");
    }
    if (occurrenceId) {
      try { await removeAuditRows(occurrenceId); }
      catch { cleanupErrors.push("Local test audit cleanup failed"); }
    }
    if (cleanupErrors.length) {
      console.error(cleanupErrors.join("; "));
      process.exitCode = 1;
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
