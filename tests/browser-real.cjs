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
    };
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading] of Object.entries(routeHeadings)) {
        await page.goto(base + "/#" + route, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: heading }).waitFor();
        if (route === "home" && [390, 1440].includes(width) && process.env.SCREENSHOT_DIR) {
          fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(process.env.SCREENSHOT_DIR, `real-home-${width}.png`),
            fullPage: true,
          });
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
