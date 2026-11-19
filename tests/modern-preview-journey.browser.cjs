const { chromium } = require("playwright-core");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const base = process.env.BASE_URL || "http://127.0.0.1:5186";
const share = process.env.VERCEL_SHARE_URL;
const chrome = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((candidate) => fs.existsSync(candidate));
const photo = fs.readFileSync(path.join(__dirname, "..", "assets", "hex.png"));

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.grantPermissions(["geolocation"], { origin: new URL(base).origin });
      await context.setGeolocation({ latitude: -20.4732, longitude: -54.615, accuracy: 25 });
      const page = await context.newPage();
      if (share) await page.goto(share);
      const errors = [];
      const remote = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await context.route("https://*.supabase.co/**", (route) => { remote.push(route.request().url()); return route.abort(); });
      await context.route("https://*.tile.openstreetmap.org/**", (route) => route.abort());
      const shot = async (name) => {
        if (!process.env.JOURNEY_SCREENSHOT_DIR) return;
        fs.mkdirSync(process.env.JOURNEY_SCREENSHOT_DIR, { recursive: true });
        await page.evaluate(() => {
          document.querySelector("#real-toast")?.replaceChildren();
          window.scrollTo(0, 0);
        });
        await page.screenshot({ path: path.join(process.env.JOURNEY_SCREENSHOT_DIR, `${name}-${width}.png`), fullPage: true });
      };
      try {
        await page.goto(base + "/#home");
        await page.getByRole("heading", { name: "Vamos trazer seu pet de volta." }).waitFor();
        await page.goto(base + "/#login");
        await page.locator("#real-login [name=\"email\"]").fill("tutor@buscapet.test");
        await page.locator("#real-login [name=\"password\"]").fill("BuscaPet@2026");
        await page.locator("#real-login").getByRole("button", { name: "Entrar", exact: true }).click();
        await page.getByRole("heading", { name: "Minha área" }).waitFor();

        await page.goto(base + "/#novo-animal");
        const animalForm = page.locator("#real-pet-form");
        await animalForm.locator('[name="name"]').fill("Amora");
        await animalForm.locator('[name="breed"]').fill("Sem raça definida");
        await animalForm.locator('[name="pet_photos"]').focus();
        assert.equal(await animalForm.locator(".file-picker-control").evaluate((element) => getComputedStyle(element).outlineWidth), "3px");
        const chooser = page.waitForEvent("filechooser");
        await animalForm.locator(".file-picker-control").click();
        await (await chooser).setFiles({ name: "amora.png", mimeType: "image/png", buffer: photo });
        await animalForm.locator(".file-picker-name").getByText("amora.png").waitFor();
        await animalForm.getByRole("button", { name: "Salvar animal" }).click();
        await page.getByRole("heading", { name: "Amora", exact: true }).waitFor();
        await page.locator("#pet-photo-gallery img").waitFor();
        const animalId = new URL(page.url()).hash.split("/")[1];
        await shot("animal");

        await page.goto(`${base}/#editar-animal/${animalId}`);
        await page.locator('#real-pet-form [name="coat_description"]').fill("Pelagem caramelo");
        await page.locator("#real-pet-form").getByRole("button", { name: "Salvar animal" }).click();
        await page.getByText("Pelagem caramelo").waitFor();

        await page.goto(base + "/#publicar/lost");
        const occurrence = page.locator("#real-occurrence-form");
        await occurrence.locator('[name="pet_id"]').selectOption(animalId);
        await occurrence.locator('[name="city"]').fill("Cuiabá");
        await occurrence.locator('[name="region"]').fill("Centro");
        await occurrence.locator('[name="description"]').fill("Amora desapareceu perto da praça central. Tem pelagem caramelo.");
        await occurrence.locator('[name="reuse_pet_photos"]').check();
        await occurrence.getByRole("button", { name: "Usar minha localização atual" }).click();
        await occurrence.locator("#point-location-status").getByText("Mapa centralizado na sua posição.", { exact: false }).waitFor();
        assert.match(await occurrence.locator("#point-location-status").innerText(), /Precisão estimada: 25 m/);
        assert.match(await occurrence.locator("#point-selection-status").innerText(), /Nenhuma região marcada/);
        await occurrence.getByRole("button", { name: "Marcar centro do mapa" }).click();
        assert.match(await occurrence.locator("#point-selection-status").innerText(), /Ponto escolhido/);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true);
        await occurrence.locator('[name="location_description"]').fill("Próximo à praça central");
        await occurrence.locator('[name="location_consent"]').check();
        await occurrence.locator('[name="rights"]').check();
        await occurrence.getByRole("button", { name: "Publicar alerta" }).click();
        await page.getByRole("heading", { name: "Animal desaparecido", exact: true }).waitFor();
        const occurrenceId = new URL(page.url()).hash.split("/")[1];
        await page.locator("#real-photo-gallery img").waitFor();
        await shot("alerta");

        await page.goto(base + "/#home");
        await page.locator("[data-occurrence-card]").waitFor();
        await page.locator("#real-query").fill("praça central");
        await page.getByText("1 alerta encontrado").waitFor();
        await page.getByRole("button", { name: "Desaparecidos" }).click();
        assert.equal(await page.locator("[data-occurrence-card]:not([hidden])").count(), 1);
        await page.locator("[data-alert-photo]").scrollIntoViewIfNeeded();
        await page.locator("[data-alert-photo] img.is-loaded").waitFor();
        if (process.env.JOURNEY_SCREENSHOT_DIR) await page.waitForTimeout(350);
        await shot("feed");
        await page.locator("[data-occurrence-card] .card-link").click();
        await page.getByRole("heading", { name: "Animal desaparecido", exact: true }).waitFor();
        await page.getByRole("link", { name: "Ver no mapa" }).click();
        await page.locator("#map-results-status").getByText("1 ponto no mapa").waitFor();
        assert.match(await page.locator("#map-text-points").innerText(), /Próximo à praça central/);
        await shot("mapa");

        await page.goto(`${base}/#pet/${occurrenceId}`);
        await page.getByRole("link", { name: "Registrar avistamento" }).click();
        const sighting = page.locator("#real-sighting-form");
        await sighting.locator('[name="area_description"]').fill("Perto da praça central");
        await sighting.locator('[name="description"]').fill("Vi um cão parecido seguindo em direção ao mercado.");
        await sighting.getByRole("button", { name: "Marcar centro do mapa" }).click();
        await sighting.locator('[name="location_description"]').fill("Perto da praça central");
        await sighting.locator('[name="location_consent"]').check();
        await sighting.getByRole("button", { name: "Enviar avistamento" }).click();
        await page.getByText("Avistamentos recebidos (1)").waitFor();
        await shot("historico");
        await page.getByRole("button", { name: "Marcar como revisado" }).click();
        await page.getByRole("button", { name: "Autorizar região no mapa" }).click();
        await page.goto(base + "/#mapa");
        await page.locator("#map-results-status").getByText("2 pontos no mapa").waitFor();
        await page.locator('[data-map-filter="last-known"]').uncheck();
        assert.equal(await page.locator(".bp-map-icon.last-known").count(), 0);
        assert.equal(await page.locator(".bp-map-icon.sighting").count(), 1);
        await page.goto(`${base}/#pet/${occurrenceId}`);
        await page.reload();
        await page.getByText("Avistamentos recebidos (1)").waitFor();
        await page.locator("#real-photo-gallery img").waitFor();

        await page.getByRole("button", { name: "Abrir opções de acessibilidade" }).click();
        await page.locator("#accessibility-dialog").getByLabel("Escolha de cor").selectOption("dark");
        assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
        await page.keyboard.press("Escape");
        await shot("tema-escuro");

        if (width === 390) {
          await page.locator(".menu-toggle").click();
          await page.locator('#real-mobile-nav a[href="#meus-animais"]').click();
          await page.getByRole("heading", { name: "Meus animais" }).waitFor();
          assert.equal(await page.locator(".menu-toggle").getAttribute("aria-expanded"), "false");
        } else {
          await page.locator('#real-nav a[href="#meus-animais"]').click();
          await page.getByRole("heading", { name: "Meus animais" }).waitFor();
        }
        await page.goto(base + "/#minha-conta");
        await page.getByRole("button", { name: "Sair" }).click();
        await page.getByRole("heading", { name: "Entre no BuscaPet" }).waitFor();
        await page.goto(base + "/#home");
        await page.locator("[data-occurrence-card]").waitFor();
        assert.equal(await page.locator("[data-occurrence-card]").count(), 1, "Sair não apaga os dados locais");

        await page.goto(base + "/#login");
        await page.locator("#real-login [name=\"email\"]").fill("tutor@buscapet.test");
        await page.locator("#real-login [name=\"password\"]").fill("BuscaPet@2026");
        await page.locator("#real-login").getByRole("button", { name: "Entrar", exact: true }).click();
        await page.goto(base + "/#home");
        await page.locator("#real-query").fill("sem resultados");
        await page.goto(base + "/#minha-conta");
        await page.getByRole("button", { name: "Redefinir dados de teste" }).click();
        await page.locator("#real-dialog").getByRole("button", { name: "Cancelar" }).click();
        await page.goto(base + "/#home");
        await page.getByRole("button", { name: "Limpar filtros" }).first().click();
        await page.locator("[data-occurrence-card]").waitFor();
        assert.equal(await page.locator("[data-occurrence-card]").count(), 1, "Cancelar preserva os dados");
        await page.locator("#real-query").fill("sem resultados");
        await page.goto(base + "/#minha-conta");
        await page.getByRole("button", { name: "Redefinir dados de teste" }).click();
        await page.locator("#real-dialog").getByRole("button", { name: "Confirmar" }).click();
        await page.getByRole("heading", { name: "Vamos trazer seu pet de volta." }).waitFor();
        await page.getByRole("heading", { name: "Ainda não há alertas publicados" }).waitFor();
        await page.reload();
        assert.equal(await page.locator("[data-occurrence-card]").count(), 0);
        assert.equal(await page.evaluate(() => window.BPAuth.getSession()), null);
        assert.deepEqual(remote, []);
        assert.deepEqual(errors, []);
        console.log(`${width}px: cadastro, foto, edição, alerta, feed, filtro, mapa, avistamento, recarga, tema, navegação, saída e limpeza passaram.`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
