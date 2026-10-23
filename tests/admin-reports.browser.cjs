const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const base = process.env.BASE_URL || "http://127.0.0.1:5176";
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => fs.existsSync(path));
const userId = "96000000-0000-4000-8000-000000000001";
const moderatorId = "96000000-0000-4000-8000-000000000002";
const occurrenceId = "96200000-0000-4000-8000-000000000001";
const reportId = "96300000-0000-4000-8000-000000000001";

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("http://127.0.0.1:9999/**", (route) => route.abort());
  await context.route("https://**", (route) => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.goto(`${base}/#login`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BPRealApp && window.BPRemoteStore && window.BPAuth);
    await page.evaluate(({ userId, moderatorId, occurrenceId, reportId }) => {
      if (!window.BPSupabase.configured || new URL(window.BPSupabase.client.supabaseUrl).host !== "127.0.0.1:9999")
        throw new Error("Teste deve usar somente endpoint fictício local.");
      let moderator = false;
      const occurrence = {
        id: occurrenceId, reporter_id: "96100000-0000-4000-8000-000000000001",
        status: "active", visibility: "public", type: "lost", city: "Cuiabá", region: "Centro",
        public_reference: "Praça", last_seen_at: "2026-10-23T12:00:00.000Z",
        description: "Descrição pública do alerta", pet_id: null,
      };
      const reports = [];
      const history = new Map();
      let nextId = 2;
      const makeReport = (id, status = "open") => ({
        report_id: id, occurrence_id: occurrenceId, category: "duplicate_occurrence",
        description: `Relato de fixture ${id}`, report_status: status,
        created_at: new Date(Date.UTC(2026, 9, 23, 12, 0, 0) - nextId * 60_000).toISOString(),
        updated_at: new Date().toISOString(), occurrence_type: "lost", occurrence_status: "active",
        occurrence_visibility: "public", city: "Cuiabá", region: "Centro", public_reference: "Praça",
        pet_name: "Lua", pet_species: "dog", total_count: 0,
      });
      window.__reportTest = { reports, history, occurrence, calls: [] };
      const auth = window.BPAuth;
      auth.ready = Promise.resolve();
      auth.getSession = () => ({ userId: moderator ? moderatorId : userId });
      auth.getCurrentUser = () => ({ id: moderator ? moderatorId : userId, name: "Conta de teste", email: "fixture@example.test", emailVerified: true, roles: moderator ? ["moderador"] : ["tutor"], status: "active" });
      auth.hasRole = (role) => moderator ? role === "moderador" : role === "tutor";
      window.BPSupabase.client.auth.getUser = async () => ({ data: { user: { id: userId } }, error: null });
      const store = window.BPRemoteStore;
      store.getOccurrence = async () => ({ ...occurrence });
      store.getMyActiveOccurrenceReport = async (id) => reports.find((row) => row.occurrence_id === id && row.report_status === "open") || null;
      store.reportOccurrence = async (id, category, description) => {
        window.__reportTest.calls.push("report_occurrence");
        const active = reports.find((row) => row.occurrence_id === id && ["open", "in_review"].includes(row.report_status));
        if (active) return { report_id: active.report_id, report_status: active.report_status, already_active: true };
        const row = makeReport(reportId);
        row.category = category;
        row.description = description;
        row.total_count = ++nextId;
        reports.push(row);
        history.set(row.report_id, [{ actor_name: "Identidade protegida", action: "submitted", reason: null, created_at: row.created_at }]);
        return { report_id: row.report_id, report_status: row.report_status, already_active: false };
      };
      store.getAdminOccurrenceReportCounts = async () => ({
        open_count: reports.filter((row) => row.report_status === "open").length,
        in_review_count: reports.filter((row) => row.report_status === "in_review").length,
        resolved_count: reports.filter((row) => row.report_status === "resolved").length,
        dismissed_count: reports.filter((row) => row.report_status === "dismissed").length,
      });
      store.listAdminOccurrenceReports = async (options = {}) => {
        window.__reportTest.calls.push("admin_list_occurrence_reports");
        let rows = reports.filter((row) => row.reporter_id !== userId);
        if (options.query) rows = rows.filter((row) => row.report_id.includes(options.query) || row.occurrence_id.includes(options.query) || row.description.toLowerCase().includes(options.query.toLowerCase()) || (row.pet_name || "").toLowerCase().includes(options.query.toLowerCase()));
        if (options.status) rows = rows.filter((row) => row.report_status === options.status);
        if (options.category) rows = rows.filter((row) => row.category === options.category);
        if (options.createdFrom) rows = rows.filter((row) => row.created_at.slice(0, 10) >= options.createdFrom);
        if (options.createdTo) rows = rows.filter((row) => row.created_at.slice(0, 10) <= options.createdTo);
        rows = [...rows].sort((a, b) => options.order === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
        const total = rows.length;
        const offset = (options.page - 1) * options.pageSize;
        return { reports: rows.slice(offset, offset + options.pageSize), total };
      };
      store.getAdminOccurrenceReport = async (id) => {
        window.__reportTest.calls.push("admin_get_occurrence_report");
        const row = reports.find((item) => item.report_id === id);
        if (!row) throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
        return { ...row, occurrence_description: occurrence.description, pet_breed: "SRD", pet_coat_description: "Caramelo", pet_distinctive_features: "Coleira azul" };
      };
      store.listAdminOccurrenceReportHistory = async (id) => ({ entries: history.get(id) || [], total: (history.get(id) || []).length });
      store.transitionAdminOccurrenceReport = async (id, status, reason) => {
        const row = reports.find((item) => item.report_id === id);
        const from = row.report_status;
        row.report_status = status;
        row.updated_at = new Date().toISOString();
        history.get(id).unshift({ actor_name: "Moderadora local", action: status === "in_review" ? "review_started" : status, from_status: from, to_status: status, reason, created_at: row.updated_at });
        return { report_id: id, report_status: status, action: status, changed_at: row.updated_at };
      };
      const client = window.BPSupabase.client;
      client.auth.getUser = async () => ({ data: { user: { id: moderator ? moderatorId : userId } }, error: null });
      client.from = (table) => {
        const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: table === "occurrences" ? { ...occurrence } : null, error: null }) };
        return query;
      };
      client.rpc = async (name, params = {}) => {
        window.__reportTest.calls.push(name);
        if (name === "report_occurrence") {
          const active = reports.find((row) => row.reporter_id === userId && row.occurrence_id === params.p_occurrence && ["open", "in_review"].includes(row.report_status));
          if (active) return { data: [{ report_id: active.report_id, report_status: active.report_status, already_active: true }], error: null };
          const row = makeReport(reportId);
          row.reporter_id = userId;
          row.category = params.p_category;
          row.description = params.p_description;
          reports.push(row);
          history.set(row.report_id, [{ actor_name: "Identidade protegida", action: "submitted", reason: null, created_at: row.created_at }]);
          return { data: [{ report_id: row.report_id, report_status: row.report_status, already_active: false }], error: null };
        }
        if (name === "get_my_active_occurrence_report") {
          const row = reports.find((item) => item.reporter_id === userId && item.occurrence_id === params.p_occurrence && ["open", "in_review"].includes(item.report_status));
          return { data: row ? [{ report_id: row.report_id, report_status: row.report_status }] : [], error: null };
        }
        if (name === "admin_occurrence_report_counts") return { data: [{
          open_count: reports.filter((row) => row.report_status === "open").length,
          in_review_count: reports.filter((row) => row.report_status === "in_review").length,
          resolved_count: reports.filter((row) => row.report_status === "resolved").length,
          dismissed_count: reports.filter((row) => row.report_status === "dismissed").length,
        }], error: null };
        if (name === "admin_list_occurrence_reports") {
          let rows = reports.filter((row) => row.reporter_id !== moderatorId);
          if (params.p_query) rows = rows.filter((row) => row.report_id.includes(params.p_query) || row.occurrence_id.includes(params.p_query) || row.description.toLowerCase().includes(params.p_query.toLowerCase()) || (row.pet_name || "").toLowerCase().includes(params.p_query.toLowerCase()));
          if (params.p_status) rows = rows.filter((row) => row.report_status === params.p_status);
          if (params.p_category) rows = rows.filter((row) => row.category === params.p_category);
          if (params.p_created_from) rows = rows.filter((row) => row.created_at.slice(0, 10) >= params.p_created_from);
          if (params.p_created_to) rows = rows.filter((row) => row.created_at.slice(0, 10) <= params.p_created_to);
          rows = [...rows].sort((a, b) => params.p_order === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
          const total = rows.length;
          const offset = (params.p_page - 1) * params.p_page_size;
          return { data: rows.slice(offset, offset + params.p_page_size).map(({ reporter_id, ...row }) => ({ ...row, total_count: total })), error: null };
        }
        if (name === "admin_get_occurrence_report") {
          const row = reports.find((item) => item.report_id === params.p_report);
          if (!row || row.reporter_id === moderatorId) return { data: [], error: null };
          const { reporter_id, ...safe } = row;
          return { data: [{ ...safe, occurrence_description: occurrence.description, pet_breed: "SRD", pet_coat_description: "Caramelo", pet_distinctive_features: "Coleira azul" }], error: null };
        }
        if (name === "admin_transition_occurrence_report") {
          const row = reports.find((item) => item.report_id === params.p_report);
          const from = row.report_status;
          row.report_status = params.p_status;
          row.updated_at = new Date().toISOString();
          history.get(row.report_id).unshift({ actor_name: "Moderadora local", action: params.p_status === "in_review" ? "review_started" : params.p_status, from_status: from, to_status: params.p_status, reason: params.p_reason, created_at: row.updated_at });
          return { data: [{ report_id: row.report_id, report_status: row.report_status, action: row.report_status, changed_at: row.updated_at }], error: null };
        }
        if (name === "admin_list_occurrence_report_history") return { data: (history.get(params.p_report) || []).map((entry) => ({ ...entry, total_count: (history.get(params.p_report) || []).length })), error: null };
        return { data: [], error: null };
      };
      for (let i = 2; i <= 23; i += 1) {
        const row = makeReport(`96300000-0000-4000-8000-${String(i).padStart(12, "0")}`);
        row.reporter_id = "96100000-0000-4000-8000-000000000001";
        row.total_count = 23;
        reports.push(row);
        history.set(row.report_id, [{ actor_name: "Identidade protegida", action: "submitted", reason: null, created_at: row.created_at }]);
        nextId += 1;
      }
      window.__setReportModerator = (enabled) => { moderator = Boolean(enabled); };
    }, { userId, moderatorId, occurrenceId, reportId });
    await page.evaluate(() => { location.hash = `#denunciar/${"96200000-0000-4000-8000-000000000001"}`; });
    await page.getByRole("heading", { name: "Denunciar alerta" }).waitFor();
    await page.locator("#real-report-category").selectOption("duplicate_occurrence");
    await page.locator("#real-report-description").fill("Possível duplicidade que precisa ser analisada.");
    await page.locator("#real-occurrence-report-form button[type=submit]").click();
    await page.getByText("Denúncia registrada. Obrigado por ajudar na análise da comunidade.", { exact: true }).waitFor();
    await page.evaluate(() => { location.hash = "#denunciar/96200000-0000-4000-8000-000000000001"; });
    await page.getByText("Você já enviou uma denúncia ativa", { exact: true }).waitFor();
    assert.equal(await page.locator("#real-occurrence-report-form").count(), 0);

    await page.evaluate(() => { window.__setReportModerator(true); location.hash = "#admin/denuncias"; });
    await page.getByRole("heading", { name: "Denúncias", exact: true }).waitFor();
    await page.getByText("23 denúncias encontradas.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Próxima" }).click();
    await page.getByText("Página 2 de 2").waitFor();
    await page.locator("#admin-report-query").fill(reportId);
    await page.getByText("1 denúncia encontrada.", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Analisar denúncia" }).waitFor();
    await page.getByRole("link", { name: "Analisar denúncia" }).click();
    await page.getByRole("heading", { name: "Análise da denúncia" }).waitFor();
    await page.getByText("Possível duplicidade que precisa ser analisada.", { exact: true }).waitFor();
    assert.equal((await page.locator(".admin-report-detail").innerText()).includes("fixture@example.test"), false);
    await page.getByRole("button", { name: "Iniciar análise" }).click();
    await page.getByRole("heading", { name: "Análise da denúncia" }).waitFor();
    await page.locator("#admin-report-status-choice").waitFor();
    await page.locator("#admin-report-status-choice").selectOption("resolved");
    await page.locator("#admin-report-reason").fill("Conteúdo revisado e decisão confirmada.");
    await page.getByRole("button", { name: "Registrar decisão" }).click();
    await page.getByText("Decisão da denúncia registrada.", { exact: true }).waitFor();
    await page.getByText("Conteúdo revisado e decisão confirmada.", { exact: false }).waitFor();
    assert.equal(await windowStatus(page), "active");
    await page.goto(`${base}/#admin/denuncias`, { waitUntil: "domcontentloaded" });
    await page.locator("#admin-report-query").fill("");
    await page.waitForTimeout(400);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `overflow em ${width}px`);
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({
      result: "passed", backend: "fixture-only local browser; remote network blocked",
      checks: ["submission confirmation", "active duplicate notice", "admin queue", "pagination", "search", "triage", "resolution reason", "history", "reporter identity omitted"],
      responsiveWidths: [320, 390, 768, 1440], pageErrors: errors,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

function windowStatus(page) {
  return page.evaluate(() => window.__reportTest.occurrence.status);
}
