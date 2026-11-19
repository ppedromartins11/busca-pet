const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.BASE_URL || "http://127.0.0.1:5186";
const chrome = process.env.CHROME_PATH
  || ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"].find((candidate) => fs.existsSync(candidate));
const screenshotDir = process.env.PRESENTATION_SCREENSHOT_DIR || "";
const seeded = {
  pet: "10000000-0000-4000-8000-000000000001",
  lost: "20000000-0000-4000-8000-000000000001",
};
const visit = (route) => base + "/#" + route;
async function logIn(page, email) {
  await page.goto(visit("login"));
  await page.locator('#real-login [name="email"]').fill(email);
  await page.locator('#real-login [name="password"]').fill("BuscaPet@2026");
  await page.locator('#real-login button[type="submit"]').click();
  await page.getByRole("heading", { name: email.startsWith("admin@") ? "Administração" : "Minha área" }).waitFor();
}
async function capture(page, name, width) {
  if (!screenshotDir) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, name + "-" + width + ".png"), fullPage: true });
}
async function assertResponsive(page, route, width) {
  await page.goto(visit(route));
  await page.locator("#real-screen h1").waitFor({ state: "visible" });
  await page.waitForFunction(() => !/^(Carregando|Não foi possível carregar)$/.test(
    document.querySelector("#real-screen h1")?.textContent.trim() || ""), undefined, { timeout: 10000 });
  const title = await page.locator("#real-screen h1").innerText();
  assert.ok(title.length >= 3, route + " has no page title");
  const { documentWidth, screenWidth } = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth, screenWidth: innerWidth,
  }));
  assert.ok(documentWidth <= screenWidth + 1,
    "horizontal overflow at " + width + "px: " + route + " (" + documentWidth + " > " + screenWidth + ")");
  assert.equal(await page.locator(".app-header").count(), 1);
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const origin = new URL(base).origin;
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, permissions: [] });
      const page = await context.newPage();
      const exceptions = [];
      const remote = [];
      page.on("pageerror", (error) => exceptions.push(error.message));
      await context.route("https://*.supabase.co/**", (route) => {
        remote.push(route.request().url());
        return route.abort();
      });
      await context.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
      await context.route("https://overpass-api.de/**", (route) => route.abort());
      try {
        for (const route of ["home", "services", "mapa", "cadastro-empresa",
          "registro", "pet/" + seeded.lost, "cartaz/" + seeded.lost,
          "semelhantes/" + seeded.lost]) {
          await assertResponsive(page, route, width);
        }
        await page.goto(visit("home"));
        await page.locator("[data-occurrence-card]").first().waitFor();
        assert.equal(await page.locator("[data-occurrence-card]").count(), 3);
        assert.match(await page.locator(".demo-context").innerText(), /registros de teste/);
        await page.goto(visit("cartaz/" + seeded.lost));
        await page.locator("#bp-poster-canvas").waitFor();
        assert.equal(await page.evaluate(() => document.querySelector("#bp-poster-canvas").width), 1080);
        assert.equal(await page.locator("#poster-show-phone").count(), 0,
          "o cartaz não deve divulgar contato sem autorização");
        await page.goto(visit("semelhantes/" + seeded.lost));
        await page.locator(".match-result").first().waitFor();
        assert.ok(await page.locator(".match-result").count() >= 1);
        await logIn(page, "tutor@buscapet.test");
        await assertResponsive(page, "painel-tutor", width);
        const metrics = await page.locator(".dashboard-summary-tutor b").allTextContents();
        assert.deepEqual(metrics, ["3", "2", "3", "1", "2"]);
        assert.equal(await page.locator(".dashboard-care-row").count(), 2);
        await capture(page, "painel-tutor", width);
        await assertResponsive(page, "agenda", width);
        await assertResponsive(page, "carteirinha/" + seeded.pet, width);
        await assertResponsive(page, "meus-animais", width);
        await assertResponsive(page, "publicar/lost", width);
        await assertResponsive(page, "publicar/found", width);
        if (width === 390) {
          await page.goto(visit("carteirinha/" + seeded.pet));
          await page.locator('[name="microchip"]').fill("QA-019");
          await page.locator('#real-pet-card-form button[type="submit"]').click();
          await page.goto(visit("carteirinha/" + seeded.pet));
          assert.equal(await page.locator('[name="microchip"]').inputValue(), "QA-019");
          await page.goto(visit("agenda"));
          const form = page.locator("#real-care-form");
          await form.locator('[name="title"]').fill("Consulta de acompanhamento");
          await form.locator('[name="date"]').fill("2027-01-12");
          await form.locator('[name="notes"]').fill("Retorno de rotina");
          await form.locator('button[type="submit"]').click();
          await page.goto(visit("agenda"));
          await page.getByRole("heading", { name: "Consulta de acompanhamento" }).waitFor();
          const card = page.locator(".care-event", { hasText: "Consulta de acompanhamento" });
          await card.getByRole("button", { name: "Marcar concluído" }).click();
          await page.getByRole("heading", { name: "Consulta de acompanhamento" }).waitFor();
          assert.match(await page.locator(".care-event", { hasText: "Consulta de acompanhamento" }).innerText(), /Concluído/);
          await page.goto(visit("painel-tutor"));
          assert.equal((await page.locator(".dashboard-summary-tutor b").allTextContents())[4], "2");
        }
        await page.goto(visit("minha-conta"));
        await page.locator('[data-action="logout"]').first().click();
        await page.getByRole("heading", { name: "Entre no BuscaPet" }).waitFor();
        await logIn(page, "admin@buscapet.test");
        await assertResponsive(page, "admin", width);
        await assertResponsive(page, "admin/empresas", width);
        await assertResponsive(page, "novo-animal", width);
        await assertResponsive(page, "publicar/lost", width);
        await assertResponsive(page, "painel-tutor", width);
        await capture(page, "painel-admin-como-tutor", width);
        await page.goto(visit("minha-conta"));
        await page.locator('[data-action="logout"]').first().click();
        await page.getByRole("heading", { name: "Entre no BuscaPet" }).waitFor();
        assert.deepEqual(remote, [], "the presentation must never access Supabase");
        assert.deepEqual(exceptions, [], "uncaught browser errors at " + width + "px");
        console.log("Presentation smoke passed at " + width + "px");
      } finally {
        await context.close();
      }
    }
    // End-to-end commercial profile: registration, review and public visibility.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", (dialog) => dialog.accept());
    try {
      await page.goto(visit("cadastro-empresa"));
      const form = page.locator("#real-business-registration");
      const fields = {
        name: "Responsável QA", email: "empresa-qa@exemplo.com",
        password: "SenhaDeApresentacao123", passwordConfirmation: "SenhaDeApresentacao123",
        business_name: "Pet Shop QA", business_city: "Campo Grande", business_region: "Centro",
        business_address: "Rua dos Serviços, 100", business_phone: "(67) 99999-1234",
        business_website: "https://exemplo.com",
        business_description: "Banho, tosa, alimentação e orientações para tutores do bairro.",
      };
      for (const [key, value] of Object.entries(fields)) await form.locator('[name="' + key + '"]').fill(value);
      await form.locator('[name="business_category"]').selectOption("petshop");
      for (const key of ["business_publish_consent", "acceptTerms", "acceptPrivacy"])
        await form.locator('[name="' + key + '"]').check();
      await form.locator('button[type="submit"]').click();
      await page.getByRole("heading", { name: "Entre no BuscaPet" }).waitFor();
      await page.locator('#real-login [name="email"]').fill(fields.email);
      await page.locator('#real-login [name="password"]').fill(fields.password);
      await page.locator('#real-login button[type="submit"]').click();
      await page.getByRole("heading", { name: "Minha empresa" }).waitFor();
      assert.match(await page.locator("#real-screen").innerText(), /Em análise/);
      await page.goto(visit("novo-animal"));
      await page.getByRole("heading", { name: "Cadastrar animal" }).waitFor();
      await page.goto(visit("admin"));
      await page.getByRole("heading", { name: "Acesso negado" }).waitFor();
      await page.goto(visit("minha-conta"));
      await page.locator('[data-action="logout"]').first().click();
      await logIn(page, "admin@buscapet.test");
      await page.goto(visit("admin/empresas"));
      const company = page.locator(".local-admin-item", { hasText: "Pet Shop QA" });
      await company.locator('form[data-decision="approve"] [name="reason"]')
        .fill("Os dados comerciais foram revisados para a apresentação.");
      await company.locator('form[data-decision="approve"] button[type="submit"]').click();
      await page.goto(visit("services"));
      await page.getByRole("heading", { name: "Pet Shop QA", exact: true }).waitFor();
      await page.getByRole("link", { name: "Ver perfil" }).click();
      await page.getByRole("heading", { name: "Pet Shop QA", exact: true }).waitFor();
      assert.match(await page.locator("#real-screen").innerText(), /Banho, tosa/);
      assert.deepEqual(errors, []);
      console.log("Commercial profile approval flow passed.");
    } finally { await context.close(); }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
