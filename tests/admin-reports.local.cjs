/* End-to-end report flow against loopback Supabase Auth, Postgres RPC/RLS and private Storage. */
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
  || !anonKey || !serviceKey) throw new Error("Use somente URL e chaves do Supabase local.");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const users = [];
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((file) => fs.existsSync(file));
let occurrenceId = "";
let hiddenOccurrenceId = "";
let petId = "";
let photoPath = "";
let browser;
let context;

async function account(role = null, status = "active") {
  const email = `reports-${randomUUID()}@example.test`;
  const password = `local-${randomUUID()}-Pass1!`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  users.push(created.data.user.id);
  if (status !== "active") {
    const changed = await service.from("profiles").update({ status }).eq("id", created.data.user.id);
    if (changed.error) throw changed.error;
  }
  if (role) {
    const granted = await service.from("user_roles").insert({ user_id: created.data.user.id, role });
    if (granted.error) throw granted.error;
  }
  return { id: created.data.user.id, email, password };
}

async function login(client, profile) {
  const result = await client.auth.signInWithPassword({ email: profile.email, password: profile.password });
  if (result.error) throw result.error;
}

function runLocalSql(sql) {
  const file = path.join(os.tmpdir(), `buscapet-report-cleanup-${randomUUID()}.sql`);
  fs.writeFileSync(file, sql, { flag: "wx" });
  try {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `npx.cmd supabase db query --local --file ${file}`], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true, stdio: "pipe",
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

(async () => {
  try {
    const owner = await account();
    const reporter = await account();
    const other = await account();
    const moderatorA = await account("moderador");
    const suspended = await account(null, "suspended");
    occurrenceId = randomUUID();
    petId = randomUUID();
    const photoId = randomUUID();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=", "base64");
    photoPath = `${owner.id}/${photoId}.png`;

    let result = await service.from("pets").insert({ id: petId, owner_id: owner.id, name: "Pet de denúncia local", species: "dog" });
    if (result.error) throw result.error;
    result = await service.from("occurrences").insert({
      id: occurrenceId, pet_id: petId, reporter_id: owner.id, type: "lost",
      status: "active", visibility: "public", city: "Cuiabá", region: "Centro",
      public_reference: "Praça de teste", last_seen_at: new Date().toISOString(),
      description: "Ocorrência pública sintética para validar denúncia local.",
    });
    if (result.error) throw result.error;
    hiddenOccurrenceId = randomUUID();
    result = await service.from("occurrences").insert({
      id: hiddenOccurrenceId, pet_id: petId, reporter_id: owner.id, type: "found",
      status: "active", visibility: "under_review", city: "Cuiabá", region: "Porto",
      last_seen_at: new Date().toISOString(),
      description: "Ocorrência oculta sintética para validar a central local.",
    });
    if (result.error) throw result.error;
    result = await service.storage.from("pet-media").upload(photoPath, png, { contentType: "image/png", upsert: false });
    if (result.error) throw result.error;
    result = await service.from("occurrence_photos").insert({
      id: photoId, occurrence_id: occurrenceId, uploaded_by: owner.id,
      storage_path: photoPath, mime_type: "image/png", byte_size: png.length,
    });
    if (result.error) throw result.error;

    const reporterClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const otherClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const moderatorClientA = createClient(url, anonKey, { auth: { persistSession: false } });
    const suspendedClient = createClient(url, anonKey, { auth: { persistSession: false } });
    await login(reporterClient, reporter);
    await login(otherClient, other);
    await login(moderatorClientA, moderatorA);
    await login(suspendedClient, suspended);

    const anonymousDenied = await anonymous.rpc("report_occurrence", {
      p_occurrence: occurrenceId, p_category: "other", p_description: "Tentativa anônima de denúncia inválida.",
    });
    assert.equal(anonymousDenied.error?.code, "42501");
    const suspendedDenied = await suspendedClient.rpc("report_occurrence", {
      p_occurrence: occurrenceId, p_category: "other", p_description: "Conta suspensa tentando denunciar.",
    });
    assert.equal(suspendedDenied.error?.code, "42501");
    const ownDenied = await reporterClient.rpc("admin_list_occurrence_reports");
    assert.equal(ownDenied.error?.code, "42501");
    const otherReportState = await otherClient.rpc("get_my_active_occurrence_report", { p_occurrence: occurrenceId });
    assert.deepEqual(otherReportState.data, [], "other account must not see reporter's active report");

    const secondReportResult = await otherClient.rpc("report_occurrence", {
      p_occurrence: occurrenceId, p_category: "suspected_fraud", p_description: "Outra pessoa observou suspeita de fraude.",
    });
    if (secondReportResult.error) throw secondReportResult.error;
    const secondReportId = secondReportResult.data[0].report_id;

    const started = await moderatorClientA.rpc("admin_transition_occurrence_report", {
      p_report: secondReportId, p_status: "in_review", p_reason: null,
    });
    if (started.error) throw started.error;
    const dismissed = await moderatorClientA.rpc("admin_transition_occurrence_report", {
      p_report: secondReportId, p_status: "dismissed", p_reason: "Revisão confirmou ausência de violação.",
    });
    if (dismissed.error) throw dismissed.error;

    browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("http://127.0.0.1:54321/**", (route) => route.continue());
    await context.route("http://localhost:54321/**", (route) => route.continue());
    await context.route("https://**", (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto(`${base}/#denunciar/${occurrenceId}`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/#login$/);
    await page.locator('#real-login [name="email"]').fill(reporter.email);
    await page.locator('#real-login [name="password"]').fill(reporter.password);
    await page.locator('#real-login button[type="submit"]').click();
    await page.waitForURL(new RegExp(`#denunciar/${occurrenceId}$`));
    await page.getByRole("heading", { name: "Denunciar alerta" }).waitFor();
    await page.locator("#real-report-category").selectOption("duplicate_occurrence");
    await page.locator("#real-report-description").fill("Suspeita de duplicidade confirmada pela análise comunitária.");
    await page.locator("#real-occurrence-report-form button[type=submit]").click();
    await page.getByText("Denúncia registrada. Obrigado por ajudar na análise da comunidade.", { exact: true }).waitFor();
    const duplicate = await reporterClient.rpc("report_occurrence", {
      p_occurrence: occurrenceId, p_category: "other", p_description: "Envio repetido para validar a deduplicação.",
    });
    if (duplicate.error) throw duplicate.error;
    assert.equal(duplicate.data[0].already_active, true);
    const submittedId = duplicate.data[0].report_id;

    await page.goto(`${base}/#denunciar/${occurrenceId}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Você já enviou uma denúncia ativa", { exact: true }).waitFor();
    assert.equal(await page.locator("#real-occurrence-report-form").count(), 0);
    const commonCounts = await reporterClient.rpc("admin_occurrence_report_counts");
    assert.equal(commonCounts.error?.code, "42501");

    await page.goto(`${base}/#minha-conta`, { waitUntil: "domcontentloaded" });
    await page.locator('[data-action="logout"]').click();
    await page.waitForFunction(() => window.BPAuth.getSession() === null);
    await page.goto(`${base}/#login`, { waitUntil: "domcontentloaded" });
    await page.locator('#real-login [name="email"]').fill(moderatorA.email);
    await page.locator('#real-login [name="password"]').fill(moderatorA.password);
    await page.locator('#real-login button[type="submit"]').click();
    await page.waitForURL(/#painel-tutor$/);
    await page.goto(`${base}/#admin/moderacao`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Central de moderação" }).waitFor();
    await page.getByText("Denúncias abertas", { exact: true }).waitFor();
    await page.locator("#admin-moderation-query").fill(submittedId);
    await page.getByText("1 item encontrado.", { exact: true }).waitFor();
    const centralText = await page.locator("#admin-moderation-results").innerText();
    assert.equal(centralText.includes(reporter.email), false, "central must not expose reporter contact data");
    assert.equal(centralText.includes(reporter.id), false, "central must not expose reporter identifiers");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(dimensions.scroll <= dimensions.client + 1, `central should not overflow at ${width}px`);
    }
    await page.getByRole("link", { name: "Analisar denúncia" }).click();
    await page.getByRole("heading", { name: "Análise da denúncia" }).waitFor();
    assert.equal((await page.locator(".admin-report-detail").innerText()).includes(reporter.email), false);
    await page.locator(".admin-report-detail a.back-link").click();
    await page.waitForURL(/#admin\/moderacao$/);
    assert.equal(await page.locator("#admin-moderation-query").inputValue(), submittedId, "central filters persist when returning from contextual details");
    await page.locator("#admin-moderation-kind").selectOption("occurrence");
    await page.locator("#admin-moderation-status").selectOption("under_review");
    await page.locator("#admin-moderation-query").fill(hiddenOccurrenceId);
    await page.getByText("1 item encontrado.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Analisar ocorrência" }).click();
    await page.getByRole("heading", { name: /Pet de denúncia local/ }).waitFor();
    await page.locator("#admin-occurrence-reason").fill("Revisão local concluída; publicação pode ser restaurada.");
    await page.getByRole("button", { name: "Restaurar visibilidade pública" }).click();
    await page.getByText("Visibilidade restaurada e decisão registrada.", { exact: true }).waitFor();
    const restoredCheck = await service.from("occurrences").select("status,visibility").eq("id", hiddenOccurrenceId).single();
    assert.equal(restoredCheck.data.visibility, "public");
    assert.equal(restoredCheck.data.status, "active", "visibility action must not change the occurrence search status");
    await page.locator(".admin-occurrence-detail a.back-link").click();
    await page.waitForURL(/#admin\/moderacao$/);
    assert.equal(await page.locator("#admin-moderation-query").inputValue(), hiddenOccurrenceId);
    await page.getByText("0 itens encontrados.", { exact: true }).waitFor();
    await page.goto(`${base}/#admin/denuncias`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Denúncias" }).waitFor();
    await page.locator("#admin-report-query").fill(submittedId);
    await page.getByText("1 denúncia encontrada.", { exact: true }).waitFor();
    const queueText = await page.locator("#admin-report-results").innerText();
    assert.equal(queueText.includes(reporter.email), false, "report queue must not expose reporter contact data");
    assert.equal(queueText.includes(reporter.id), false, "report queue must not expose reporter identifiers");
    await page.getByRole("link", { name: "Analisar denúncia" }).click();
    await page.getByRole("heading", { name: "Análise da denúncia" }).waitFor();
    await page.getByText("Suspeita de duplicidade confirmada pela análise comunitária.", { exact: true }).waitFor();
    const detailText = await page.locator(".admin-report-detail").innerText();
    assert.equal(detailText.includes(reporter.email), false);
    assert.equal(detailText.includes(reporter.id), false);
    await page.getByRole("button", { name: "Iniciar análise" }).click();
    await page.locator("#admin-report-status-choice").waitFor();
    await page.locator("#admin-report-status-choice").selectOption("resolved");
    await page.locator("#admin-report-reason").fill("Análise concluiu que a denúncia procede.");
    await page.getByRole("button", { name: "Registrar decisão" }).click();
    await page.getByText("Denúncia resolvida", { exact: true }).waitFor();
    await page.getByText("Análise concluiu que a denúncia procede.", { exact: false }).waitFor();

    await page.getByRole("link", { name: "Abrir moderação do alerta e fotografias autorizadas" }).click();
    await page.getByRole("heading", { name: /Pet de denúncia local/ }).waitFor();
    await page.locator(".admin-occurrence-photos img").waitFor();
    const statusCheck = await service.from("occurrences").select("status,visibility").eq("id", occurrenceId).single();
    assert.equal(statusCheck.data.status, "active");
    assert.equal(statusCheck.data.visibility, "public", "a report decision must not hide the occurrence automatically");
    const publicFeed = await anonymous.from("occurrences").select("id").eq("id", occurrenceId);
    assert.equal(publicFeed.data.length, 1, "the public feed remains available after report resolution");
    assert.deepEqual(errors, []);

    console.log(JSON.stringify({
      result: "passed",
      backend: "local Supabase Auth, PostgreSQL RPC/RLS and private Storage",
      checks: ["authenticated submission", "anonymous and suspended denial", "per-user privacy", "duplicate prevention", "moderator triage and dismissal", "unified report/hidden-occurrence queue", "combined search and source-detail links", "filter and pagination state preserved on return", "reporter identity omitted", "contextual occurrence restore with audit", "occurrence search status unchanged", "responsive widths 320/390/768/1440", "resolution and audit", "authorized linked photo", "public occurrence unchanged"],
      browserErrors: errors,
    }, null, 2));
  } finally {
    await context?.close();
    await browser?.close();
    const cleanupErrors = [];
    if (photoPath) {
      const removed = await service.storage.from("pet-media").remove([photoPath]);
      if (removed.error) cleanupErrors.push("Local Storage fixture cleanup failed");
    }
    if (occurrenceId) {
      try { runLocalSql(`delete from buscapet_private.occurrence_reports where occurrence_id = '${occurrenceId}'`); }
      catch { cleanupErrors.push("Local report/history fixture cleanup failed"); }
      const removedOccurrence = await service.from("occurrences").delete().eq("id", occurrenceId);
      if (removedOccurrence.error) cleanupErrors.push("Local occurrence fixture cleanup failed");
    }
    if (hiddenOccurrenceId) {
      try { runLocalSql(`delete from buscapet_private.admin_audit where occurrence_id = '${hiddenOccurrenceId}'`); }
      catch { cleanupErrors.push("Local moderation audit fixture cleanup failed"); }
      const removedHidden = await service.from("occurrences").delete().eq("id", hiddenOccurrenceId);
      if (removedHidden.error) cleanupErrors.push("Local hidden occurrence fixture cleanup failed");
    }
    if (petId) {
      const removedPet = await service.from("pets").delete().eq("id", petId);
      if (removedPet.error) cleanupErrors.push("Local pet fixture cleanup failed");
    }
    for (const id of users) {
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error) cleanupErrors.push("Local test account cleanup failed");
    }
    if (cleanupErrors.length) {
      console.error(cleanupErrors.join("; "));
      process.exitCode = 1;
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
