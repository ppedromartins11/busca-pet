/* Full map workflow against an isolated local Supabase stack and local Vite server.
 * BASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY required.
 */
const { chromium } = require('playwright-core');
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const base = process.env.BASE_URL || 'http://127.0.0.1:5175';
const url = process.env.SUPABASE_URL;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url || '') ||
  !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) {
  throw new Error('Use only local Supabase and Vite URLs');
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonymous = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const chrome = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((path) => fs.existsSync(path));
const users = [];
async function account() {
  const email = `map-browser-${randomUUID()}@example.test`;
  const password = `local-${randomUUID()}-Pass1!`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error) throw result.error;
  users.push(result.data.user.id);
  return { email, password, id: result.data.user.id };
}
async function login(page, user) {
  await page.goto(`${base}/#login`);
  await page.locator('#real-login [name="email"]').fill(user.email);
  await page.locator('#real-login [name="password"]').fill(user.password);
  await page.locator('#real-login button[type="submit"]').click();
  await page.waitForURL(/#painel-tutor$/);
}
async function publicPoints(id) {
  const { data, error } = await anonymous.rpc('search_public_map_points', { p_occurrence: id });
  if (error) throw error;
  return data;
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(chrome ? { executablePath: chrome } : {}) });
  let tutorPage, reporterPage, visitorPage;
  try {
    const tutor = await account();
    const reporter = await account();
    tutorPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await login(tutorPage, tutor);
    await tutorPage.goto(`${base}/#publicar/lost`);
    const form = tutorPage.locator('#real-occurrence-form');
    await form.locator('[name="city"]').fill('Cuiaba');
    await form.locator('[name="region"]').fill('Centro');
    await form.locator('[name="description"]').fill('Cao perdido perto da praca central');
    await form.locator('[name="rights"]').check();
    await form.getByRole('button', { name: 'Marcar centro do mapa' }).click();
    await form.locator('[name="location_description"]').fill('Perto da praca central');
    await form.locator('[name="location_consent"]').check();
    await form.getByRole('button', { name: 'Publicar alerta' }).click();
    await tutorPage.waitForURL(/#pet\/[0-9a-f-]{36}$/i);
    const occurrenceId = tutorPage.url().split('/').pop();
    assert((await publicPoints(occurrenceId)).some((point) => point.category === 'last-known'));
    await tutorPage.reload();
    await tutorPage.getByText(/Uma área aproximada de 900 m/).waitFor();

    visitorPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await visitorPage.goto(`${base}/#mapa/${occurrenceId}`);
    await visitorPage.locator('#map-results-status').filter({ hasText: /ponto publicado/ }).waitFor();
    assert.equal(await visitorPage.locator('.bp-map-icon.last-known').count(), 1);
    assert.equal(await visitorPage.locator('.bp-map-icon.sighting').count(), 0);
    assert.equal(await visitorPage.getByText(/Esta ocorrência ainda não possui uma região marcada/).count(), 0);
    assert.equal(await visitorPage.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), true);

    reporterPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await login(reporterPage, reporter);
    await reporterPage.goto(`${base}/#avistamento/${occurrenceId}`);
    const sightingForm = reporterPage.locator('#real-sighting-form');
    await sightingForm.locator('[name="area_description"]').fill('Perto do mercado');
    await sightingForm.locator('[name="direction"]').fill('Seguiu para o norte');
    await sightingForm.locator('[name="description"]').fill('Vi um cao semelhante perto do mercado');
    await sightingForm.getByRole('button', { name: 'Marcar centro do mapa' }).click();
    await sightingForm.locator('[name="location_description"]').fill('Perto do mercado');
    await sightingForm.locator('[name="location_consent"]').check();
    await sightingForm.getByRole('button', { name: 'Enviar avistamento' }).click();
    await reporterPage.waitForURL(new RegExp(`#pet/${occurrenceId}$`));
    assert.equal((await publicPoints(occurrenceId)).filter((point) => point.category === 'sighting').length, 0);

    await tutorPage.reload();
    await tutorPage.getByRole('button', { name: /Marcar como revisado/ }).click();
    assert.equal((await publicPoints(occurrenceId)).filter((point) => point.category === 'sighting').length, 0);
    await tutorPage.getByRole('button', { name: /Autorizar região/ }).click();
    await tutorPage.getByRole('button', { name: /Retirar do mapa/ }).waitFor();
    assert.equal((await publicPoints(occurrenceId)).filter((point) => point.category === 'sighting').length, 1);
    await visitorPage.reload();
    await visitorPage.locator('#map-results-status').filter({ hasText: /2 pontos publicados/ }).waitFor();
    assert.equal(await visitorPage.locator('.bp-map-icon.sighting').count(), 1);
    await visitorPage.locator('.map-point-item').last().click();
    await visitorPage.locator('.leaflet-popup').waitFor();
    await visitorPage.locator('input[data-map-filter="sighting"]').uncheck();
    assert.equal(await visitorPage.locator('.bp-map-icon.sighting').count(), 0);
    console.log('Browser map E2E: creation, reload, public view, pending/review/approval, timeline, filters, mobile passed');
  } finally {
    await browser.close();
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
