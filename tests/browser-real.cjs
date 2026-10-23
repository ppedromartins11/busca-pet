/* Smoke E2E para a SPA configurada com Supabase.
 * Não cadastra usuários nem grava registros; faz uma tentativa de login inválido.
 * Requer Vite já iniciado em modo real: BASE_URL=http://127.0.0.1:5173 node tests/browser-real.cjs
 */
const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.BASE_URL || "http://127.0.0.1:5173";
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((path) => fs.existsSync(path));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(chrome ? { executablePath: chrome } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const exceptions = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  try {
    await page.goto(base + "/#home", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.BPSupabase?.configured === true);
    await page.getByRole("heading", { name: "Vamos trazer seu pet de volta." }).waitFor();
    assert.equal(
      await page.locator('a[href="#pet/hex"], a[href="#pet/gargamel"], a[href="#pet/bold"]').count(),
      0,
      "alertas semeados do protótipo apareceram no modo real",
    );
    const accessibility = page.getByRole("button", { name: "Abrir opções de acessibilidade" });
    await accessibility.click();
    const accessibilityDialog = page.locator("#accessibility-dialog");
    await accessibilityDialog.getByLabel("Escolha de cor").selectOption("dark");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await accessibilityDialog.getByRole("button", { name: "Restaurar preferências" }).click();
    assert.equal(await page.locator("html").getAttribute("data-theme-preference"), "system");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByText("Contas da demonstração", { exact: false }).count(),
      0,
      "credenciais fictícias apareceram no modo real",
    );

    const checked = [];
    const routeHeadings = {
      home: "Vamos trazer seu pet de volta.",
      login: "Entre no BuscaPet",
      registro: "Crie sua conta",
      "esqueci-senha": "Recuperar senha",
      services: "Rede de apoio",
      mapa: "Mapa da busca",
      sobre: "Sobre o BuscaPet",
    };
    for (const width of [320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading] of Object.entries(routeHeadings)) {
        await page.goto(base + "/#" + route, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: heading }).waitFor();
        if (route === "registro") {
          assert.equal(await page.locator('#real-registration [name="collaborator"]').count(), 0);
          assert.equal(await page.locator('#real-registration [name="acceptTerms"]').count(), 1);
          assert.equal(await page.locator('#real-registration [name="acceptPrivacy"]').count(), 1);
        }
        if (["home", "login", "registro", "services", "mapa", "sobre"].includes(route) && [390, 1440].includes(width) && process.env.SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(process.env.SCREENSHOT_DIR, `real-${route}-${width}.png`),
            fullPage: true,
          });
        }
        assert.equal(await page.locator(".app-header").count(), 1);
        assert.equal(await page.locator(".app-header > .main-nav").count(), 1);
        assert.equal(await page.locator(".app-header ~ .main-nav").count(), 0);
        if (width === 1440) {
          const logo = await page.locator(".app-header .logo").boundingBox();
          const start = await page.locator('.main-nav a[href="#home"]').boundingBox();
          const support = await page.locator('.main-nav a[href="#services"]').boundingBox();
          const login = await page.locator('.header-actions a[href="#login"]').boundingBox();
          const signup = await page.locator('.header-actions a[href="#registro"]').boundingBox();
          assert(logo.x < start.x && start.x < support.x && support.x < login.x && login.x < signup.x);
          assert(Math.abs(logo.y - start.y) < 20 && Math.abs(start.y - login.y) < 20);
          assert.equal(await page.locator(".menu-toggle").isVisible(), false);
        }
        if (width === 390) {
          const toggle = page.locator(".menu-toggle");
          assert.equal(await toggle.isVisible(), true);
          assert.equal(await toggle.getAttribute("aria-expanded"), "false");
          await toggle.focus();
          await page.keyboard.press("Enter");
          assert.equal(await toggle.getAttribute("aria-expanded"), "true");
          assert.equal(await page.locator('#real-mobile-nav a[href="#home"]').evaluate((element) => document.activeElement === element), true);
          assert.equal(await page.locator('#real-mobile-nav a[href="#registro"]').isVisible(), true);
          const menu = await page.locator("#real-mobile-nav").boundingBox();
          const screen = await page.locator("#real-screen").boundingBox();
          assert(menu.y + menu.height <= screen.y + 1, "menu móvel sobrepõe o conteúdo");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true);
          if (route === "login" && process.env.SCREENSHOT_DIR) {
            await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "real-menu-390.png"), fullPage: true });
          }
          await page.keyboard.press("Escape");
          assert.equal(await toggle.getAttribute("aria-expanded"), "false");
          assert.equal(await toggle.evaluate((element) => document.activeElement === element), true);
        }
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        assert(
          overflow <= 1,
          `rolagem horizontal em #${route} a ${width}px: ${overflow}px`,
        );
        checked.push({ route, width });
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + "/#mapa", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Mapa da busca" }).waitFor();
    assert.equal(await page.locator("#search-map").count(), 1);
    await page.locator("#map-results-status").filter({ hasText: /pontos publicados|ponto publicado|não estão disponíveis/ }).waitFor();
    await page.getByRole("button", { name: "Ver exemplo ilustrativo" }).click();
    await page.locator("#search-map.leaflet-container").waitFor();
    assert.equal(await page.locator(".bp-map-icon").count(), 6);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "real-mapa-demo-1440.png"), fullPage: true });
    await page.locator('input[data-map-filter="sighting"]').uncheck();
    assert.equal(await page.locator(".bp-map-icon.sighting").count(), 0);
    await page.locator(".map-point-item").first().click();
    await page.locator(".leaflet-popup").waitFor();
    await page.getByRole("button", { name: "Usar minha localização" }).click();
    await page.getByText(/A localização não foi compartilhada|Não foi possível obter sua localização|Localização usada somente/).waitFor({ timeout: 12_000 });

    // Inspeciona somente a apresentação do estado autenticado, sem criar sessão ou dados remotos.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(base + "/#services", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Rede de apoio", exact: true }).waitFor();
    await page.evaluate(async () => {
      window.BPAuth.getCurrentUser = () => ({ id: "synthetic-ui-only" });
      await window.BPRealApp.render();
    });
    await page.locator(".menu-toggle").click();
    assert.equal(await page.locator('#real-mobile-nav a[href="#minha-conta"]').isVisible(), true);
    assert.equal(await page.locator('#real-mobile-nav a[href="#login"]').count(), 0);
    assert.equal(await page.locator('#real-mobile-nav a[href="#registro"]').count(), 0);

    // Uma sessão comum sintetizada só verifica a guarda visual; a autorização
    // definitiva e as contagens administrativas são exercitadas pelo pgTAP.
    await page.evaluate(() => {
      window.BPAuth.getSession = () => ({ userId: "synthetic-common" });
      window.BPAuth.getCurrentUser = () => ({
        id: "synthetic-common", status: "active", emailVerified: true, roles: ["tutor"],
      });
      window.BPAuth.hasRole = () => false;
      location.hash = "#admin";
    });
    await page.getByRole("heading", { name: "Acesso negado" }).waitFor();
    assert.equal(await page.getByText("Indicadores protegidos", { exact: true }).count(), 1);

    // A listagem usa respostas sintéticas somente no navegador local: a RPC e
    // sua autorização real são validadas em pgTAP, sem consultar dados remotos.
    await page.evaluate(() => {
      const accounts = [
        { account_id: "a1000000-0000-4000-8000-000000000001", display_name: "Ana Administradora", email: "ana@example.test", roles: ["administrador", "tutor"], status: "active", active_role: "tutor", created_at: "2026-10-20T12:00:00.000Z", total_count: 2 },
        { account_id: "b1000000-0000-4000-8000-000000000002", display_name: "Bruno Colaborador", email: "bruno@example.test", roles: ["colaborador", "tutor"], status: "suspended", active_role: "tutor", created_at: "2026-10-19T12:00:00.000Z", total_count: 2 },
      ];
      const audit = [];
      window.__adminDirectoryCalls = [];
      const client = window.BPSupabase.client;
      client.auth.getUser = async () => ({ data: { user: { id: "a1000000-0000-4000-8000-000000000001" } }, error: null });
      client.rpc = async (name, params = {}) => {
        window.__adminDirectoryCalls.push({ name, params });
        if (window.__adminDirectoryFailure) return { data: null, error: { code: "PGRST202" } };
        if (name === "admin_list_users") {
          let rows = accounts;
          const query = String(params.p_query || "").toLowerCase();
          if (query) rows = rows.filter((row) => `${row.display_name} ${row.email} ${row.account_id}`.toLowerCase().includes(query));
          if (params.p_status) rows = rows.filter((row) => row.status === params.p_status);
          if (params.p_role) rows = rows.filter((row) => row.roles.includes(params.p_role));
          return { data: rows.map((row) => ({ ...row, total_count: rows.length })), error: null };
        }
        if (name === "admin_get_user") return { data: accounts.filter((row) => row.account_id === params.p_user), error: null };
        if (name === "admin_list_account_status_audit") {
          const rows = audit.filter((row) => row.target_id === params.p_user);
          return { data: rows.map((row) => ({ ...row, total_count: rows.length })), error: null };
        }
        if (name === "admin_change_account_status") {
          const account = accounts.find((row) => row.account_id === params.p_user);
          if (!account) return { data: [], error: null };
          account.status = params.p_status;
          const action = params.p_status === "suspended" ? "account_suspended" : "account_reactivated";
          audit.unshift({ target_id: account.account_id, actor_name: "Ana Administradora", action, reason: params.p_reason || null, created_at: "2026-10-23T12:00:00.000Z" });
          return { data: [{ target_id: account.account_id, account_status: account.status, action }], error: null };
        }
        return { data: null, error: null };
      };
      window.BPAuth.getSession = () => ({ userId: "synthetic-admin" });
      window.BPAuth.getCurrentUser = () => ({
        id: "synthetic-admin", status: "active", emailVerified: true, roles: ["administrador", "tutor"],
      });
      window.BPAuth.hasRole = (role) => role === "administrador" || role === "tutor";
      location.hash = "#admin/usuarios";
    });
    await page.getByRole("heading", { name: "Gestão de usuários" }).waitFor();
    await page.getByText("Ana Administradora", { exact: true }).waitFor();
    assert.equal(await page.locator('.admin-nav a[href="#admin"][aria-current="page"]').count(), 0);
    assert.equal(await page.locator('.admin-nav a[href="#admin/usuarios"][aria-current="page"]').count(), 1);
    assert.equal(await page.getByRole("button", { name: "Suspender" }).count(), 0);
    const directorySearch = page.getByLabel("Buscar por nome, e-mail ou identificador");
    await directorySearch.focus();
    assert.equal(await directorySearch.evaluate((element) => document.activeElement === element), true);
    await directorySearch.fill("Bruno");
    await page.waitForFunction(() => window.__adminDirectoryCalls.some((call) => call.name === "admin_list_users" && call.params.p_query === "Bruno"));
    await page.waitForFunction(() => !document.querySelector(".admin-user-table tbody")?.textContent.includes("Ana Administradora"));
    await page.getByText("Bruno Colaborador", { exact: true }).waitFor();
    assert.equal(await page.getByText("Ana Administradora", { exact: true }).count(), 0);
    await page.getByLabel("Papel").selectOption("colaborador");
    await page.waitForFunction(() => window.__adminDirectoryCalls.some((call) => call.name === "admin_list_users" && call.params.p_role === "colaborador"));
    await page.getByRole("link", { name: "Ver detalhes" }).click();
    await page.getByRole("heading", { name: "Bruno Colaborador" }).waitFor();
    assert.equal(await page.getByText("bruno@example.test", { exact: true }).count(), 1);
    assert.equal(await page.getByText("Todos os papéis", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Reativar conta" }).click();
    await page.locator("#admin-status-dialog-title").waitFor();
    await page.getByRole("button", { name: "Confirmar reativação" }).click();
    await page.waitForFunction(() => window.__adminDirectoryCalls.some((call) => call.name === "admin_change_account_status" && call.params.p_status === "active"));
    await page.getByRole("button", { name: "Suspender conta" }).waitFor();
    await page.getByRole("button", { name: "Suspender conta" }).click();
    const reason = page.getByLabel("Motivo da suspensão *");
    await reason.fill("Uso indevido confirmado durante a revisão.");
    await page.getByRole("button", { name: "Confirmar suspensão" }).click();
    await page.waitForFunction(() => window.__adminDirectoryCalls.some((call) => call.name === "admin_change_account_status" && call.params.p_status === "suspended"));
    await page.getByRole("button", { name: "Reativar conta" }).waitFor();
    const auditItems = page.locator(".admin-audit-list li");
    await auditItems.first().waitFor();
    assert.equal(await auditItems.count(), 2);
    assert.match(await page.locator(".admin-audit-list").textContent(), /Uso indevido confirmado durante a revisão\./);
    await page.getByRole("link", { name: "Voltar para usuários" }).click();
    await page.getByRole("heading", { name: "Gestão de usuários" }).waitFor();
    await page.evaluate(() => { window.__adminDirectoryFailure = true; });
    await page.getByLabel("Ordenação").selectOption("oldest");
    await page.getByText("Funcionalidade ainda não publicada", { exact: true }).waitFor();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true, `diretório administrativo excede a largura em ${width}px`);
    }
    await page.evaluate(() => {
      window.BPAuth.getSession = () => null;
      window.BPAuth.getCurrentUser = () => null;
    });

    await page.goto(base + "/#meus-animais", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/#login(?:$|\/|\?)/);
    assert.equal(await page.locator('input[name="email"]').count(), 1);
    assert.equal(await page.locator('input[name="password"]').count(), 1);
    const email = page.locator('#real-login [name="email"]');
    const password = page.locator('#real-login [name="password"]');
    const toggle = page.locator('#real-login [data-action="toggle-password"]');
    let reachedEmail = false;
    for (let index = 0; index < 30; index++) {
      await page.keyboard.press("Tab");
      if (await email.evaluate((element) => document.activeElement === element)) {
        reachedEmail = true;
        break;
      }
    }
    assert(reachedEmail, "campo de e-mail não alcançado pelo teclado");
    await page.keyboard.press("Tab");
    assert(await password.evaluate((element) => document.activeElement === element));
    await page.keyboard.press("Tab");
    assert(await toggle.evaluate((element) => document.activeElement === element));
    await page.keyboard.press("Enter");
    assert.equal(await password.getAttribute("type"), "text");
    await page.keyboard.press("Space");
    assert.equal(await password.getAttribute("type"), "password");
    await email.fill("invalid.buscapet.qa@example.test");
    await password.fill("invalid-password-for-qa");
    await page.locator('#real-login button[type="submit"]').click();
    await page.locator('#real-login .form-error').filter({ hasText: /.+/ }).waitFor();
    assert.match(page.url(), /#login$/);
    assert.deepEqual(exceptions, [], "exceções JavaScript no navegador");

    console.log(JSON.stringify({
      result: "aprovado",
      mode: "Supabase configurado; sem criação de contas ou registros",
      responsiveChecks: checked.length,
      protectedRoute: "#meus-animais → #login",
      invalidLogin: "erro visível sem sair da tela",
      keyboard: "Tab até e-mail/senha; alternância da senha com Enter/Espaço",
      browserExceptions: exceptions,
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
