/* Regressões da SPA real com um Supabase fictício e respostas locais sintéticas.
 * Requer Vite com URL/key locais fictícios; o tráfego de rede é bloqueado.
 */
const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => fs.existsSync(path));
const userId = "11111111-1111-4111-8111-111111111111";
const petId = "22222222-2222-4222-8222-222222222222";
const occurrenceId = "33333333-3333-4333-8333-333333333333";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("https://*.supabase.co/**", (route) => route.abort());
  await context.route("http://127.0.0.1:9999/**", (route) => route.abort());
  await context.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
  const page = await context.newPage();
  const exceptions = [];
  page.on("pageerror", (error) => exceptions.push(error.message));

  try {
    await page.goto(`${base}/#services`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BPRealApp && window.BPRemoteStore && window.BPAuth);
    await page.evaluate(async ({ userId, petId, occurrenceId }) => {
      if (!window.BPSupabase.configured) throw new Error("Teste exige URL/key Supabase fictícias para montar o fluxo real.");
      if (new URL(window.BPSupabase.client.supabaseUrl).host !== "127.0.0.1:9999")
        throw new Error("Apenas o endpoint Supabase fictício local pode ser usado neste teste.");
      const auth = window.BPAuth;
      auth.ready = Promise.resolve();
      auth.getSession = () => ({ userId });
      auth.getCurrentUser = () => ({ id: userId, name: "Conta sintética", roles: ["tutor"], status: "active" });

      const occurrence = {
        id: occurrenceId, pet_id: petId, reporter_id: "44444444-4444-4444-8444-444444444444",
        type: "found", status: "active", visibility: "public", city: "Cuiabá", region: "Centro",
        public_reference: "Praça central", last_seen_at: new Date().toISOString(), description: "Animal encontrado perto da praça central.", reward_cents: 0,
      };
      window.__regression = { created: [], occurrence, rpc: [] };
      const client = window.BPSupabase.client;
      client.auth.getUser = async () => ({ data: { user: { id: userId } }, error: null });
      client.rpc = async (name) => {
        window.__regression.rpc.push(name);
        return { data: [], error: null };
      };
      client.from = (table) => {
        let action = "select", payload = null;
        const query = {
          select() { return query; },
          insert(value) { action = "insert"; payload = value; return query; },
          update(value) { action = "update"; payload = value; return query; },
          delete() { action = "delete"; return query; },
          eq() { return query; },
          order() { return query; },
          range() { return query; },
          maybeSingle: async () => {
            if (table === "occurrences" && action === "insert") {
              const saved = { ...payload, id: occurrenceId, reporter_id: userId, status: "active" };
              window.__regression.created.push(saved);
              window.__regression.occurrence = saved;
              return { data: saved, error: null };
            }
            return { data: table === "occurrences" ? window.__regression.occurrence : null, error: null };
          },
          then(resolve, reject) {
            const data = table === "pets" ? [{ id: petId, name: "Lua" }]
              : table === "sightings" ? [] : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return query;
      };

      window.BPRealApp.mount();
      history.replaceState({}, "", "#pet/" + occurrenceId);
      await window.BPRealApp.render();
    }, { userId, petId, occurrenceId });

    await page.waitForTimeout(100);
    const detailText = await page.locator("#real-screen").innerText();
    assert.match(detailText, /Animal encontrado perto da praça central\./, detailText);
    assert.equal(await page.getByRole("heading", { name: "Não foi possível carregar" }).count(), 0,
      "o detalhe público precisa renderizar para uma conta comum");

    await page.evaluate(async () => {
      history.replaceState({}, "", "#publicar/found");
      await window.BPRealApp.render();
    });
    const form = page.locator("#real-occurrence-form");
    await form.waitFor();
    await form.locator('[name="pet_id"]').selectOption(petId);
    await form.locator('[name="city"]').fill("Cuiabá");
    await form.locator('[name="region"]').fill("Centro");
    const localDateTime = await page.evaluate(() => {
      const date = new Date();
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      return date.toISOString().slice(0, 16);
    });
    await form.locator('[name="last_seen_at"]').fill(localDateTime);
    await form.locator('[name="description"]').fill("Animal encontrado perto da praça central.");
    await form.locator('[name="rights"]').check();

    const submitState = await page.evaluate(async () => {
      const target = document.querySelector("#real-occurrence-form");
      await window.BPRealApp.onSubmit({ target, preventDefault() {} });
      return { hash: location.hash, error: target.querySelector(".form-error")?.textContent };
    });
    assert.equal(submitState.hash, `#pet/${occurrenceId}`, submitState.error || "alerta não navegou para o detalhe");
    await page.waitForFunction((expected) => location.hash === expected, `#pet/${occurrenceId}`);
    await page.waitForTimeout(50);
    await page.evaluate(() => window.BPRealApp.render());
    await page.getByText("Animal encontrado perto da praça central.").waitFor();
    const created = await page.evaluate(() => window.__regression.created);
    assert.equal(created.length, 1, "o alerta deve ser persistido exatamente uma vez");
    assert.equal(created[0].pet_id, petId, "o alerta deve manter o animal selecionado");

    await page.evaluate(async () => {
      history.replaceState({}, "", "#publicar/lost");
      await window.BPRealApp.render();
    });
    await page.locator("#occurrence-point-map").waitFor();
    await page.getByRole("button", { name: "Marcar centro do mapa" }).click();
    await page.locator('[name="location_consent"]').check();
    await page.evaluate(async () => {
      history.replaceState({}, "", "#publicar/found");
      await window.BPRealApp.render();
    });
    const foundForm = page.locator("#real-occurrence-form");
    await foundForm.waitFor();
    await foundForm.locator('[name="pet_id"]').selectOption(petId);
    await foundForm.locator('[name="city"]').fill("Cuiabá");
    await foundForm.locator('[name="region"]').fill("Centro");
    await foundForm.locator('[name="last_seen_at"]').fill(localDateTime);
    await foundForm.locator('[name="description"]').fill("Outro alerta de animal encontrado.");
    await foundForm.locator('[name="rights"]').check();
    const stalePointState = await page.evaluate(async () => {
      const target = document.querySelector("#real-occurrence-form");
      await window.BPRealApp.onSubmit({ target, preventDefault() {} });
      return { hash: location.hash, error: target.querySelector(".form-error")?.textContent };
    });
    assert.equal(stalePointState.hash, `#pet/${occurrenceId}`, stalePointState.error || "a criação não concluiu após troca de formulário");
    assert.equal(stalePointState.error, "", "o formulário de encontrado não deve herdar marcador de outro formulário");
    const rpcCalls = await page.evaluate(() => window.__regression.rpc);
    assert.equal(rpcCalls.includes("set_occurrence_public_location"), false,
      "o marcador do alerta desaparecido não pode ser associado ao alerta encontrado");

    assert.deepEqual(exceptions, [], "não deve haver exceções JavaScript no navegador");

    console.log(JSON.stringify({
      result: "passed",
      supabase: "fake local endpoint; all domain responses are local fixtures",
      publicPetDetail: "rendered for a common account",
      foundAlert: "created once from the registered pet and detail navigation rendered",
      staleLocationState: "location marker is cleared when leaving its form",
      browserExceptions: exceptions,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
