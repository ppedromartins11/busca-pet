/* Competing authenticated moderation decisions against local Auth, PostgREST and PostgreSQL. */
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url || "") || !anonKey || !serviceKey)
  throw new Error("Use somente URL e chaves do Supabase local.");

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const users = [];
let occurrenceId = "";
let petId = "";

async function account(role = null) {
  const email = `report-race-${randomUUID()}@example.test`;
  const password = `local-${randomUUID()}-Pass1!`;
  const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error) throw result.error;
  users.push(result.data.user.id);
  if (role) {
    const grant = await service.from("user_roles").insert({ user_id: result.data.user.id, role });
    if (grant.error) throw grant.error;
  }
  return { id: result.data.user.id, email, password };
}

async function signIn(user) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw error;
  return client;
}

function runLocalSql(sql) {
  const file = path.join(os.tmpdir(), `buscapet-report-race-${randomUUID()}.sql`);
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
    const moderatorA = await account("moderador");
    const moderatorB = await account("moderador");
    occurrenceId = randomUUID();
    petId = randomUUID();
    const petInsert = await service.from("pets").insert({
      id: petId, owner_id: owner.id, name: "Pet de concorrência local", species: "dog",
    });
    if (petInsert.error) throw petInsert.error;
    const occurrenceInsert = await service.from("occurrences").insert({
      id: occurrenceId, pet_id: petId, reporter_id: owner.id, type: "lost", status: "active",
      visibility: "public", city: "Cuiabá", region: "Centro", public_reference: "Praça de teste",
      last_seen_at: new Date().toISOString(), description: "Alerta público sintético para disputa de decisões.",
    });
    if (occurrenceInsert.error) throw occurrenceInsert.error;

    const [reporterClient, moderatorClientA, moderatorClientB] = await Promise.all([
      signIn(reporter), signIn(moderatorA), signIn(moderatorB),
    ]);
    const submitted = await reporterClient.rpc("report_occurrence", {
      p_occurrence: occurrenceId, p_category: "other", p_description: "Relato de teste para triagem concorrente.",
    });
    if (submitted.error) throw submitted.error;
    const reportId = submitted.data[0].report_id;
    const started = await moderatorClientA.rpc("admin_transition_occurrence_report", {
      p_report: reportId, p_status: "in_review", p_reason: null,
    });
    if (started.error) throw started.error;

    const startedAt = Date.now();
    const decisions = await Promise.all([
      moderatorClientA.rpc("admin_transition_occurrence_report", {
        p_report: reportId, p_status: "resolved", p_reason: "Decisão concorrente do moderador A.",
      }),
      moderatorClientB.rpc("admin_transition_occurrence_report", {
        p_report: reportId, p_status: "dismissed", p_reason: "Decisão concorrente do moderador B.",
      }),
    ]);
    const durationMs = Date.now() - startedAt;
    const winners = decisions.filter((result) => !result.error);
    const losers = decisions.filter((result) => result.error);
    assert.equal(winners.length, 1, "exactly one competing terminal decision must commit");
    assert.equal(losers.length, 1, "exactly one competing terminal decision must conflict");
    assert.equal(losers[0].error.code, "PT409", "losing transition must be a non-retryable HTTP conflict");
    assert.ok(durationMs < 15000, `competing RPCs took ${durationMs} ms; possible gateway retry/timeout`);

    const details = await moderatorClientA.rpc("admin_get_occurrence_report", { p_report: reportId });
    assert.equal(details.error, null);
    assert.equal(details.data.length, 1);
    const committedStatus = winners[0].data[0].report_status;
    assert.equal(details.data[0].report_status, committedStatus, "persisted report state must match the sole winner");
    const history = await moderatorClientA.rpc("admin_list_occurrence_report_history", {
      p_report: reportId, p_page: 1, p_page_size: 20,
    });
    assert.equal(history.error, null);
    assert.equal(Number(history.data[0].total_count), 3, "history must contain submit, review start and one decision");
    const terminal = history.data.filter((entry) => ["resolved", "dismissed"].includes(entry.action));
    assert.equal(terminal.length, 1, "the losing request must not append a second history event");
    assert.equal(terminal[0].to_status, committedStatus, "history terminal status must match the report");
    assert.equal(terminal[0].reason, winners[0].data[0].report_status === "resolved"
      ? "Decisão concorrente do moderador A." : "Decisão concorrente do moderador B.");

    console.log(JSON.stringify({
      result: "passed",
      postgrest: "v14.18",
      raceDurationMs: durationMs,
      winner: committedStatus,
      loserCode: losers[0].error.code,
      finalHistoryEntries: terminal.length,
      persistedStateAndAuditMatch: true,
    }, null, 2));
  } finally {
    if (occurrenceId) {
      try { runLocalSql(`delete from buscapet_private.occurrence_reports where occurrence_id = '${occurrenceId}'`); }
      catch { console.error("Local report/history fixture cleanup failed"); process.exitCode = 1; }
      const removedOccurrence = await service.from("occurrences").delete().eq("id", occurrenceId);
      if (removedOccurrence.error) { console.error("Local occurrence fixture cleanup failed"); process.exitCode = 1; }
    }
    if (petId) {
      const removedPet = await service.from("pets").delete().eq("id", petId);
      if (removedPet.error) { console.error("Local pet fixture cleanup failed"); process.exitCode = 1; }
    }
    for (const id of users) {
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error) { console.error("Local test account cleanup failed"); process.exitCode = 1; }
    }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
