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

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const remote = [];
  await context.route("https://*.supabase.co/**", (route) => { remote.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  if (share) await page.goto(share);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const auditShot = async (group, route, width) => {
    if (!process.env.AUDIT_SCREENSHOT_DIR || ![390, 768, 1440].includes(width)) return;
    fs.mkdirSync(process.env.AUDIT_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(process.env.AUDIT_SCREENSHOT_DIR, `${group}-${route.split("/")[0]}-${width}.png`),
      fullPage: true,
    });
  };
  try {
    await page.goto(base + "/#home");
    await page.getByRole("heading", { name: "Vamos trazer seu pet de volta." }).waitFor({ timeout: 5000 }).catch(async (error) => {
      console.error("Initial page:", (await page.locator("body").innerText()).slice(0, 900), errors);
      throw error;
    });
    assert.equal(await page.evaluate(() => window.BPLocalPreview?.active), true);
    assert.equal(await page.evaluate(() => window.BPSupabase.configured), false);
    assert.match(await page.locator(".demo-strip").innerText(), /somente neste navegador/);
    await page.waitForFunction(() => {
      const illustration = document.querySelector(".hero-pet > img");
      return illustration?.complete && illustration.naturalWidth > 0;
    }, { timeout: 10000 });

    assert.equal(await page.locator(".demo-strip").isVisible(), true);

    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading] of Object.entries({
        home: "Vamos trazer seu pet de volta.", mapa: "Mapa da busca", services: "Rede de apoio",
        login: "Entrar na prévia local", registro: "Cadastro indisponível na prévia",
        "esqueci-senha": "Recuperação indisponível na prévia", sobre: "Sobre o BuscaPet",
        termos: "Termos de Uso", privacidade: "Privacidade",
      })) {
        await page.goto(`${base}/#${route}`);
        await page.getByRole("heading", { name: heading }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true, `${route} @ ${width}`);
        if (route === "home" && width <= 1199) {
          const withinHeader = await page.locator(".accessibility-trigger").evaluate((element) => {
            const button = element.getBoundingClientRect();
            const header = document.querySelector(".app-header").getBoundingClientRect();
            return button.top >= header.top && button.bottom <= header.bottom;
          });
          assert.equal(withinHeader, true, `acessibilidade fora do cabeçalho @ ${width}`);
        }
        await auditShot("public", route, width);
        if (process.env.SCREENSHOT_DIR && [390, 1440].includes(width) && ["home", "mapa", "services", "login"].includes(route)) {
          fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${route}-${width}.png`), fullPage: true });
        }
      }
    }

    await page.goto(base + "/#login");
    await page.getByRole("button", { name: "Entrar como Tutor Local" }).click();
    await page.getByRole("heading", { name: "Minha Área" }).waitFor();
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading] of Object.entries({
        "painel-tutor": "Minha Área", "meus-animais": "Meus animais",
        "novo-animal": "Cadastrar animal", "publicar/found": "Animal encontrado",
        "minha-conta": "Minha conta", admin: "Acesso negado",
      })) {
        await page.goto(`${base}/#${route}`);
        await page.getByRole("heading", { name: heading }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true, `${route} @ ${width}`);
        await auditShot("area", route, width);
      }
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(base + "/#home");
    const toggle = page.locator(".menu-toggle");
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await page.getByRole("button", { name: "Abrir opções de acessibilidade" }).click();
    await page.locator("#accessibility-dialog").getByLabel("Escolha de cor").selectOption("dark");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(base + "/#novo-animal");
    const pet = page.locator("#real-pet-form");
    await pet.getByRole("button", { name: "Salvar animal" }).click();
    assert.equal(await pet.locator('[name="name"]').evaluate((element) => element.validity.valueMissing), true);
    await pet.locator('[name="name"]').fill("Lua");
    await pet.locator('[name="breed"]').fill("Sem raca definida");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    await pet.locator('[name="pet_photos"]').setInputFiles({ name: "lua.png", mimeType: "image/png", buffer: png });
    await pet.getByRole("button", { name: "Salvar animal" }).click();
    await page.getByRole("heading", { name: "Lua", exact: true }).waitFor();
    const petId = new URL(page.url()).hash.split("/")[1];
    assert.match(petId, /^[0-9a-f-]{36}$/);
    await page.reload();
    await page.getByRole("heading", { name: "Lua", exact: true }).waitFor();
    assert.equal(await page.locator("#pet-photo-gallery img").count(), 1);
    await page.getByRole("button", { name: "Excluir animal" }).click();
    assert.equal(await page.locator("#real-dialog").evaluate((dialog) => dialog.open), true);
    await page.getByRole("button", { name: "Cancelar" }).click();
    assert.equal(await page.locator("#real-dialog").evaluate((dialog) => dialog.open), false);
    await page.goto(`${base}/#editar-animal/${petId}`);
    await page.locator('#real-pet-form [name="breed"]').fill("Mestica");
    await page.locator("#real-pet-form").getByRole("button", { name: "Salvar animal" }).click();
    await page.getByRole("heading", { name: "Lua", exact: true }).waitFor();
    await page.getByText("Mestica").waitFor();

    await page.goto(base + "/#publicar/found");
    const occurrence = page.locator("#real-occurrence-form");
    await occurrence.locator('[name="pet_id"]').selectOption(petId);
    await occurrence.locator('[name="city"]').fill("Cuiaba");
    await occurrence.locator('[name="region"]').fill("Centro");
    await occurrence.locator('[name="description"]').fill("Animal encontrado perto da praca central.");
    await occurrence.locator('[name="rights"]').check();
    await occurrence.locator('[name="reuse_pet_photos"]').check();
    await occurrence.getByRole("button", { name: "Publicar alerta" }).click();
    await page.getByRole("heading", { name: "Animal encontrado", exact: true }).waitFor();
    const occurrenceId = new URL(page.url()).hash.split("/")[1];
    await page.goto(`${base}/#editar/${occurrenceId}`);
    await page.locator('#real-occurrence-form [name="description"]').fill("Animal encontrado perto do mercado central.");
    await page.locator('#real-occurrence-form [name="rights"]').check();
    await page.locator("#real-occurrence-form").getByRole("button", { name: "Salvar alterações" }).click();
    await page.getByText("Animal encontrado perto do mercado central.").waitFor();
    await page.goto(base + "/#home");
    await page.locator("[data-occurrence-card]").waitFor();
    await page.locator("#real-query").fill("sem resultado");
    await page.getByText("0 alertas encontrados").waitFor();
    await page.getByRole("button", { name: "Limpar filtros" }).first().click();
    await page.locator("[data-occurrence-card]").waitFor();
    await page.reload();
    await page.locator("[data-occurrence-card]").waitFor();
    assert.equal(await page.locator("[data-occurrence-card]").count(), 1);
    assert.equal(await page.locator("[data-alert-photo] img").count(), 1);

    await page.goto(base + "/#publicar/lost");
    const lost = page.locator("#real-occurrence-form");
    await lost.locator('[name="city"]').fill("Cuiaba");
    await lost.locator('[name="region"]').fill("Centro");
    await lost.locator('[name="description"]').fill("Animal desaparecido na regiao central.");
    await lost.getByRole("button", { name: "Marcar centro do mapa" }).click();
    await lost.locator('[name="location_consent"]').check();
    await lost.locator('[name="rights"]').check();
    await lost.getByRole("button", { name: "Publicar alerta" }).click();
    await page.getByRole("heading", { name: "Animal desaparecido", exact: true }).waitFor();
    await page.goto(base + "/#mapa");
    await page.locator("#map-results-status").getByText("1 ponto desta prévia").waitFor();
    await page.locator('[data-map-filter="last-known"]').uncheck();
    assert.equal(await page.locator(".bp-map-icon.last-known").count(), 0);
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, heading] of [
        [`animal/${petId}`, "Lua"], [`editar-animal/${petId}`, "Editar animal"],
        [`pet/${occurrenceId}`, "Animal encontrado"], [`editar/${occurrenceId}`, "Editar alerta"],
        [`avistamento/${occurrenceId}`, "Registrar avistamento"],
        [`denunciar/${occurrenceId}`, "Denunciar alerta"],
        [`mapa/${occurrenceId}`, "Mapa da busca"], ["map", "Mapa da busca"],
        ["admin/usuarios", "Acesso negado"],
        ["admin/ocorrencias", "Acesso negado"],
        ["admin/denuncias", "Acesso negado"],
        ["admin/moderacao", "Acesso negado"],
        ["verificar-email", "Cadastro indisponível na prévia"],
        ["redefinir-senha", "Recuperação indisponível na prévia"],
      ]) {
        await page.goto(`${base}/#${route}`);
        await page.getByRole("heading", { name: heading }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true, `${route} @ ${width}`);
        await auditShot("detail", route, width);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto(`${base}/#avistamento/${occurrenceId}`);
    await page.locator("#real-sighting-form").waitFor();
    await page.locator('#real-sighting-form [name="area_description"]').fill("Perto da praca");
    await page.locator('#real-sighting-form [name="description"]').fill("Vi um animal parecido atravessando a rua.");
    await page.locator('#real-sighting-form button[type="submit"]').click();
    await page.getByRole("heading", { name: "Animal encontrado", exact: true }).waitFor();
    await page.getByText("Avistamentos recebidos (1)").waitFor();
    await page.getByRole("button", { name: "Marcar como revisado" }).click();
    await page.locator("#real-sightings small").filter({ hasText: "Revisado" }).waitFor();

    await page.goto(`${base}/#animal/${petId}`);
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await page.getByText("Nenhuma fotografia cadastrada.").waitFor();
    await page.goto(`${base}/#pet/${occurrenceId}`);
    await page.locator("#real-photo-gallery img").waitFor();
    assert.equal(await page.locator("#real-photo-gallery img").count(), 1);
    await page.getByRole("button", { name: "Excluir foto" }).click();
    await page.locator("#real-dialog").getByRole("button", { name: "Confirmar" }).click();
    await page.locator("#real-photo-gallery .photo-placeholder").waitFor();

    await page.goto(base + "/#minha-conta");
    await page.getByRole("heading", { name: "Minha conta" }).waitFor();
    await page.getByRole("button", { name: "Sair da prévia" }).click();
    await page.getByRole("heading", { name: "Entrar na prévia local" }).waitFor();
    assert.equal(remote.length, 0);
    assert.deepEqual(errors, []);
    console.log("Modern preview: 174 route/width checks and local pet, photo, occurrence, map, sighting, search, edit, removal, reload, menu, theme, dialog, logout passed.");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
