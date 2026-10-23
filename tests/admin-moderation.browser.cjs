const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const base = process.env.BASE_URL || "http://127.0.0.1:5176";
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => fs.existsSync(path));
const userId = "95000000-0000-4000-8000-000000000001";
const occurrenceId = "95200000-0000-4000-8000-000000000001";

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("http://127.0.0.1:9999/**", (route) => route.abort());
  await context.route("https://*.supabase.co/**", (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  try {
    await page.goto(`${base}/#admin/ocorrencias`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BPRealApp && window.BPRemoteStore && window.BPAuth);
    await page.evaluate(({ userId, occurrenceId }) => {
      if (!window.BPSupabase.configured || new URL(window.BPSupabase.client.supabaseUrl).host !== "127.0.0.1:9999")
        throw new Error("Teste deve apontar somente ao endpoint fictício local.");
      const auth = window.BPAuth;
      auth.ready = Promise.resolve();
      auth.getSession = () => ({ userId });
      auth.getCurrentUser = () => ({ id: userId, name: "Moderadora local", email: "moderator@example.test", emailVerified: true, roles: ["moderador"], status: "active" });
      auth.hasRole = (role) => role === "moderador";
      const rows = Array.from({ length: 23 }, (_, index) => ({
        occurrence_id: index === 0 ? occurrenceId : `95200000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        occurrence_type: index === 1 ? "found" : "lost",
        occurrence_status: index === 1 ? "reunited" : "active",
        visibility: "public",
        city: "Cuiabá", region: index === 1 ? "Porto" : "Centro",
        public_reference: "Praça", last_seen_at: "2026-10-22T10:00:00.000Z",
        description: index === 1 ? "Animal encontrado para teste." : `Relato real de fixture ${index + 1}.`,
        created_at: new Date(Date.UTC(2026, 9, 23, 12, 0, 0) - index * 60_000).toISOString(),
        pet_name: index === 1 ? "Lua" : `Bolinha ${index + 1}`,
        pet_species: "dog", cover_photo_path: index === 0 ? `${userId}/${occurrenceId}.png` : null,
        total_count: 23,
      }));
      const auditRows = [];
      window.__moderationTest = { rows, history: auditRows, calls: [] };
      const client = window.BPSupabase.client;
      client.auth.getUser = async () => ({ data: { user: { id: userId } }, error: null });
      client.rpc = async (name, params = {}) => {
        window.__moderationTest.calls.push({ name, params });
        if (name === "admin_list_occurrences") {
          let filtered = rows.filter((row) => row.visibility !== "private");
          if (params.p_query) filtered = filtered.filter((row) =>
            row.occurrence_id === params.p_query || row.pet_name.toLowerCase().includes(params.p_query.toLowerCase())
            || row.description.toLowerCase().includes(params.p_query.toLowerCase()));
          if (params.p_type) filtered = filtered.filter((row) => row.occurrence_type === params.p_type);
          if (params.p_status) filtered = filtered.filter((row) => row.occurrence_status === params.p_status);
          if (params.p_visibility) filtered = filtered.filter((row) => row.visibility === params.p_visibility);
          if (params.p_created_from) filtered = filtered.filter((row) => row.created_at.slice(0, 10) >= params.p_created_from);
          if (params.p_created_to) filtered = filtered.filter((row) => row.created_at.slice(0, 10) <= params.p_created_to);
          const start = (params.p_page - 1) * params.p_page_size;
          return { data: filtered.slice(start, start + params.p_page_size).map((row) => ({ ...row, total_count: filtered.length })), error: null };
        }
        if (name === "admin_get_occurrence") {
          const row = rows.find((item) => item.occurrence_id === params.p_occurrence);
          return { data: row ? [{ ...row, updated_at: row.created_at, pet_breed: "SRD", pet_coat_description: "Caramelo", pet_distinctive_features: "Coleira azul", photos: [{ id: "95300000-0000-4000-8000-000000000001", storage_path: row.cover_photo_path, mime_type: "image/png", byte_size: 128, created_at: row.created_at }] }] : [], error: null };
        }
        if (name === "admin_moderate_occurrence") {
          const row = rows.find((item) => item.occurrence_id === params.p_occurrence);
          row.visibility = params.p_action === "hide" ? "under_review" : "public";
          const action = params.p_action === "hide" ? "occurrence_hidden" : "occurrence_restored";
          auditRows.unshift({ actor_name: "Moderadora local", action, reason: params.p_reason, created_at: new Date().toISOString(), total_count: auditRows.length + 1 });
          return { data: [{ occurrence_id: row.occurrence_id, visibility: row.visibility, action, changed_at: new Date().toISOString() }], error: null };
        }
        if (name === "admin_list_occurrence_audit") return { data: auditRows.map((entry) => ({ ...entry })), error: null };
        return { data: [], error: null };
      };
      client.storage.from = (bucket) => {
        if (bucket !== "pet-media") throw new Error("Bucket inesperado");
        return { download: async () => ({ data: new Blob(["png"], { type: "image/png" }), error: null }) };
      };
      window.BPRealApp.mount();
      history.replaceState({}, "", "#admin/ocorrencias");
      void window.BPRealApp.render();
    }, { userId, occurrenceId });

    await page.getByRole("heading", { name: "Moderação de ocorrências" }).waitFor();
    await page.waitForFunction(() => document.querySelector("#admin-occurrence-results-status")?.textContent.includes("ocorrências disponíveis"), null, { timeout: 10000 })
      .catch(async () => { throw new Error(`Fila não carregou: ${await page.locator("#real-screen").innerText()} | RPCs: ${JSON.stringify(await page.evaluate(() => window.__moderationTest.calls))}`); });
    await page.getByRole("button", { name: "Próxima" }).click();
    await page.getByText("21–23 de 23").waitFor();
    await page.getByRole("button", { name: "Anterior" }).click();
    await page.locator("#admin-occurrence-query").fill("Lua");
    await page.getByText("1 ocorrência disponível.").waitFor();
    await page.getByRole("combobox", { name: "Tipo" }).selectOption("found");
    await page.getByText("1 ocorrência disponível.").waitFor();
    await page.getByRole("combobox", { name: "Situação" }).selectOption("reunited");
    await page.getByText("1 ocorrência disponível.").waitFor();
    await page.getByRole("combobox", { name: "Tipo" }).selectOption("");
    await page.getByRole("combobox", { name: "Situação" }).selectOption("");
    await page.locator("#admin-occurrence-query").fill("");
    await page.getByText("23 ocorrências disponíveis.").waitFor();

    await page.getByRole("link", { name: "Analisar ocorrência" }).first().click();
    await page.getByRole("heading", { name: /Bolinha 1 · Em busca/ }).waitFor();
    await page.locator(".admin-occurrence-photos img").waitFor();
    await page.locator("#admin-occurrence-reason").fill("Possível duplicidade analisada pela equipe.");
    await page.getByRole("button", { name: "Ocultar publicação" }).click();
    await page.getByText("Ocorrência ocultada", { exact: true }).waitFor();
    await page.getByText("Possível duplicidade analisada pela equipe.").waitFor();
    assert.equal(await page.locator("#admin-occurrence-title").innerText(), "Bolinha 1 · Em busca");
    await page.locator("#admin-occurrence-reason").fill("Revisão concluída, publicação pode voltar.");
    await page.getByRole("button", { name: "Restaurar visibilidade pública" }).click();
    await page.getByText("Publicação restaurada", { exact: true }).waitFor();
    assert.equal(await page.locator("#admin-occurrence-title").innerText(), "Bolinha 1 · Em busca",
      "moderação altera visibilidade sem mudar status da ocorrência");

    const widths = [320, 390, 768, 1440];
    const overflow = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      overflow.push(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1));
    }
    assert.deepEqual(overflow, [false, false, false, false]);
    assert.deepEqual(errors, []);
    const calls = await page.evaluate(() => window.__moderationTest.calls.map((call) => call.name));
    assert.ok(calls.includes("admin_list_occurrences"));
    assert.ok(calls.includes("admin_get_occurrence"));
    assert.ok(calls.includes("admin_moderate_occurrence"));
    assert.ok(calls.includes("admin_list_occurrence_audit"));

    console.log(JSON.stringify({
      result: "passed",
      backend: "local fake endpoint with blocked network and fixture-only rows",
      checks: ["search", "type/status filters", "pagination", "photo detail", "hide/restore", "audit", "status preserved"],
      responsiveWidths: widths,
      horizontalOverflow: overflow.some(Boolean),
      pageErrors: errors,
    }, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
