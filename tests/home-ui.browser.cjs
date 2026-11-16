/* Fase 1: Home conectada com fixtures locais e sem acesso ao Supabase remoto. */
const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const screenshotDir = process.env.SCREENSHOT_DIR;
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => fs.existsSync(candidate));

const rows = [
  {
    id: "a1000000-0000-4000-8000-000000000001", type: "lost", status: "active", visibility: "public",
    city: "Cuiabá", region: "Centro", public_reference: "Próximo à praça central",
    last_seen_at: "2026-11-03T14:30:00.000Z", created_at: "2026-11-03T15:00:00.000Z",
    description: "Cão de porte médio visto perto da praça durante a tarde.", reward_cents: 0,
  },
  {
    id: "b1000000-0000-4000-8000-000000000002", type: "found", status: "located", visibility: "public",
    city: "Cuiabá", region: "Várzea Grande", public_reference: "Terminal do bairro",
    last_seen_at: "2026-11-02T10:00:00.000Z", created_at: "2026-11-02T10:30:00.000Z",
    description: "Animal encontrado com coleira azul perto do terminal.", reward_cents: 0,
  },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await context.route("https://*.supabase.co/**", (route) => route.abort());
  await context.route("http://127.0.0.1:9999/**", (route) => route.abort());
  const page = await context.newPage();
  const exceptions = [];
  page.on("pageerror", (error) => exceptions.push(error.message));

  try {
    await page.goto(`${base}/#services`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BPRealApp && window.BPRemoteStore && window.BPSupabase?.configured);
    await page.evaluate(async (fixtureRows) => {
      if (new URL(window.BPSupabase.client.supabaseUrl).host !== "127.0.0.1:9999")
        throw new Error("A Home UI deve usar somente o endpoint Supabase fictício local.");

      window.__homeFixture = {
        rows: fixtureRows, fail: false, failureCode: "OFFLINE", resolveLoad: null, delay: false,
        ownerRpcMissing: false, rpcCalls: [],
      };
      window.BPAuth.ready = Promise.resolve();
      window.BPAuth.getSession = () => null;
      window.BPAuth.getCurrentUser = () => null;

      const client = window.BPSupabase.client;
      client.from = (table) => {
        const query = {
          select() { return query; },
          eq() { return query; },
          in() { return query; },
          order() { return query; },
          range() { return query; },
          then(resolve, reject) {
            const respond = () => {
              if (window.__homeFixture.fail)
                return { data: null, error: { code: window.__homeFixture.failureCode, status: 404, message: "Serviço público temporariamente indisponível." } };
              if (table === "public_occurrences") return { data: window.__homeFixture.rows, error: null };
              if (table === "pets") return {
                data: [{ id: "d1000000-0000-4000-8000-000000000004", name: "Lua", species: "cat" }], error: null,
              };
              if (table === "occurrence_photos") {
                return {
                  data: [{
                    id: "c1000000-0000-4000-8000-000000000003",
                    occurrence_id: window.__homeFixture.rows[0].id,
                    storage_path: "a1000000-0000-4000-8000-000000000001/c1000000-0000-4000-8000-000000000003.png",
                    mime_type: "image/png", byte_size: 1, created_at: "2026-11-03T15:00:00.000Z",
                  }],
                  error: null,
                };
              }
              return { data: [], error: null };
            };
            const result = window.__homeFixture.delay
              ? new Promise((done) => { window.__homeFixture.resolveLoad = () => done(respond()); })
              : Promise.resolve(respond());
            return result.then(resolve, reject);
          },
        };
        return query;
      };
      client.storage.from = () => ({
        download: async () => ({ data: await fetch("/assets/hex.png").then((response) => response.blob()), error: null }),
      });
      client.auth.getUser = async () => ({ data: { user: { id: "e1000000-0000-4000-8000-000000000005" } }, error: null });
      client.rpc = async (name) => {
        window.__homeFixture.rpcCalls.push(name);
        if (name === "my_occurrences") {
          if (window.__homeFixture.ownerRpcMissing)
            return { data: null, error: { code: "PGRST202", status: 404 } };
          return { data: [window.__homeFixture.rows[0]], error: null };
        }
        return { data: null, error: { code: "PGRST202", status: 404 } };
      };

      history.replaceState({}, "", "#home");
      await window.BPRealApp.render();
    }, rows);

    await page.getByRole("heading", { name: "Vamos trazer seu pet de volta." }).waitFor();
    await page.locator(".occurrence-card").first().waitFor();
    await page.locator("img.alert-cover.is-loaded").waitFor();
    assert.equal(await page.locator(".occurrence-card").count(), 2);
    assert.equal(await page.getByRole("button", { name: "Todos" }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByText("Cães", { exact: true }).count(), 0,
      "chips de espécie não podem surgir sem contrato público autorizado");
    assert.equal(await page.locator('[data-alert-photo][aria-busy="true"]').count(), 0,
      "a Home precisa encerrar o estado de carregamento da foto");
    assert.equal(await page.getByText("Foto não informada", { exact: true }).count(), 1,
      "a ausência de foto deve ser honesta e não usar uma imagem fictícia");

    const search = page.getByLabel("Buscar alertas por cidade, região, referência ou descrição");
    await search.focus();
    assert.equal(await search.evaluate((element) => document.activeElement === element), true);
    await search.fill("Várzea");
    await page.getByText("1 alerta encontrado", { exact: true }).waitFor();
    assert.equal(await page.locator(".occurrence-card:not([hidden])").count(), 1);
    await search.fill("sem correspondência");
    await page.getByText("Nenhum alerta corresponde a esta busca.", { exact: true }).waitFor();
    assert.equal(await page.locator(".occurrence-card:not([hidden])").count(), 0);
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.locator(".occurrence-card").first().waitFor();
    assert.equal(await page.locator(".occurrence-card:not([hidden])").count(), 2);

    const lostChip = page.getByRole("button", { name: "Desaparecidos" });
    await lostChip.focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-action="home-type-filter"][data-type="lost"][aria-pressed="true"]').waitFor();
    assert.equal(await page.locator(".occurrence-card").count(), 1);
    assert.equal(await lostChip.evaluate((element) => document.activeElement === element), true,
      "o foco deve permanecer no chip acionado pelo teclado");

    await page.getByLabel("Situação").selectOption("active");
    await page.locator("#real-status").waitFor();
    assert.equal(await page.locator(".occurrence-card").count(), 1);
    assert.equal(await page.locator("#real-status").evaluate((element) => document.activeElement === element), true,
      "o foco deve permanecer no filtro de situação");

    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.locator(".occurrence-card").first().waitFor();

    await page.getByRole("button", { name: "Abrir opções de acessibilidade" }).click();
    const dialog = page.locator("#accessibility-dialog");
    await dialog.getByLabel("Escolha de cor").selectOption("dark");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await dialog.getByRole("button", { name: "Restaurar preferências" }).click();
    await page.keyboard.press("Escape");

    await page.evaluate(() => {
      window.__homeFixture.delay = true;
      void window.BPRealApp.render();
    });
    await page.getByText("Carregando alertas autorizados", { exact: true }).waitFor();
    await page.evaluate(() => window.__homeFixture.resolveLoad());
    await page.locator(".occurrence-card").first().waitFor();
    await page.evaluate(() => { window.__homeFixture.delay = false; });

    await page.evaluate(async () => {
      window.__homeFixture.fail = true;
      await window.BPRealApp.render();
    });
    await page.getByRole("alert").getByText("Não foi possível carregar os alertas", { exact: true }).waitFor();
    await page.evaluate(() => { window.__homeFixture.fail = false; });
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page.locator(".occurrence-card").first().waitFor();

    await page.evaluate(async () => {
      window.__homeFixture.fail = true;
      window.__homeFixture.failureCode = "PGRST205";
      await window.BPRealApp.render();
    });
    await page.getByRole("alert").getByText("Consulta pública ainda não publicada", { exact: true }).waitFor();
    await page.getByText("Nenhum dado de demonstração foi exibido.", { exact: false }).waitFor();
    await page.evaluate(() => {
      window.__homeFixture.fail = false;
      window.__homeFixture.failureCode = "OFFLINE";
    });
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page.locator(".occurrence-card").first().waitFor();

    await page.evaluate(async () => {
      const account = {
        id: "e1000000-0000-4000-8000-000000000005", name: "Conta de teste", email: "tutor@example.test",
        roles: ["tutor"], activeRole: "tutor", status: "active", emailVerified: true,
      };
      window.BPAuth.getSession = () => ({ userId: account.id });
      window.BPAuth.getCurrentUser = () => account;
      window.BPAuth.hasRole = (role) => account.roles.includes(role);
      window.__homeFixture.rpcCalls = [];
      history.replaceState({}, "", "#painel-tutor");
      await window.BPRealApp.render();
    });
    await page.getByRole("heading", { name: "Minha área" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Minha área" }).getAttribute("aria-current"), "page");
    assert.equal(await page.getByText("Meus animais", { exact: true }).count() >= 1, true);
    const tutorCalls = await page.evaluate(() => window.__homeFixture.rpcCalls);
    assert.deepEqual(tutorCalls, ["my_occurrences"], "Minha Área não pode chamar RPC administrativa");

    await page.evaluate(async () => {
      window.__homeFixture.ownerRpcMissing = true;
      window.__homeFixture.rpcCalls = [];
      await window.BPRealApp.render();
    });
    await page.getByText("Meus alertas ainda não estão disponíveis neste ambiente.", { exact: true }).waitFor();
    assert.equal(await page.getByText("Meus animais", { exact: true }).count() >= 1, true,
      "Minha Área deve preservar os animais quando apenas o contrato de alertas estiver pendente");
    assert.deepEqual(await page.evaluate(() => window.__homeFixture.rpcCalls), ["my_occurrences"]);
    await page.evaluate(() => { window.__homeFixture.ownerRpcMissing = false; });
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page.locator(".occurrence-card").first().waitFor();

    await page.evaluate(async () => {
      window.BPAuth.getSession = () => null;
      window.BPAuth.getCurrentUser = () => null;
      window.BPAuth.hasRole = () => false;
      history.replaceState({}, "", "#home");
      await window.BPRealApp.render();
    });

    const widths = [320, 390, 768, 1024, 1440];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 960 });
      await page.evaluate(() => window.BPRealApp.render());
      await page.getByRole("heading", { name: "Vamos trazer seu pet de volta." }).waitFor();
      const firstCard = page.locator(".occurrence-card").first();
      await firstCard.waitFor();
      await firstCard.scrollIntoViewIfNeeded();
      await page.locator("img.alert-cover.is-loaded").waitFor();
      await page.waitForTimeout(220);
      await page.evaluate(() => window.scrollTo(0, 0));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 1, `rolagem horizontal na Home a ${width}px: ${overflow}px`);
      if (screenshotDir && [390, 1440].includes(width)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
        await page.screenshot({ path: path.join(screenshotDir, `fase1-home-${width}.png`), fullPage: true });
      }
    }

    assert.deepEqual(exceptions, [], "a Home não deve lançar exceções JavaScript");
    console.log(JSON.stringify({
      result: "passed",
      source: "fixtures locais; nenhuma consulta ao Supabase remoto",
      widths,
      checks: ["busca", "chips autorizados", "situação", "foco", "foto autorizada", "vazio", "erro", "contrato pendente", "Minha Área", "tema", "overflow"],
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
