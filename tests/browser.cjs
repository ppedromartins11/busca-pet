/* Regressão em navegador real. Requer Playwright, Chromium e servidor HTTP local. */
const { chromium } = require(
  process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
    ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + "/playwright"
    : "playwright-core",
);
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const BASE = process.env.BASE_URL || "http://localhost:8000";
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    timezoneId: "America/Campo_Grande",
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const go = async (hash) => {
    await page.evaluate((hash) => (location.hash = hash), hash);
    await page.waitForFunction(
      (hash) =>
        document.querySelector(".screen.current")?.id ===
        (hash.split("/")[0] || "home"),
      hash,
    );
  };
  const get = (selector) => page.locator(".screen.current " + selector);
  const login = async (email) => {
    await go("login");
    await get('[name="email"]').fill(email);
    await get('[name="password"]').fill("BuscaPetDemo!");
    await get('button[type="submit"]').click();
    await page.waitForFunction(() => window.BPAuth.getSession());
  };
  const logout = async () => {
    await go("minha-conta");
    await get('[data-action="logout"]').click();
    await page.waitForURL(/#login/);
  };
  await page.goto(BASE);
  assert.equal(await get(".pet").count(), 3);
  await get("#query").fill("Gargamel");
  assert.equal(await get(".pet").count(), 1);
  await get("#query").fill("");
  await get('[data-filter-species="gato"]').click();
  assert.equal(await get(".pet").count(), 1);
  await get('[data-filter-species="todos"]').click();
  // Visitante volta à rota protegida original depois de entrar.
  await page.evaluate(() => (location.hash = "post"));
  await page.waitForURL(/#login/);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.name), "email");
  await get('[name="email"]').fill("tutor@demo.buscapet");
  await get('[name="password"]').fill("BuscaPetDemo!");
  await get('button[type="submit"]').click();
  await page.waitForURL(/#post/);
  assert.equal(await page.locator("#role-switch").count(), 0);
  await go("publicar/perdido");
  await get("[name=name]").fill("Luna teste");
  await get("[name=region]").fill("Centro");
  await go("home");
  await go("publicar/perdido");
  assert.equal(await get("[name=name]").inputValue(), "Luna teste");
  assert.equal(await get("[name=region]").inputValue(), "Centro");
  await get("[name=place]").fill("Praça pública");
  await get("[name=seenDate]").fill("2026-01-01");
  await get("[name=description]").fill(
    "Cachorra caramelo, coleira azul e peito branco.",
  );
  await get("#photo-input").setInputFiles(
    path.join(__dirname, "../assets/hex.png"),
  );
  await get("#photo-preview").waitFor({ state: "visible" });
  await get("[name=contentRights]").check();
  await get("[name=acceptTerms]").check();
  await get("button[type=submit]").click();
  await page.waitForURL(/#operacao\//);
  const id = await page.evaluate(() => location.hash.split("/")[1]);
  assert(
    await page.evaluate(
      (id) =>
        window.BPStore.get()
          .alerts.find((a) => a.id === id)
          .image.startsWith("data:image/jpeg"),
      id,
    ),
  );
  await get("[data-action=participant]").click();
  await go("avistamento/" + id);
  await get("[name=place]").fill("Praça central");
  await get("[name=description]").fill(
    "Vi uma cachorra de coleira azul caminhando.",
  );
  await get("[name=seenAt]").fill("2026-01-01T09:00");
  await get("[name=timeApproximate]").check();
  await get("#sighting-form button")
    .filter({ hasText: "Registrar pista" })
    .click();
  await page.waitForURL(/#pet\//);
  await go("operacao/" + id);
  await get(".sighting-card summary").click();
  await get("[name=review]").selectOption("compativel");
  await get("[name=reason]").fill("Coleira e cor compatíveis com o relato.");
  await get(".sighting-review-form button").click();
  await get(".sighting-card")
    .filter({ hasText: "Compatível na revisão" })
    .waitFor();
  await get("#task-form [name=title]").fill("Verificar a praça");
  await get("#task-form [name=place]").fill("Praça central");
  await get("#task-form [name=assigneeId]").selectOption("community");
  await get("#task-form button").click();
  await get(".task-card").waitFor();
  await logout();
  await login("colaborador@demo.buscapet");
  await go("operacao/" + id);
  assert.equal(await get("#task-form").count(), 0);
  await get(".task-update-form [name=status]").selectOption("concluida");
  await get("[name=result]").fill(
    "Não avistei o animal durante a verificação.",
  );
  await get("[name=method]").fill("Observação pela calçada.");
  await get(".task-update-form button").click();
  await get(".task-card").filter({ hasText: "Concluída" }).waitFor();
  await logout();
  await login("tutor@demo.buscapet");
  await go("operacao/" + id);
  const out = process.env.SCREENSHOT_DIR;
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    await page.screenshot({
      path: path.join(out, "central-desktop.png"),
      fullPage: true,
    });
  }
  await get("[data-action=resolve]").click();
  await page.locator("#resolve-form [name=outcome]").selectOption("localizado");
  await page
    .locator("#resolve-form [name=note]")
    .fill("Animal visto; reencontro ainda não confirmado.");
  await page.locator("#resolve-form button.primary").click();
  await get("[data-action=reopen]").waitFor();
  assert.equal(
    await page.evaluate(
      (id) => window.BPStore.get().alerts.find((a) => a.id === id).status,
      id,
    ),
    "localizado",
  );
  await get("[data-action=reopen]").click();
  await page
    .locator("#reopen-form [name=reason]")
    .fill("Animal voltou a se deslocar.");
  await page.locator("#reopen-form button.primary").click();
  await get("[data-action=resolve]").waitFor();
  await page.reload();
  await get("h1").filter({ hasText: "Luna teste" }).waitFor();
  assert.equal(await get(".task-card").count(), 1);
  // Moderação: denúncia, ocultação, contestação e restauração.
  await go("denunciar/" + id);
  await get("[name=category]").selectOption("Informação falsa");
  await get("[name=description]").fill(
    "Relato fictício para verificar a moderação.",
  );
  await get("#report-form button").click();
  await page.waitForURL(/#denuncias/);
  await logout();
  await login("moderador@demo.buscapet");
  await go("admin");
  await get("[name=decision]").selectOption("ocultar");
  await get("[name=reason]").fill("Ocultar publicação para conferir o relato.");
  await get(".moderation-form button").click();
  await logout();
  await login("tutor@demo.buscapet");
  await go("denuncias");
  await get("[data-action=appeal]").click();
  await page
    .locator("#appeal-form [name=reason]")
    .fill("Solicito revisão desta ocorrência fictícia.");
  await page.locator("#appeal-form button.primary").click();
  await logout();
  await login("moderador@demo.buscapet");
  await go("admin");
  await get("[name=decision]").selectOption("manter");
  await get("[name=reason]").fill(
    "Restaurar publicação depois da conferência.",
  );
  await get(".moderation-form button").click();
  assert.equal(
    await page.evaluate(
      (id) => window.BPStore.get().alerts.find((a) => a.id === id).visibility,
      id,
    ),
    "visivel",
  );
  await logout();
  await login("tutor@demo.buscapet");
  const routes = [
    "home",
    "post",
    "publicar/perdido",
    "pet/" + id,
    "operacao/" + id,
    "avistamento/" + id,
    "denunciar/" + id,
    "minha-conta",
    "painel-tutor",
    "login",
    "registro",
    "esqueci-senha",
    "redefinir-senha",
    "verificar-email",
    "termos",
    "privacidade",
    "map",
    "services",
    "cartaz/" + id,
  ];
  const overflow = [];
  for (const width of [320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await go(route);
      const extra = await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      );
      if (extra > 1) overflow.push({ width, route, extra });
      const duplicate = await page.evaluate(() => {
        const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
        return ids.filter((id, i) => ids.indexOf(id) !== i);
      });
      assert.deepEqual(duplicate, [], `IDs duplicados: ${route}`);
      assert.equal(await page.locator(".app-header > .main-nav").count(), 1);
      assert.equal(await page.locator(".app-header ~ .main-nav").count(), 0);
    }
  }
  assert.deepEqual(overflow, [], "Rolagem horizontal");
  await go("cartaz/" + id);
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".poster-actions").isVisible(), false);
  await page.emulateMedia({ media: "screen" });
  // Cadastro público: duas funções, função inicial e alternância na mesma sessão.
  const registrationContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Campo_Grande",
  });
  const registration = await registrationContext.newPage();
  const registrationErrors = [];
  registration.on("pageerror", (e) => registrationErrors.push(e.message));
  await registration.goto(BASE + "/#registro");
  const rg = (selector) => registration.locator(".screen.current " + selector);
  assert.equal(await rg('[name="roles"][value="moderador"]').count(), 0);
  assert.equal(await rg('[name="roles"][value="administrador"]').count(), 0);
  await rg('[name="name"]').fill("Conta com duas funções");
  await rg('[name="email"]').fill("duas.funcoes@example.com");
  await rg('[name="password"]').fill("senha longa de teste");
  await rg('[name="passwordConfirmation"]').fill("senha longa de teste");
  await rg('[name="roles"][value="tutor"]').check();
  await rg('[name="roles"][value="colaborador"]').check();
  await rg('[name="activeRole"][value="tutor"]').check();
  await rg('[name="acceptTerms"]').check();
  await rg('[name="acceptPrivacy"]').check();
  await rg('button[type="submit"]').click();
  await registration.waitForURL(/#verificar-email/);
  await rg('[data-action="verify-email"]').click();
  await registration.waitForURL(/#painel-tutor/);
  await registration.locator(".menu-toggle").click();
  assert.equal(await registration.locator(".menu-toggle").getAttribute("aria-expanded"), "true");
  await registration.locator("#role-switch-mobile").selectOption("colaborador");
  await registration.waitForURL(/#painel-colaborador/);
  assert.equal(
    await registration.evaluate(() => window.BPAuth.getSession().userId),
    await registration.evaluate(() => window.BPAuth.getUser().id),
  );
  const persisted = await registration.evaluate(() => JSON.stringify(localStorage));
  assert.equal(persisted.includes("senha longa de teste"), false);
  await registration.evaluate(() => (location.hash = "post"));
  await registration.waitForFunction(
    () => document.querySelector(".screen.current")?.id === "acesso-limitado",
  );
  assert.match(await rg("h2").textContent(), /Acesso limitado/);
  await registration.evaluate(() => (location.hash = "operacao/hex"));
  await registration.waitForFunction(
    () => document.querySelector(".screen.current")?.id === "operacao",
  );
  assert.match(await rg("h2").textContent(), /Acesso à central/);
  if (out) {
    await registration.evaluate(() => (location.hash = "registro"));
    await registration.waitForFunction(
      () => document.querySelector(".screen.current")?.id === "registro",
    );
    await registration.setViewportSize({ width: 390, height: 844 });
    await registration.screenshot({
      path: path.join(out, "registro-mobile.png"),
      fullPage: true,
    });
    await registration.setViewportSize({ width: 1440, height: 1000 });
    await registration.screenshot({
      path: path.join(out, "registro-desktop.png"),
      fullPage: true,
    });
  }
  assert.deepEqual(registrationErrors, []);
  await registrationContext.close();
  if (out) {
    await page.evaluate(() => window.BPStore.reset());
    await go("home");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: path.join(out, "inicio-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(out, "inicio-mobile.png"),
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        result: "aprovado",
        flows: [
          "filtros",
          "rascunho",
          "publicação com foto",
          "pista",
          "revisão",
          "colaboração",
          "tarefa",
          "encerramento",
          "reabertura",
          "persistência",
          "denúncia",
          "moderação",
          "contestação",
          "impressão",
          "login e retorno seguro",
          "cadastro com duas funções",
          "alternância de função",
          "logout",
        ],
        widths: [320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1440, 1920],
        routes: routes.length,
        overflow,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
