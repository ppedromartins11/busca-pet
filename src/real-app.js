/* Interface conectada: dados reais via publishable key, Auth e RLS. */
import { createSearchMap, createPointPicker, DEMO_MAP_POINTS, MAP_CATEGORY_META } from "./search-map.js";

(() => {
  "use strict";
  const A = window.BPAuth;
  const D = window.BPRemoteStore;
  const Drafts = window.BPDrafts;
  const { escape: esc, icon, fmtDate, empty } = window.BPViews;
  const root = document.querySelector("#main-content");
  const species = { dog: "Cão", cat: "Gato", other: "Outro" };
  const states = { active: "Em busca", located: "Localizado", reunited: "Reunido", closed: "Encerrado" };
  const types = { lost: "Animal desaparecido", found: "Animal encontrado" };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const protectedRoutes = new Set(["minha-conta", "meus-animais", "novo-animal", "animal", "editar-animal", "publicar", "editar", "painel-tutor", "avistamento", "denunciar", "admin"]);
  let generation = 0;
  let filters = { query: "", type: "", status: "" };
  let photos = [];
  let lastDialogFocus = null;
  let notice = "";
  let verificationEmail = "";
  let messageTimer;
  let mapController = null;
  let pointPicker = null;
  let selectedPoint = null;
  let removeExistingPoint = false;
  let mapMode = "real";
  let mapFilters = { "last-known": true, sighting: true, support: true, partner: true };
  let mapPoints = [];
  let mapOccurrenceId = "";
  let mapQueryGeneration = 0;
  const adminDirectory = { query: "", status: "", role: "", order: "newest", page: 1, pageSize: 20, request: 0, searchTimer: null };
  const adminOccurrences = { query: "", type: "", status: "", visibility: "", createdFrom: "", createdTo: "", page: 1, pageSize: 20, request: 0, searchTimer: null };
  const reportCategories = Object.freeze({
    false_misleading: "Informação falsa ou enganosa",
    suspected_fraud: "Suspeita de golpe ou fraude",
    inappropriate_content: "Fotografia ou conteúdo inadequado",
    duplicate_occurrence: "Ocorrência duplicada",
    misuse_of_information: "Uso indevido de informações",
    other: "Outro motivo",
  });
  const reportStatuses = Object.freeze({ open: "Aberta", in_review: "Em análise", resolved: "Resolvida", dismissed: "Descartada" });
  const adminReports = { query: "", status: "", category: "", createdFrom: "", createdTo: "", order: "newest", page: 1, pageSize: 20, request: 0, searchTimer: null };
  const adminModeration = { query: "", kind: "all", status: "pending", order: "priority", createdFrom: "", createdTo: "", page: 1, pageSize: 20, request: 0, searchTimer: null };

  const url = (route, id) => `#${route}${id ? `/${encodeURIComponent(id)}` : ""}`;
  const user = () => A.getCurrentUser();
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const draftMarkup = () => '<p class="hint draft-status" role="status" aria-live="polite"></p><button class="btn plain small" type="button" data-action="discard-draft">Descartar rascunho</button>';
  function enableDraft(form, formType, recordId, fields, serverUpdatedAt = null) {
    if (!form || !user()?.id || !Drafts) return { restored: false };
    form.dataset.draftType = formType;
    form.dataset.draftId = recordId || "new";
    let status = form.querySelector(".draft-status");
    if (!status) {
      form.querySelector(".form-error")?.insertAdjacentHTML("afterend", draftMarkup());
      status = form.querySelector(".draft-status");
    }
    return Drafts.attach(form, {
      userId: user().id, formType, recordId: recordId || "new", fields, serverUpdatedAt,
      onStatus: (text) => {
        if (!status) return;
        status.textContent = text.startsWith("Os dados") && status.textContent
          ? `${status.textContent} ${text}` : text;
      },
    });
  }
  function clearFormDraft(form) {
    if (form?.dataset.draftType && user()?.id)
      Drafts?.clear(user().id, form.dataset.draftType, form.dataset.draftId || "new");
  }
  async function preparePhoto(file) {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)
      throw Error("Escolha uma imagem JPEG, PNG ou WebP de até 5 MiB.");
    const source = URL.createObjectURL(file);
    try {
      const picture = new Image();
      await new Promise((resolve, reject) => {
        picture.onload = resolve;
        picture.onerror = () => reject(Error("Não foi possível ler a imagem."));
        picture.src = source;
      });
      if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth * picture.naturalHeight > 40_000_000)
        throw Error("A imagem tem dimensões inválidas ou grandes demais.");
      const scale = Math.min(1, 1600 / Math.max(picture.naturalWidth, picture.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw Error("Não foi possível preparar a imagem.");
      context.drawImage(picture, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, 0.85));
      if (!blob || blob.type !== file.type || !blob.size || blob.size > 5 * 1024 * 1024)
        throw Error("A imagem preparada excede 5 MiB. Escolha uma foto menor.");
      return new File([blob], "foto-sem-metadados", { type: file.type });
    } finally { URL.revokeObjectURL(source); }
  }
  function routeInfo() {
    const [hashPath = "", rawQuery = ""] = location.hash.replace(/^#/, "").split("?");
    const [route = "home", raw = "", rawDetail = ""] = hashPath.split("/");
    let id = "", detailId = "";
    try { id = decodeURIComponent(raw); } catch { /* invalid route is handled below */ }
    try { detailId = decodeURIComponent(rawDetail); } catch { /* invalid route is handled below */ }
    return { route: route || "home", id, detailId, source: new URLSearchParams(rawQuery).get("from") || "" };
  }
  function message(text) {
    const target = document.querySelector("#real-toast");
    clearTimeout(messageTimer);
    if (target) target.textContent = text;
    if (text) messageTimer = setTimeout(() => { if (target) target.textContent = ""; }, 6000);
  }
  function fail(error) {
    return error?.message || "Não foi possível concluir. Tente novamente.";
  }
  function releasePhotos() {
    for (const source of photos) URL.revokeObjectURL(source);
    photos = [];
  }
  function discardPhoto(source) {
    URL.revokeObjectURL(source);
    photos = photos.filter((current) => current !== source);
  }
  function destroyMap() {
    if (mapController) mapController.destroy();
    mapController = null;
    if (pointPicker) pointPicker.destroy();
    pointPicker = null;
    selectedPoint = null;
    removeExistingPoint = false;
  }
  function navigate(hash) {
    if (location.hash === hash) void render();
    else location.hash = hash;
  }
  function mount() {
    root.innerHTML = `<header class="app-header"><a class="logo" href="#home" aria-label="BuscaPet, início">${icon("paw")}<span class="wordmark">Busca<strong>Pet</strong></span></a><nav class="main-nav" aria-label="Navegação principal" id="real-nav"></nav><div class="header-actions" id="real-header-actions"></div><button class="menu-toggle" type="button" aria-controls="real-mobile-nav" aria-expanded="false" aria-label="Abrir menu"><span aria-hidden="true">☰</span><span>Menu</span></button><nav class="mobile-nav" id="real-mobile-nav" aria-label="Menu móvel" hidden></nav></header><div class="demo-strip"><span>MVP acadêmico conectado · dados reais no Supabase · use somente dados autorizados</span></div><div id="real-toast" class="toast" role="status" aria-live="polite"></div><section id="real-screen" class="screen current" aria-live="off"></section><dialog id="real-dialog" class="dialog"></dialog>`;
    document.querySelector("#real-dialog").addEventListener("close", () => lastDialogFocus?.focus());
    window.matchMedia("(min-width: 1200px)").addEventListener("change", (event) => { if (event.matches) closeMobileMenu(); });
  }
  function chrome(route) {
    const logged = Boolean(user());
    const admin = window.BPPermissions?.can("viewAdminDashboard");
    const moderator = window.BPPermissions?.can("moderate");
    const links = [
      ["home", "Início", "home"],
      ["mapa", "Mapa da busca", "map"],
      ["services", "Rede de apoio", ""],
      ...(logged ? [["painel-tutor", "Minha área", "paw"], ["meus-animais", "Meus animais", "heart"], ["publicar/lost", "Publicar", "plus"]] : []),
      ...(admin ? [["admin", "Administração", "user"]]
        : moderator ? [["admin/ocorrencias", "Moderação", "user"]] : []),
    ];
    const nav = links.map(([path, label, glyph]) => `<a href="#${path}" ${path.split("/")[0] === route ? 'aria-current="page" class="active"' : ""}>${glyph ? icon(glyph) : ""}${label}</a>`).join("");
    const actions = logged
      ? `<a href="#minha-conta" ${route === "minha-conta" ? 'aria-current="page"' : ""}>${icon("user")}Minha conta</a>`
      : `<a href="#login" ${route === "login" ? 'aria-current="page"' : ""}>${icon("user")}Entrar</a><a class="btn primary" href="#registro" ${route === "registro" ? 'aria-current="page"' : ""}>${icon("plus")}Criar conta</a>`;
    document.querySelector("#real-nav").innerHTML = nav;
    document.querySelector("#real-header-actions").innerHTML = actions;
    document.querySelector("#real-mobile-nav").innerHTML = nav + `<div class="mobile-actions">${actions}</div>`;
    closeMobileMenu();
  }
  function closeMobileMenu(focus = false) {
    const toggle = document.querySelector(".menu-toggle");
    const menu = document.querySelector("#real-mobile-nav");
    if (!toggle || !menu) return;
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menu");
    if (focus) toggle.focus();
  }
  function setPage(html, heading = "BuscaPet") {
    const screen = document.querySelector("#real-screen");
    screen.innerHTML = html;
    document.title = `BuscaPet | ${heading}`;
    const h1 = screen.querySelector("h1");
    if (h1) { h1.tabIndex = -1; h1.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  function shell(heading, intro, content, narrow = false) {
    return `<div class="page ${narrow ? "narrow" : ""}"><div class="page-title"><div><h1>${esc(heading)}</h1>${intro ? `<p class="intro">${esc(intro)}</p>` : ""}</div></div>${content}</div>`;
  }
  function mapFilterControl(category) {
    const meta = MAP_CATEGORY_META[category];
    return `<label class="map-filter"><input type="checkbox" data-map-filter="${category}" ${mapFilters[category] ? "checked" : ""}><span class="map-filter-symbol ${meta.className}" aria-hidden="true">${meta.symbol}</span><span>${meta.label}</span></label>`;
  }
  function mapPointItem(point, index) {
    const meta = MAP_CATEGORY_META[point.category];
    return `<li><button type="button" class="map-point-item" data-action="focus-map-point" data-id="${esc(point.id)}"><span class="map-filter-symbol ${meta.className}" aria-hidden="true">${meta.symbol}</span><span><b>${esc(index ? point.title : "Última região conhecida")}</b><small>${esc(point.region)}${point.time ? ` · ${esc(point.time)}` : ""}</small></span></button></li>`;
  }
  function supportPointItem(point) {
    const meta = MAP_CATEGORY_META[point.category];
    return `<article><span class="map-filter-symbol ${meta.className}" aria-hidden="true">${meta.symbol}</span><div><h3>${esc(point.title)}</h3><p>${esc(point.region)}</p><small>${esc(meta.label)} · ${esc(point.state)}</small><p>${esc(point.description)}</p></div></article>`;
  }
  function legacyCombinedMapPage() {
    destroyMap();
    const points = mapMode === "demo" ? DEMO_MAP_POINTS : [];
    const timeline = points.filter((point) => point.category === "last-known" || point.category === "sighting");
    const support = points.filter((point) => point.category === "support" || point.category === "partner");
    setPage(shell("Mapa e rede de apoio", "Consulte somente localizações aproximadas explicitamente autorizadas.", `<section class="map-academic-notice" role="note"><b>SIMULAÇÃO ACADÊMICA</b><span>Os pontos exibidos no cenário demonstrativo são fictícios e servem exclusivamente para demonstrar a funcionalidade.</span></section><div class="map-mode" role="group" aria-label="Fonte de dados do mapa"><button class="btn ${mapMode === "real" ? "primary" : "secondary"}" type="button" data-action="map-mode" data-mode="real" aria-pressed="${mapMode === "real"}">Dados reais disponíveis</button><button class="btn ${mapMode === "demo" ? "primary" : "secondary"}" type="button" data-action="map-mode" data-mode="demo" aria-pressed="${mapMode === "demo"}">Cenário demonstrativo</button></div>${mapMode === "real" ? '<p class="notice">Não há coordenadas públicas autorizadas para exibir no momento. A lista textual permanece vazia para evitar inferir localizações a partir de dados privados.</p>' : '<p class="notice">Modo demonstração ativo: nenhum ponto abaixo foi carregado do Supabase, do feed público ou das estatísticas reais.</p>'}<div class="map-controls"><fieldset><legend>Mostrar no mapa</legend><div>${Object.keys(MAP_CATEGORY_META).map(mapFilterControl).join("")}</div></fieldset><button class="btn secondary" type="button" data-action="use-location">${icon("pin")}Usar minha localização</button></div><p id="map-tiles-status" class="hint" role="status" aria-live="polite"></p><div class="map-layout"><div><div id="search-map" class="search-map" role="application" aria-label="Mapa interativo de pontos aproximados"></div><p class="map-attribution-note">Mapa © OpenStreetMap contributors. A posição do seu dispositivo não é salva nem publicada.</p></div><aside class="map-timeline" aria-labelledby="map-timeline-heading"><h2 id="map-timeline-heading">Linha do tempo${mapMode === "demo" ? " demonstrativa" : ""}</h2>${timeline.length ? `<ol>${timeline.map(mapPointItem).join("")}</ol>` : '<p>Nenhum ponto público autorizado para esta linha do tempo.</p>'}</aside></div><section class="map-text-list" aria-labelledby="map-points-heading"><h2 id="map-points-heading">Lista textual dos pontos</h2>${points.length ? `<ul>${points.map((point) => `<li><b>${esc(MAP_CATEGORY_META[point.category].label)}:</b> ${esc(point.title)} — ${esc(point.region)}${point.time ? ` (${esc(point.time)})` : ""}. ${esc(point.state)}.</li>`).join("")}</ul>` : '<p>Nenhum ponto geográfico real pode ser mostrado sem autorização pública.</p>'}</section><section class="map-support" aria-labelledby="map-support-heading"><h2 id="map-support-heading">Rede de apoio${mapMode === "demo" ? " demonstrativa" : ""}</h2>${support.length ? `<div>${support.map(supportPointItem).join("")}</div>` : '<p>Quando houver colaboradores ou parceiros autorizados para divulgação, eles aparecerão aqui com região aproximada e contato verificado.</p>'}</section>`, false), "Mapa e rede de apoio");
    const target = document.querySelector("#search-map");
    if (!target) return;
    mapController = createSearchMap(target, { onTilesError: () => {
      const status = document.querySelector("#map-tiles-status");
      if (status) status.textContent = "Não foi possível carregar o fundo do mapa. A lista textual de pontos continua disponível.";
    } });
    mapController.setPoints(points, mapFilters);
    requestAnimationFrame(() => mapController?.invalidateSize());
  }
  // The map intentionally has a separate experience from the support directory.
  // This declaration supersedes the legacy combined renderer above while retaining
  // its implementation in the file for a safe, incremental migration.
  function mapPage() {
    destroyMap();
    const points = mapMode === "demo" ? DEMO_MAP_POINTS.filter((point) =>
      point.category === "last-known" || point.category === "sighting") : [];
    const timeline = points.filter((point) => point.category === "last-known" || point.category === "sighting");
    setPage(shell("Mapa da busca", "Acompanhe avistamentos e descubra onde concentrar as buscas.", `${mapMode === "demo" ? '<p class="demo-disclaimer" role="note">Exemplo ilustrativo — os pontos não representam avistamentos reais.</p>' : ""}<div class="map-mode" role="group" aria-label="Fonte de dados do mapa"><button class="btn ${mapMode === "real" ? "primary" : "secondary"}" type="button" data-action="map-mode" data-mode="real" aria-pressed="${mapMode === "real"}">Dados da busca</button><button class="btn ${mapMode === "demo" ? "primary" : "secondary"}" type="button" data-action="map-mode" data-mode="demo" aria-pressed="${mapMode === "demo"}">Ver exemplo ilustrativo</button></div>${mapMode === "real" ? '<p class="notice">Ainda não há pontos registrados para esta busca.</p>' : ""}<div class="map-controls"><fieldset><legend>Mostrar no mapa</legend><div>${["last-known", "sighting"].map(mapFilterControl).join("")}</div></fieldset><button class="btn secondary" type="button" data-action="use-location">${icon("pin")}Usar minha localização</button></div><p id="map-tiles-status" class="hint" role="status" aria-live="polite"></p><div class="map-layout"><div><div id="search-map" class="search-map" role="application" aria-label="Mapa interativo de pontos aproximados"></div><p class="map-attribution-note">Mapa © OpenStreetMap contributors. A posição do seu dispositivo não é salva nem publicada.</p></div><aside class="map-timeline" aria-labelledby="map-timeline-heading"><h2 id="map-timeline-heading">Linha do tempo</h2>${timeline.length ? `<ol>${timeline.map(mapPointItem).join("")}</ol>` : '<p>Ainda não há avistamentos para esta busca.</p>'}</aside></div><section class="map-text-list" aria-labelledby="map-points-heading"><h2 id="map-points-heading">Pontos da busca</h2>${points.length ? `<ul>${points.map((point) => `<li><b>${esc(MAP_CATEGORY_META[point.category].label)}:</b> ${esc(point.title)} — ${esc(point.region)}${point.time ? ` (${esc(point.time)})` : ""}.</li>`).join("")}</ul>` : '<p>Quando um ponto público for registrado, ele aparecerá aqui.</p>'}</section>`, false), "Mapa da busca");
    const target = document.querySelector("#search-map");
    if (!target) return;
    mapController = createSearchMap(target, { onTilesError: () => {
      const status = document.querySelector("#map-tiles-status");
      if (status) status.textContent = "Não foi possível carregar o fundo do mapa. A lista textual de pontos continua disponível.";
    } });
    mapController.setPoints(points, mapFilters);
    requestAnimationFrame(() => mapController?.invalidateSize());
  }
  function asMapPoint(row) {
    return {
      id: row.id, category: row.category, occurrenceId: row.occurrence_id,
      latitude: row.latitude, longitude: row.longitude, radius_m: row.radius_m,
      title: row.title, city: row.city, region: `${row.region}, ${row.city}`,
      time: fmtDate(row.event_at, true), eventAt: row.event_at,
      description: row.description || "Área aproximada indicada no alerta.",
      state: states[row.occurrence_status] || "Alerta público",
    };
  }
  function mapListHtml(points) {
    const timeline = points.filter((point) => point.category === "last-known" || point.category === "sighting")
      .sort((a, b) => (a.category === "last-known" ? -1 : 1) - (b.category === "last-known" ? -1 : 1)
        || Date.parse(b.eventAt || 0) - Date.parse(a.eventAt || 0));
    const latestSighting = timeline.find((point) => point.category === "sighting")?.id;
    return {
      timeline: timeline.length ? `<ol>${timeline.map((point) => `<li><button type="button" class="map-point-item" data-action="focus-map-point" data-id="${esc(point.id)}"><span class="map-filter-symbol ${esc(point.category)}" aria-hidden="true">${MAP_CATEGORY_META[point.category].symbol}</span><span><b>${esc(point.title)}${point.id === latestSighting ? " · mais recente" : ""}</b><small>${esc(point.region)} · ${esc(point.time || "")}</small></span></button></li>`).join("")}</ol>` : '<p>Ainda não há eventos publicados para esta busca.</p>',
      list: points.length ? `<ul>${points.map((point) => `<li><b>${esc(point.title)}:</b> ${esc(point.region)}${point.time ? ` · ${esc(point.time)}` : ""}. ${esc(point.description)} ${point.occurrenceId ? `<a href="${url("pet", point.occurrenceId)}">Ver alerta</a>` : ""}</li>`).join("")}</ul>` : `<p>${mapOccurrenceId ? "Esta ocorrência ainda não possui uma região marcada no mapa." : "Ainda não há pontos registrados para esta busca."}</p>`,
    };
  }
  async function loadRealMapPoints({ useViewport = false } = {}) {
    const request = ++mapQueryGeneration;
    const controller = mapController;
    const status = document.querySelector("#map-results-status");
    if (!controller || !status) return;
    status.textContent = "Atualizando pontos…";
    const city = document.querySelector("#map-city")?.value.trim() || "";
    const region = document.querySelector("#map-region")?.value.trim() || "";
    const occurrenceStatus = document.querySelector("#map-status-filter")?.value || "";
    const days = Number(document.querySelector("#map-period")?.value || 0);
    try {
      const rows = await D.listPublicMapPoints({
        occurrenceId: mapOccurrenceId || null,
        center: useViewport ? controller.getSearchArea() : null,
        city, region, status: occurrenceStatus,
        since: days ? new Date(Date.now() - days * 86400000).toISOString() : null,
        limit: 200,
      });
      if (request !== mapQueryGeneration || mapController !== controller) return;
      mapPoints = rows.map(asMapPoint);
      controller.setPoints(mapPoints, mapFilters, { fit: !useViewport });
      const lists = mapListHtml(mapPoints);
      document.querySelector("#map-timeline-events").innerHTML = lists.timeline;
      document.querySelector("#map-text-points").innerHTML = lists.list;
      status.textContent = `${mapPoints.length} ${mapPoints.length === 1 ? "ponto publicado" : "pontos publicados"}`;
    } catch (error) {
      if (request !== mapQueryGeneration || mapController !== controller) return;
      status.textContent = error?.code === "PGRST202" || error?.code === "UNAVAILABLE"
        ? "Os pontos do mapa ainda não estão disponíveis. Tente novamente após a atualização do serviço."
        : fail(error);
      console.error("[BuscaPet][mapa]", { code: error?.code, status: error?.status, cause: error?.message });
    }
  }
  function realMapPage(occurrenceId = "") {
    destroyMap();
    mapOccurrenceId = UUID.test(occurrenceId) ? occurrenceId : "";
    mapPoints = mapMode === "demo" ? DEMO_MAP_POINTS : [];
    const lists = mapListHtml(mapPoints);
    const filterFields = mapMode === "real" ? `<div class="map-search-fields"><label>Cidade<input class="control" id="map-city" maxlength="80" placeholder="Todas as cidades"></label><label>Região<input class="control" id="map-region" maxlength="100" placeholder="Todas as regiões"></label><label>Situação<select class="control" id="map-status-filter"><option value="">Todas</option>${Object.entries(states).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><label>Período<select class="control" id="map-period"><option value="">Qualquer data</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label></div><div class="actions"><button class="btn secondary" type="button" data-action="apply-map-filters">Aplicar filtros</button><button class="btn secondary" type="button" data-action="refresh-map">Atualizar pontos</button></div>` : "";
    setPage(shell("Mapa da busca", "Acompanhe avistamentos e descubra onde concentrar as buscas.", `${mapOccurrenceId ? `<p><a class="back-link" href="${url("pet", mapOccurrenceId)}">‹ Voltar ao alerta</a></p>` : ""}${mapMode === "demo" ? '<p class="demo-disclaimer" role="note">Exemplo ilustrativo — os pontos não representam avistamentos reais.</p>' : ""}<div class="map-mode" role="group" aria-label="Fonte de dados do mapa"><button class="btn ${mapMode === "real" ? "primary" : "secondary"}" type="button" data-action="map-mode" data-mode="real" aria-pressed="${mapMode === "real"}">Dados da busca</button><button class="btn ${mapMode === "demo" ? "primary" : "secondary"}" type="button" data-action="map-mode" data-mode="demo" aria-pressed="${mapMode === "demo"}">Ver exemplo ilustrativo</button></div>${filterFields}<div class="map-controls"><fieldset><legend>Mostrar no mapa</legend><div>${Object.keys(MAP_CATEGORY_META).map(mapFilterControl).join("")}</div></fieldset><button class="btn secondary" type="button" data-action="use-location">${icon("pin")}Usar minha localização</button></div><p id="map-results-status" class="hint" role="status" aria-live="polite"></p><p id="map-tiles-status" class="hint" role="status" aria-live="polite"></p><div class="map-layout"><div><div id="search-map" class="search-map" role="application" aria-label="Mapa interativo de regiões aproximadas"></div><p class="map-attribution-note">Mapa © OpenStreetMap contributors. A localização do seu dispositivo não é salva nem publicada.</p></div><aside class="map-timeline"><h2>Linha do tempo</h2><div id="map-timeline-events">${lists.timeline}</div></aside></div><section class="map-text-list"><h2>Pontos da busca</h2><div id="map-text-points">${lists.list}</div></section>`, false), "Mapa da busca");
    const target = document.querySelector("#search-map");
    mapController = createSearchMap(target, { onTilesError: () => {
      const status = document.querySelector("#map-tiles-status");
      if (status) status.textContent = "Não foi possível carregar o fundo do mapa. A lista textual continua disponível.";
    } });
    mapController.setPoints(mapPoints, mapFilters);
    requestAnimationFrame(() => mapController?.invalidateSize());
    if (mapMode === "real") void loadRealMapPoints();
  }
  function servicesPage() {
    destroyMap();
    setPage(shell("Rede de apoio", "Encontre formas seguras de ajudar e fortaleça a busca na sua comunidade.", `<section class="support-intro"><div><h2>Como você pode ajudar</h2><p>Divulgue o alerta na região indicada, confira pontos próximos com segurança e informe um avistamento com data, horário e referência.</p></div><a class="btn primary" href="#mapa">${icon("map")}Ver pontos no mapa</a></section><section class="support-categories" aria-label="Categorias de apoio"><article>${icon("search")}<h2>Divulgação local</h2><p>Compartilhe o alerta em grupos de bairro, condomínios e comércios, sempre usando as informações públicas.</p></article><article>${icon("paw")}<h2>Busca em campo</h2><p>Ajude a percorrer a região em horários combinados. Não entre em locais privados nem se exponha a riscos.</p></article><article>${icon("heart")}<h2>Acolhimento temporário</h2><p>Se encontrar um animal, mantenha-o em segurança e registre a ocorrência para aproximar o tutor.</p></article></section><section class="support-directory" aria-labelledby="partners-heading"><h2 id="partners-heading">Colaboradores e parceiros</h2><p>Não há colaboradores, clínicas veterinárias ou pet shops cadastrados para exibição no momento. Quando um contato autorizar a divulgação, ele aparecerá nesta página.</p><h2>Orientações para apoiar um tutor</h2><p>Evite publicar endereço residencial, telefone ou localização exata. Compartilhe somente a referência informada no alerta e encaminhe pistas pelo BuscaPet.</p></section>`, false), "Rede de apoio");
  }
  function pointPickerMarkup(kind) {
    const occurrence = kind === "occurrence";
    return `<fieldset class="geo-picker full"><legend>${occurrence ? "Última região conhecida" : "Região do avistamento"} (opcional)</legend><p>Amplie o mapa, clique na região e arraste o marcador se precisar ajustar. Pelo teclado, use as setas para mover o mapa e marque o centro. O ponto divulgado será arredondado e exibido como uma área de cerca de 900 metros de raio.</p><div class="geo-picker-map" id="${kind}-point-map" role="application" aria-label="Escolha uma região aproximada no mapa"></div><div class="actions"><button class="btn secondary small" type="button" data-action="choose-center">Marcar centro do mapa</button><button class="btn secondary small" type="button" data-action="clear-point">Remover região marcada</button></div><p id="point-selection-status" role="status">Nenhuma região marcada.</p><label>Referência pública da região<input class="control" name="location_description" maxlength="200" placeholder="Ex.: perto da praça central"></label><label class="check-label"><input type="checkbox" name="location_consent"><span>Autorizo divulgar esta região aproximada no mapa público${occurrence ? "." : " somente após revisão e aprovação do tutor."}</span></label></fieldset>`;
  }
  function mountPointPicker(kind, initial = null) {
    const target = document.querySelector(`#${kind}-point-map`);
    if (!target) return;
    selectedPoint = null;
    removeExistingPoint = false;
    pointPicker = createPointPicker(target, {
      initial: kind === "occurrence" ? initial : null,
      center: kind === "sighting" ? initial : null,
      onChange: (point) => {
      selectedPoint = point;
      const status = document.querySelector("#point-selection-status");
      if (status) status.textContent = "Região aproximada marcada no mapa (raio de 900 m).";
      if (kind === "occurrence" && initial
        && (point.latitude !== initial.latitude || point.longitude !== initial.longitude)) {
        const consent = document.querySelector('[name="location_consent"]');
        if (consent) consent.checked = false;
      }
      },
    });
    requestAnimationFrame(() => pointPicker?.invalidateSize());
  }
  function alertCard(item) {
    return `<article class="pet"><div class="photo" data-alert-photo="${esc(item.id)}"><span class="photo-placeholder">${icon("paw")}<small>Sem foto disponível</small></span></div><div class="pet-body"><div class="card-tags"><span class="tag ${item.type === "found" ? "found" : ""}">${types[item.type]}</span><span class="tag">${states[item.status] || "Situação indisponível"}</span></div><h3>${types[item.type]}</h3><p class="pet-description">${esc(item.description)}</p><p class="pet-location">${icon("pin")} ${esc(item.region)}<span>${esc(item.city)}</span></p>${item.public_reference ? `<p class="hint">${esc(item.public_reference)}</p>` : ""}<div class="card-bottom"><span>${fmtDate(item.last_seen_at)}</span></div><div class="card-footer"><span>Alerta da comunidade</span><b>Ver alerta</b></div></div><a class="card-link" href="${url("pet", item.id)}" aria-label="Ver ${types[item.type]} em ${esc(item.city)}"></a></article>`;
  }
  function photoDiagnostic(phase, photo, error = null) {
    console.error("[BuscaPet][foto]", {
      phase, occurrenceId: photo?.occurrence_id || null, storagePath: photo?.storage_path || null,
      httpStatus: error?.status ?? null, code: error?.code ?? null,
      source: error?.source ?? "browser-image", blobType: error?.blobType ?? null,
      blobSize: error?.blobSize ?? null,
      cause: error?.message || String(error || "Imagem não pôde ser decodificada."),
    });
  }
  function alertPhotoPlaceholder(target, text) {
    target.innerHTML = `<span class="photo-placeholder">${icon("paw")}<small>${esc(text)}</small></span>`;
  }
  async function showAlertPhotos(rows, ticket) {
    if (!rows.length) return;
    let metadata;
    try { metadata = await D.listPublicCoverPhotos(rows.map((row) => row.id)); }
    catch (error) { photoDiagnostic("metadata", null, error); return; }
    const covers = new Map();
    for (const photo of metadata) if (!covers.has(photo.occurrence_id)) covers.set(photo.occurrence_id, photo);
    const targets = [...document.querySelectorAll("[data-alert-photo]")]
      .map((target) => ({ target, photo: covers.get(target.dataset.alertPhoto) }))
      .filter(({ photo }) => photo);
    const queue = [];
    let active = 0;
    const next = () => {
      while (active < 4 && queue.length) {
        const { target, photo } = queue.shift();
        active += 1;
        void (async () => {
          try {
            const blob = await D.downloadPhoto(photo.storage_path);
            if (!target.isConnected) return;
            const source = URL.createObjectURL(blob);
            const image = document.createElement("img");
            image.className = "alert-cover";
            image.alt = "Foto do alerta de animal";
            image.loading = "lazy";
            image.decoding = "async";
            image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
            image.addEventListener("error", () => {
              discardPhoto(source);
              photoDiagnostic("decode", photo, Error("O navegador não conseguiu decodificar a imagem."));
              if (target.isConnected) alertPhotoPlaceholder(target, "Foto indisponível");
            }, { once: true });
            if (!target.isConnected) { URL.revokeObjectURL(source); return; }
            photos.push(source);
            image.src = source;
            target.replaceChildren(image);
          } catch (error) {
            photoDiagnostic("download-or-decode", photo, error);
            if (target.isConnected) alertPhotoPlaceholder(target, "Foto indisponível");
          } finally {
            active -= 1;
            next();
          }
        })();
      }
    };
    const enqueue = (entry) => {
      if (entry.target.dataset.photoQueued) return;
      entry.target.dataset.photoQueued = "true";
      queue.push(entry);
      next();
    };
    if (!("IntersectionObserver" in window)) { targets.forEach(enqueue); return; }
    const targetRecords = new Map(targets.map((entry) => [entry.target, entry]));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        const record = targetRecords.get(entry.target);
        if (record) enqueue(record);
      }
    }, { rootMargin: "600px 0px" });
    targets.forEach((entry) => observer.observe(entry.target));
  }
  async function home(ticket) {
    const rows = await D.listPublicOccurrences();
    if (ticket !== generation) return;
    const term = filters.query.trim().toLocaleLowerCase("pt-BR");
    const shown = rows.filter((row) => (!filters.type || row.type === filters.type)
      && (!filters.status || row.status === filters.status)
      && (!term || [row.city, row.region, row.public_reference, row.description].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(term))));
    setPage(`<div class="page catalog-page"><div class="search-hero"><div class="hero-copy"><h1>Vamos trazer seu pet de volta.</h1><p>Reúna as pistas. Organize a busca.<br>Conte com quem está por perto.</p><div class="hero-actions"><a class="btn primary" href="#publicar/lost">${icon("paw")} Meu pet sumiu</a><a class="btn secondary" href="#publicar/found">Encontrei um pet</a></div></div><figure class="hero-pet"><img src="assets/hex.png" alt="Hex, cão ilustrativo do projeto"><figcaption>${icon("pin")}<span><b>Cada pista tem um lugar.</b><small>Imagem ilustrativa</small></span></figcaption></figure></div><div class="catalog-heading"><div><h2>Alertas da comunidade</h2><p>Consulte a região e registre uma pista se tiver uma conta.</p></div></div><div class="browse-layout"><aside class="browse-sidebar" aria-label="Busca e filtros"><label class="search">${icon("search")}<span class="sr-only">Buscar alertas</span><input id="real-query" value="${esc(filters.query)}" placeholder="Cidade, região ou descrição"></label><div class="filter-controls"><label>Tipo<select id="real-type"><option value="">Todos</option><option value="lost" ${filters.type === "lost" ? "selected" : ""}>Desaparecidos</option><option value="found" ${filters.type === "found" ? "selected" : ""}>Encontrados</option></select></label><label>Situação<select id="real-status"><option value="">Todas</option>${Object.entries(states).map(([v, label]) => `<option value="${v}" ${filters.status === v ? "selected" : ""}>${label}</option>`).join("")}</select></label></div></aside><div class="browse-results"><p id="real-result-count" role="status" aria-live="polite">${shown.length} ${shown.length === 1 ? "alerta encontrado" : "alertas encontrados"}</p><div class="list alert-grid" id="real-results">${shown.length ? shown.map(alertCard).join("") : empty("Nenhum alerta encontrado", "Altere os filtros ou publique o primeiro alerta.")}</div></div></div></div>`, "Alertas");
    document.querySelector("#real-query")?.setSelectionRange?.(filters.query.length, filters.query.length);
    void showAlertPhotos(shown, ticket);
  }
  async function detail(id, ticket) {
    if (!UUID.test(id)) return unavailable("Alerta indisponível");
    const row = await D.getOccurrence(id);
    if (ticket !== generation) return;
    if (!row) return unavailable("Alerta indisponível");
    const mine = row.reporter_id === user()?.id;
    const canReport = row.status === "active" && row.visibility === "public" && !mine;
    const nextStates = row.status === "active" ? ["located", "reunited", "closed"] : ["active"];
    const reportLink = canReport
      ? `<a class="btn secondary" href="${url("denunciar", id)}">${user() ? "Denunciar alerta" : "Entrar para denunciar"}</a>`
      : "";
    setPage(shell(types[row.type], `${row.city} · ${row.region}`, `<a class="back-link" href="#home">‹ Voltar aos alertas</a><div class="detail-layout"><div><div id="real-photo-gallery" class="detail-photo"><span class="photo-placeholder">${icon("paw")}<small>Sem foto</small></span></div></div><div><div class="fact-line"><span class="tag">${states[row.status]}</span><span class="tag">${row.visibility === "public" ? "Público" : "Privado"}</span></div><div class="detail"><div><span class="ico">${icon("pin")}</span><p><small>Local aproximado</small><b>${esc(row.region)} · ${esc(row.city)}</b><small>${esc(row.public_reference || "Sem referência adicional")}</small></p></div><div><span class="ico">${icon("calendar")}</span><p><small>Visto em</small><b>${fmtDate(row.last_seen_at, true)}</b></p></div></div><h2 class="section-heading">Descrição</h2><p class="desc">${esc(row.description)}</p><div class="actions"><a class="btn secondary" href="${url("mapa", id)}">${icon("map")}Ver no mapa</a>${canReport ? `<a class="btn primary" href="${url("avistamento", id)}">${user() ? "Registrar avistamento" : "Entrar para registrar avistamento"}</a>` : ""}${reportLink}${mine ? `<a class="btn secondary" href="${url("editar", id)}">Editar alerta</a><a class="btn secondary" href="${url("painel-tutor")}">Minha área</a>` : ""}</div>${mine && row.visibility !== "under_review" ? `<div class="actions" aria-label="Alterar situação do alerta">${nextStates.map((state) => `<button class="btn secondary small" data-action="status" data-id="${esc(id)}" data-status="${state}">Marcar: ${states[state]}</button>`).join("")}</div>` : ""}</div></div><section id="real-sightings" aria-label="Avistamentos autorizados"></section>`, false), "Detalhes do alerta");
    const mapState = document.createElement("section");
    mapState.className = "occurrence-map-state";
    mapState.innerHTML = '<h2 class="section-heading">Região no mapa</h2><p>Verificando região publicada…</p>';
    document.querySelector("#real-sightings")?.before(mapState);
    void D.getOccurrencePublicLocation(id).then((point) => {
      if (ticket !== generation || !mapState.isConnected) return;
      mapState.innerHTML = point
        ? `<h2 class="section-heading">Região no mapa</h2><p>Uma área aproximada de ${point.radius_m} m está marcada para este alerta.</p>`
        : `<h2 class="section-heading">Região no mapa</h2><p>Esta ocorrência ainda não possui uma região marcada no mapa.</p>${mine ? `<a class="btn secondary" href="${url("editar", id)}">Adicionar localização</a>` : ""}`;
    }).catch((error) => {
      if (ticket === generation && mapState.isConnected) mapState.innerHTML = `<h2 class="section-heading">Região no mapa</h2><p>Não foi possível consultar a região agora.</p>`;
      console.error("[BuscaPet][localização]", { code: error?.code, status: error?.status, cause: error?.message });
    });
    void showPhotos(id, ticket);
    if (mine) void showSightings(id, ticket);
  }
  async function reportOccurrencePage(id, ticket) {
    if (!UUID.test(id)) return unavailable("Alerta indisponível para denúncia");
    if (!window.BPPermissions?.can("createReport")) return adminDenied();
    const [occurrence, existing] = await Promise.all([
      D.getOccurrence(id), D.getMyActiveOccurrenceReport(id),
    ]);
    if (ticket !== generation) return;
    if (!occurrence || occurrence.visibility !== "public"
      || occurrence.status !== "active" || occurrence.reporter_id === user()?.id) {
      return unavailable("Este alerta não está disponível para denúncia");
    }
    const activeReport = existing && reportStatuses[existing.report_status]
      ? `<div class="notice" role="status"><strong>Você já enviou uma denúncia ativa</strong><p>Situação: ${esc(reportStatuses[existing.report_status])}. O envio repetido não cria outro protocolo.</p></div><a class="btn secondary" href="${url("pet", id)}">Voltar ao alerta</a>`
      : `<form class="form" id="real-occurrence-report-form" data-id="${esc(id)}">
          <label for="real-report-category">Motivo da denúncia *<select class="control" id="real-report-category" name="category" required><option value="">Selecione um motivo</option>${Object.entries(reportCategories).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label for="real-report-description">Descrição complementar *<textarea class="control" id="real-report-description" name="description" minlength="10" maxlength="1000" required aria-describedby="real-report-description-help" placeholder="Explique o que deve ser analisado."></textarea></label>
          <span class="hint" id="real-report-description-help">De 10 a 1.000 caracteres. Não inclua senhas, documentos, contatos ou outros dados pessoais desnecessários.</span>
          <p class="form-error" role="alert"></p>
          <p class="hint">A denúncia será analisada pela equipe. Ela não oculta o alerta automaticamente.</p>
          <button class="btn primary" type="submit">Enviar denúncia</button>
        </form>`;
    setPage(shell("Denunciar alerta", "Informe o que merece atenção. A denúncia será encaminhada à equipe de moderação.", `<a class="back-link" href="${url("pet", id)}">‹ Voltar ao alerta</a><section class="narrow report-form-page"><div class="notice"><strong>${esc(occurrence.city)} · ${esc(occurrence.region)}</strong><p>Protocolo do alerta: <code>${esc(id)}</code>. O autor da publicação não verá sua identidade.</p></div>${activeReport}</section>`, true), "Denunciar alerta");
  }
  async function showPhotos(id, ticket) {
    try {
      const rows = await D.listPhotos(id);
      if (ticket !== generation) return;
      const gallery = document.querySelector("#real-photo-gallery");
      if (!gallery || !rows.length) return;
      gallery.innerHTML = "";
      for (const row of rows) {
        const blob = await D.downloadPhoto(row.storage_path);
        if (ticket !== generation) return;
        const source = URL.createObjectURL(blob);
        photos.push(source);
        gallery.insertAdjacentHTML("beforeend", `<figure><img src="${source}" alt="Foto vinculada ao alerta" loading="lazy">${row.uploaded_by === user()?.id ? `<button class="btn secondary small" data-action="delete-photo" data-id="${esc(row.id)}">Excluir foto</button>` : ""}</figure>`);
      }
    } catch { /* Publicação sem foto legível mantém o texto do alerta. */ }
  }
  async function showSightings(id, ticket) {
    try {
      const rows = await D.listSightings(id);
      if (ticket !== generation) return;
      const target = document.querySelector("#real-sightings");
      if (!target) return;
      let proposed = [];
      try { proposed = await D.listSightingPublicLocations(rows.map((row) => row.id)); }
      catch (error) { console.error("[BuscaPet][avistamentos]", { code: error?.code, cause: error?.message }); }
      if (ticket !== generation) return;
      const locations = new Map(proposed.map((point) => [point.sighting_id, point]));
      target.innerHTML = `<h2 class="section-heading">Avistamentos recebidos (${rows.length})</h2>${rows.length ? `<div class="timeline">${rows.map((row) => {
        const point = locations.get(row.id);
        return `<article><b>${esc(row.area_description)}</b><p>${esc(row.description)}</p>${row.direction ? `<p>Direção informada: ${esc(row.direction)}</p>` : ""}<small>${fmtDate(row.observed_at, true)} · ${row.status === "pending" ? "Aguardando revisão" : row.status === "reviewed" ? "Revisado" : "Rejeitado"}</small>${point ? `<p class="hint">Região proposta para publicação: ${esc(point.public_description)}. ${point.approved_by_tutor ? "Divulgação autorizada." : "Ainda não divulgada."}</p>` : ""}<div class="actions">${row.status === "pending" ? `<button type="button" class="btn secondary small" data-action="review-sighting" data-id="${esc(row.id)}" data-status="reviewed">Marcar como revisado</button><button type="button" class="btn secondary small" data-action="review-sighting" data-id="${esc(row.id)}" data-status="rejected">Rejeitar relato</button>` : ""}${row.status === "reviewed" && point ? `<button type="button" class="btn secondary small" data-action="publish-sighting" data-id="${esc(row.id)}" data-approved="${!point.approved_by_tutor}">${point.approved_by_tutor ? "Retirar do mapa" : "Autorizar região no mapa"}</button>` : ""}</div></article>`;
      }).join("")}</div>` : '<p class="hint">Nenhum avistamento recebido.</p>'}`;
    } catch (error) { console.error("[BuscaPet][avistamentos]", { code: error?.code, cause: error?.message }); }
  }
  function authPage(heading, intro, form) {
    setPage(`<div class="auth-page"><section class="auth-form-panel"><a class="logo auth-logo" href="#home">${icon("paw")}<span class="wordmark">Busca<strong>Pet</strong></span></a><div class="auth-heading"><h1>${esc(heading)}</h1><p>${esc(intro)}</p></div>${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ""}${form}</section><aside class="auth-context"><img src="assets/hex.png" alt="Cão ilustrativo"><div><p class="eyebrow">BuscaPet</p><h2>Uma conta para acompanhar suas buscas.</h2><p>Organize alertas e receba pistas da comunidade.</p></div></aside></div>`, heading);
    notice = "";
  }
  const password = (name, label, autocomplete) => `<label>${label}<span class="password-control"><input class="control" type="password" name="${name}" autocomplete="${autocomplete}" required><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Mostrar ${label.toLowerCase()}">Mostrar</button></span></label>`;
  function login() {
    authPage("Entre no BuscaPet", "Use seu e-mail e senha.", `<form class="form auth-form" id="real-login"><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required></label>${password("password", "Senha", "current-password")}<p class="form-error" role="alert"></p><button class="btn primary" type="submit">Entrar</button><div class="auth-links"><a href="#esqueci-senha">Esqueci minha senha</a><a href="#registro">Criar conta</a></div></form>`);
  }
  function registration() {
    authPage("Crie sua conta", "Uma Conta BuscaPet permite publicar alertas, registrar avistamentos e cuidar dos seus animais.", `<form class="form auth-form" id="real-registration"><label>Nome completo<input class="control" name="name" autocomplete="name" minlength="2" maxlength="80" required></label><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required></label>${password("password", "Senha", "new-password")}<p class="hint">Use pelo menos 8 caracteres.</p>${password("passwordConfirmation", "Confirmação da senha", "new-password")}<label class="check-label"><input type="checkbox" name="acceptTerms" required><span>Li e aceito os <a href="#termos" target="_blank" rel="noopener">Termos de Uso</a>.</span></label><label class="check-label"><input type="checkbox" name="acceptPrivacy" required><span>Li a <a href="#privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Criar conta</button><p class="auth-footer">Já tem conta? <a href="#login">Entrar</a></p></form>`);
  }
  function forgot() {
    authPage("Recuperar senha", "Se houver uma conta para este e-mail, enviaremos instruções.", `<form class="form auth-form" id="real-forgot"><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required></label><p class="form-error" role="alert"></p><p class="form-success" role="status"></p><button class="btn primary" type="submit">Enviar instruções</button><a href="#login">Voltar ao login</a></form>`);
  }
  function reset() {
    if (!A.canResetPassword?.()) return authPage("Link indisponível", "Solicite um novo link de recuperação.", '<a class="btn primary" href="#esqueci-senha">Solicitar novo link</a>');
    authPage("Definir nova senha", "Escolha uma nova senha para sua conta.", `<form class="form auth-form" id="real-reset">${password("password", "Nova senha", "new-password")}${password("passwordConfirmation", "Confirmação", "new-password")}<p class="form-error" role="alert"></p><button class="btn primary" type="submit">Salvar nova senha</button></form>`);
  }
  function verifyEmail() {
    authPage("Confirme seu e-mail", "Abra a mensagem enviada pelo Supabase Auth e depois entre na conta.", `<p class="notice">Se não encontrar a mensagem, confira o spam e a configuração de e-mail do projeto.</p><div class="actions"><button class="btn secondary" data-action="resend-email">Reenviar confirmação</button><a class="btn primary" href="#login">Voltar ao login</a></div>`);
  }
  async function pets(ticket) {
    const rows = await D.listOwnPets();
    if (ticket !== generation) return;
    setPage(shell("Meus animais", "Cadastre e atualize os animais sob sua responsabilidade.", `<div class="actions"><a class="btn primary" href="#novo-animal">Cadastrar animal</a></div>${rows.length ? `<div class="alert-grid">${rows.map((row) => `<article class="pet"><div class="pet-body"><span class="tag">${species[row.species]}</span><h3>${esc(row.name)}</h3><p>${esc(row.breed || "Raça não informada")}</p><div class="actions"><a class="btn secondary small" href="${url("animal", row.id)}">Ver detalhes</a><a class="btn secondary small" href="${url("editar-animal", row.id)}">Editar</a></div></div></article>`).join("")}</div>` : empty("Nenhum animal cadastrado", "Comece pelo cadastro de um animal.")}`), "Meus animais");
  }
  async function showPetPhotos(petId, ticket, targetId) {
    const target = document.querySelector(`#${targetId}`);
    if (!target) return;
    try {
      const rows = await D.listPetPhotos(petId);
      if (ticket !== generation || !document.querySelector(`#${targetId}`)) return;
      target.dataset.count = String(rows.length);
      if (!rows.length) { target.innerHTML = '<p class="hint">Nenhuma fotografia cadastrada.</p>'; return; }
      target.innerHTML = "";
      for (const row of rows) {
        const blob = await D.downloadPhoto(row.storage_path);
        if (ticket !== generation) return;
        const source = URL.createObjectURL(blob);
        photos.push(source);
        target.insertAdjacentHTML("beforeend", `<figure><img src="${source}" alt="Foto privada de animal" loading="lazy">${row.is_cover ? '<figcaption>Foto de capa</figcaption>' : ""}<div class="actions"><button type="button" class="btn secondary small" data-action="set-pet-cover" data-id="${esc(row.id)}" ${row.is_cover ? "disabled" : ""}>Usar como capa</button><button type="button" class="btn danger small" data-action="delete-pet-photo" data-id="${esc(row.id)}">Excluir</button></div></figure>`);
      }
    } catch { target.innerHTML = '<p class="hint">Não foi possível carregar as fotos privadas.</p>'; }
  }
  async function petForm(id, ticket) {
    const row = id ? await D.getPet(id) : null;
    if (ticket !== generation) return;
    if (id && !row) return unavailable("Animal indisponível");
    setPage(shell(id ? "Editar animal" : "Cadastrar animal", "Dados visíveis somente para você nesta área.", `<form class="form form-page" id="real-pet-form" data-id="${esc(id || "")}"><div class="form-grid"><label>Nome ou identificação *<input class="control" name="name" value="${esc(row?.name || "")}" maxlength="80" required></label><label>Espécie *<select class="control" name="species" required>${Object.entries(species).map(([key, label]) => `<option value="${key}" ${row?.species === key ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Raça<input class="control" name="breed" value="${esc(row?.breed || "")}" maxlength="120"></label><label>Sexo<select class="control" name="sex"><option value="">Não informado</option><option value="female" ${row?.sex === "female" ? "selected" : ""}>Fêmea</option><option value="male" ${row?.sex === "male" ? "selected" : ""}>Macho</option><option value="unknown" ${row?.sex === "unknown" ? "selected" : ""}>Desconhecido</option></select></label><label>Porte<select class="control" name="size"><option value="">Não informado</option><option value="small" ${row?.size === "small" ? "selected" : ""}>Pequeno</option><option value="medium" ${row?.size === "medium" ? "selected" : ""}>Médio</option><option value="large" ${row?.size === "large" ? "selected" : ""}>Grande</option><option value="unknown" ${row?.size === "unknown" ? "selected" : ""}>Desconhecido</option></select></label><label>Pelagem<input class="control" name="coat_description" value="${esc(row?.coat_description || "")}" maxlength="500"></label><label class="full">Características marcantes<textarea class="control" name="distinctive_features" maxlength="500">${esc(row?.distinctive_features || "")}</textarea></label><label class="full">Fotografias<input class="control" id="pet-photo-input" type="file" name="pet_photos" accept="image/jpeg,image/png,image/webp" multiple><span class="hint">Foto de capa e até quatro fotos adicionais. JPEG, PNG ou WebP, até 5 MiB por arquivo.</span></label><div class="photo-preview-list full" id="pet-photo-preview" aria-live="polite"></div></div>${id ? '<section><h2 class="section-heading">Fotos cadastradas</h2><div class="photo-gallery" id="pet-photo-gallery" data-count="0" aria-live="polite"></div></section>' : ""}<p class="form-error" role="alert"></p><div class="actions"><button class="btn primary" type="submit">Salvar animal</button><a class="btn secondary" href="#meus-animais">Cancelar</a></div></form>`, true), id ? "Editar animal" : "Cadastrar animal");
    enableDraft(document.querySelector("#real-pet-form"), "pet", id || "new", ["name", "species", "breed", "sex", "size", "coat_description", "distinctive_features"], row?.updated_at);
    if (id) void showPetPhotos(id, ticket, "pet-photo-gallery");
  }
  async function petDetail(id, ticket) {
    const row = await D.getPet(id);
    if (ticket !== generation) return;
    if (!row) return unavailable("Animal indisponível");
    setPage(shell(row.name, "Cadastro privado do animal.", `<div class="photo-gallery" id="pet-photo-gallery" data-count="0" aria-live="polite"></div><dl class="account-details"><div><dt>Espécie</dt><dd>${species[row.species]}</dd></div><div><dt>Raça</dt><dd>${esc(row.breed || "Não informada")}</dd></div><div><dt>Pelagem</dt><dd>${esc(row.coat_description || "Não informada")}</dd></div><div><dt>Características</dt><dd>${esc(row.distinctive_features || "Não informadas")}</dd></div></dl><div class="actions"><a class="btn primary" href="${url("editar-animal", id)}">Editar</a><button class="btn danger" data-action="delete-pet" data-id="${esc(id)}">Excluir animal</button><a class="btn secondary" href="#meus-animais">Voltar</a></div>`, true), row.name);
    void showPetPhotos(id, ticket, "pet-photo-gallery");
  }
  async function occurrenceForm(id, type, ticket) {
    const [pets, row] = await Promise.all([D.listOwnPets(), id ? D.getOccurrence(id) : Promise.resolve(null)]);
    if (ticket !== generation) return;
    if (id && (!row || row.reporter_id !== user()?.id)) return unavailable("Alerta indisponível");
    const kind = row?.type || (type === "found" ? "found" : "lost");
    setPage(shell(id ? "Editar alerta" : types[kind], "Escolha um animal para reaproveitar os dados e as fotos autorizadas.", `<form class="form form-page" id="real-occurrence-form" data-id="${esc(id || "")}"><input type="hidden" name="type" value="${kind}"><div class="form-grid"><label>Animal vinculado<select class="control" name="pet_id" id="occurrence-pet"><option value="">Sem vínculo</option>${pets.map((pet) => `<option value="${esc(pet.id)}" ${pet.id === row?.pet_id ? "selected" : ""}>${esc(pet.name)}</option>`).join("")}</select></label><p class="hint" id="occurrence-pet-hint">O animal precisa pertencer à sua conta. <a href="#novo-animal">Cadastrar animal</a></p><label>Cidade *<input class="control" name="city" value="${esc(row?.city || "")}" maxlength="80" required></label><label>Bairro ou região *<input class="control" name="region" value="${esc(row?.region || "")}" maxlength="100" required></label><label>Referência pública aproximada<input class="control" name="public_reference" value="${esc(row?.public_reference || "")}" maxlength="200"></label><label>Data e hora *<input class="control" type="datetime-local" name="last_seen_at" value="${row?.last_seen_at ? esc(new Date(new Date(row.last_seen_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)) : nowLocal()}" max="${nowLocal()}" required></label><label>Recompensa opcional (R$)<input class="control" type="number" min="0" max="1000000" step="0.01" name="reward" value="${row ? (row.reward_cents / 100).toFixed(2) : ""}"></label><label class="full">Descrição *<textarea class="control" name="description" minlength="10" maxlength="2000" required>${esc(row?.description || "")}</textarea></label><label>Visibilidade<select class="control" name="visibility" ${id ? "disabled" : ""}><option value="public" ${row?.visibility !== "private" ? "selected" : ""}>Pública</option><option value="private" ${row?.visibility === "private" ? "selected" : ""}>Privada</option></select></label><label class="check-label full"><input type="checkbox" name="reuse_pet_photos"><span>Adicionar fotos cadastradas do meu animal a este alerta.</span></label><p class="hint full">A confirmação associa até cinco fotos do animal a este alerta. Elas só aparecem no feed se o alerta for público.</p><label class="full">Foto adicional opcional<input class="control" type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span class="hint">JPEG, PNG ou WebP, até 5 MiB. A foto é reprocessada para remover metadados antes do envio.</span></label></div><label class="check-label"><input type="checkbox" name="rights" required><span>Confirmo que posso usar as informações e a foto.</span></label><p class="form-error" role="alert"></p><div class="actions"><button class="btn primary" type="submit">${id ? "Salvar alterações" : "Publicar alerta"}</button><a class="btn secondary" href="${id ? url("pet", id) : "#home"}">Cancelar</a></div></form>`, true), id ? "Editar alerta" : types[kind]);
    const grid = document.querySelector("#real-occurrence-form .form-grid");
    if (kind === "lost" && grid) {
      grid.insertAdjacentHTML("beforeend", pointPickerMarkup("occurrence"));
      let initial = null;
      if (id) {
        try { initial = await D.getOccurrencePublicLocation(id); }
        catch (error) { console.error("[BuscaPet][localização]", { code: error?.code, cause: error?.message }); }
      }
      if (ticket !== generation) return;
      mountPointPicker("occurrence", initial);
      if (initial) {
        grid.querySelector('[name="location_description"]').value = initial.public_description || "";
        grid.querySelector('[name="location_consent"]').checked = true;
      }
    }
    const occurrenceDraft = enableDraft(document.querySelector("#real-occurrence-form"), `occurrence-${kind}`, id || "new", ["pet_id", "city", "region", "public_reference", "last_seen_at", "reward", "description", "type", "visibility", "reuse_pet_photos", "location_description"], row?.updated_at);
    if (occurrenceDraft.restored && kind === "lost") {
      const status = document.querySelector("#real-occurrence-form .draft-status");
      if (status) status.textContent += " Selecione novamente a região no mapa para continuar.";
    }
  }
  async function dashboard(ticket) {
    const [pets, occurrences] = await Promise.all([D.listOwnPets(), D.listOwnOccurrences()]);
    if (ticket !== generation) return;
    const active = occurrences.filter((row) => row.status === "active").length;
    setPage(shell("Minha área", "Gerencie seus animais, alertas e acompanhamentos.", `<div class="actions"><a class="btn primary" href="#novo-animal">Cadastrar animal</a><a class="btn secondary" href="#publicar/lost">Animal desaparecido</a><a class="btn secondary" href="#publicar/found">Animal encontrado</a><a class="btn secondary" href="#meus-animais">Meus animais</a></div><div class="dashboard-summary"><div><b>${pets.length}</b><span>Meus animais</span></div><div><b>${occurrences.length}</b><span>Meus alertas</span></div><div><b>${active}</b><span>Buscas ativas</span></div></div><h2 class="section-heading">Meus alertas</h2>${occurrences.length ? `<div class="alert-grid">${occurrences.map(alertCard).join("")}</div>` : empty("Nenhum alerta", "Publique um alerta para começar.")}`), "Minha área");
  }
  function metric(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString("pt-BR") : "—";
  }
  function adminMetric(iconName, value, label, detail = "") {
    return `<article class="admin-metric"><span class="admin-metric-icon">${icon(iconName)}</span><div><b>${metric(value)}</b><h3>${esc(label)}</h3>${detail ? `<p>${esc(detail)}</p>` : ""}</div></article>`;
  }
  const adminRoleLabels = Object.freeze({ tutor: "Tutor", colaborador: "Colaborador", parceiro: "Parceiro", moderador: "Moderador", administrador: "Administrador" });
  function adminNavigation(active) {
    const links = [
      ...(window.BPPermissions?.can("viewAdminDashboard") ? [
        ["overview", "#admin", "Visão geral", "home"],
        ["users", "#admin/usuarios", "Usuários", "user"],
      ] : []),
      ...(window.BPPermissions?.can("moderate") ? [
        ["moderation", "#admin/moderacao", "Central de moderação", "shield"],
        ["occurrences", "#admin/ocorrencias", "Ocorrências", "search"],
        ["reports", "#admin/denuncias", "Denúncias", "shield"],
      ] : []),
    ];
    return `<nav class="admin-nav" aria-label="Navegação administrativa">${links.map(([key, href, label, glyph]) => `<a class="${active === key ? "active" : ""}" href="${href}" ${active === key ? 'aria-current="page"' : ""}>${icon(glyph)}${label}</a>`).join("")}</nav>`;
  }
  function adminFrame(active, content) {
    return `<main class="admin-area" aria-label="Painel administrativo"><header class="admin-header"><div><span class="admin-eyebrow">Área administrativa</span><h1>Painel administrativo</h1><p>Consultas administrativas com acesso verificado no banco.</p></div><div class="admin-header-actions"><a class="btn secondary" href="#painel-tutor">${icon("home")}Área comum</a><button class="btn plain" type="button" data-action="logout">Sair</button></div></header><div class="admin-layout">${adminNavigation(active)}${content}</div></main>`;
  }
  function adminRoles(roles) {
    const list = Array.isArray(roles) ? roles : [];
    return list.length ? `<ul class="admin-roles" aria-label="Papéis">${list.map((role) => `<li>${esc(adminRoleLabels[role] || role)}</li>`).join("")}</ul>` : '<span class="hint">Não informado</span>';
  }
  function adminStatus(status) {
    const active = status === "active";
    return `<span class="admin-status ${active ? "active" : "suspended"}"><span aria-hidden="true"></span>${active ? "Ativa" : "Suspensa"}</span>`;
  }
  function adminAuditAction(action) {
    return action === "account_suspended" ? "Conta suspensa" : "Conta reativada";
  }
  function adminAccountStatusAction(account) {
    if (account.account_id === user()?.id)
      return '<section class="admin-account-action" aria-labelledby="admin-account-action-title"><h3 id="admin-account-action-title">Situação da conta</h3><p>Você não pode alterar a situação da sua própria conta.</p></section>';
    const suspended = account.status === "suspended";
    const action = suspended ? "active" : "suspended";
    return `<section class="admin-account-action" aria-labelledby="admin-account-action-title"><h3 id="admin-account-action-title">${suspended ? "Reativar conta" : "Suspender conta"}</h3><p>${suspended ? "Restaura o acesso da conta às operações protegidas." : "Interrompe o acesso da conta às operações protegidas, sem remover seus dados."}</p><button class="btn ${suspended ? "primary" : "danger"}" type="button" data-action="admin-account-status" data-id="${esc(account.account_id)}" data-name="${esc(account.display_name || "Conta")}" data-status="${action}">${suspended ? "Reativar conta" : "Suspender conta"}</button></section>`;
  }
  function adminAccountAudit(history) {
    const entries = history?.entries || [];
    if (!entries.length)
      return '<section class="admin-account-audit" aria-labelledby="admin-account-audit-title"><h3 id="admin-account-audit-title">Histórico administrativo</h3><p class="hint">Nenhuma suspensão ou reativação registrada para esta conta.</p></section>';
    return `<section class="admin-account-audit" aria-labelledby="admin-account-audit-title"><h3 id="admin-account-audit-title">Histórico administrativo</h3><ol class="admin-audit-list">${entries.map((entry) => `<li><strong>${esc(adminAuditAction(entry.action))}</strong><span>${esc(fmtDate(entry.created_at, true))} · ${esc(entry.actor_name || "Administrador indisponível")}</span>${entry.reason ? `<p><span class="sr-only">Motivo: </span>${esc(entry.reason)}</p>` : ""}</li>`).join("")}</ol></section>`;
  }
  function adminDirectoryFailure(error, section = "list") {
    const description = section === "detail" ? "os detalhes desta conta" : "a consulta de contas";
    let title = "Não foi possível carregar";
    let body = `Não foi possível carregar ${description}. Tente novamente.`;
    if (error?.code === "NOT_PUBLISHED") {
      title = "Funcionalidade ainda não publicada";
      body = "A consulta de usuários está disponível no ambiente local, mas a migration necessária ainda não foi publicada neste ambiente. Nenhum dado foi simulado.";
    } else if (error?.code === "DENIED" || error?.code === "AUTH_REQUIRED") {
      title = "Acesso negado";
      body = "Sua conta não está autorizada a consultar usuários administrativos.";
    } else if (error?.code === "NOT_FOUND" && section === "detail") {
      title = "Conta não encontrada";
      body = "A conta solicitada não existe ou não está disponível para consulta.";
    }
    return `<div class="notice"><strong>${esc(title)}</strong><p>${esc(body)}</p></div>${section === "detail" ? '<p><a class="btn secondary" href="#admin/usuarios">Voltar para usuários</a></p>' : '<p><button class="btn secondary" type="button" data-action="admin-retry">Tentar novamente</button></p>'}`;
  }
  function adminUsersMarkup() {
    const controls = `<form class="admin-user-controls" id="admin-user-controls" aria-label="Filtros de usuários"><label class="admin-user-search" for="admin-user-query">Buscar por nome, e-mail ou identificador<input class="control" id="admin-user-query" type="search" maxlength="120" autocomplete="off" value="${esc(adminDirectory.query)}" placeholder="Ex.: ana@exemplo.com"></label><label for="admin-user-status">Situação<select class="control" id="admin-user-status"><option value="" ${adminDirectory.status ? "" : "selected"}>Todas</option><option value="active" ${adminDirectory.status === "active" ? "selected" : ""}>Ativas</option><option value="suspended" ${adminDirectory.status === "suspended" ? "selected" : ""}>Suspensas</option></select></label><label for="admin-user-role">Papel<select class="control" id="admin-user-role"><option value="" ${adminDirectory.role ? "" : "selected"}>Todos os papéis</option>${Object.entries(adminRoleLabels).map(([role, label]) => `<option value="${role}" ${adminDirectory.role === role ? "selected" : ""}>${label}</option>`).join("")}</select></label><label for="admin-user-order">Ordenação<select class="control" id="admin-user-order"><option value="newest" ${adminDirectory.order === "newest" ? "selected" : ""}>Mais recentes</option><option value="oldest" ${adminDirectory.order === "oldest" ? "selected" : ""}>Mais antigos</option><option value="name" ${adminDirectory.order === "name" ? "selected" : ""}>Nome</option></select></label></form>`;
    return adminFrame("users", `<section class="admin-content" aria-labelledby="admin-users-title"><div class="admin-content-heading"><h2 id="admin-users-title">Gestão de usuários</h2><p>Consulte as contas cadastradas, seus perfis e a situação de acesso ao BuscaPet.</p></div>${controls}<p id="admin-user-results-status" class="hint" role="status" aria-live="polite">Carregando usuários…</p><div id="admin-user-results" aria-live="polite" aria-busy="true"></div></section>`);
  }
  function adminUsersTable(result) {
    const rows = result.users || [];
    const filtered = Boolean(adminDirectory.query || adminDirectory.status || adminDirectory.role);
    if (!rows.length) return `<div class="notice"><strong>${filtered ? "Nenhum resultado encontrado" : "Nenhuma conta cadastrada"}</strong><p>${filtered ? "Ajuste a busca ou os filtros para consultar outras contas." : "As contas autorizadas aparecerão aqui quando existirem."}</p></div>`;
    const start = (adminDirectory.page - 1) * adminDirectory.pageSize + 1;
    const end = start + rows.length - 1;
    const pages = Math.max(1, Math.ceil(result.total / adminDirectory.pageSize));
    return `<div class="admin-user-table-wrap" tabindex="0"><table class="admin-user-table"><caption class="sr-only">Contas cadastradas</caption><thead><tr><th scope="col">Conta</th><th scope="col">Papéis</th><th scope="col">Situação</th><th scope="col">Cadastro</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows.map((account) => `<tr><td data-label="Conta"><strong>${esc(account.display_name || "Não informado")}</strong><span>${esc(account.email || "Não informado")}</span></td><td data-label="Papéis">${adminRoles(account.roles)}</td><td data-label="Situação">${adminStatus(account.status)}</td><td data-label="Cadastro">${esc(fmtDate(account.created_at, true))}</td><td data-label="Ações"><a class="btn secondary small" href="#admin/usuarios/${encodeURIComponent(account.account_id)}">Ver detalhes</a></td></tr>`).join("")}</tbody></table></div><nav class="admin-pagination" aria-label="Paginação de usuários"><span>${start}–${end} de ${metric(result.total)}</span><div><button class="btn secondary small" type="button" data-action="admin-page" data-page="${adminDirectory.page - 1}" ${adminDirectory.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${adminDirectory.page} de ${pages}</span><button class="btn secondary small" type="button" data-action="admin-page" data-page="${adminDirectory.page + 1}" ${adminDirectory.page >= pages ? "disabled" : ""}>Próxima</button></div></nav>`;
  }
  async function loadAdminUsers(ticket = generation) {
    const request = ++adminDirectory.request;
    const resultTarget = document.querySelector("#admin-user-results");
    const statusTarget = document.querySelector("#admin-user-results-status");
    if (resultTarget) resultTarget.setAttribute("aria-busy", "true");
    if (statusTarget) statusTarget.textContent = "Carregando usuários…";
    try {
      const result = await D.listAdminUsers(adminDirectory);
      if (ticket !== generation || request !== adminDirectory.request || routeInfo().id !== "usuarios") return;
      if (resultTarget) { resultTarget.innerHTML = adminUsersTable(result); resultTarget.removeAttribute("aria-busy"); }
      if (statusTarget) statusTarget.textContent = `${metric(result.total)} ${result.total === 1 ? "conta encontrada" : "contas encontradas"}.`;
    } catch (error) {
      if (ticket !== generation || request !== adminDirectory.request || routeInfo().id !== "usuarios") return;
      if (resultTarget) { resultTarget.innerHTML = adminDirectoryFailure(error); resultTarget.removeAttribute("aria-busy"); }
      if (statusTarget) statusTarget.textContent = "Consulta indisponível.";
    }
  }
  async function adminUsers(ticket) {
    if (!window.BPPermissions?.can("viewAdminDashboard")) return adminDenied();
    setPage(adminUsersMarkup(), "Gestão de usuários");
    await loadAdminUsers(ticket);
  }
  async function adminUserDetails(id, ticket) {
    if (!window.BPPermissions?.can("viewAdminDashboard")) return adminDenied();
    if (!UUID.test(id)) {
      setPage(adminFrame("users", `<section class="admin-content" aria-labelledby="admin-user-detail-title"><div class="admin-content-heading"><h2 id="admin-user-detail-title">Gestão de usuários</h2></div>${adminDirectoryFailure({ code: "NOT_FOUND" }, "detail")}</section>`), "Conta não encontrada");
      return;
    }
    try {
      const [account, history] = await Promise.all([
        D.getAdminUser(id),
        D.listAdminAccountStatusAudit(id, { page: 1, pageSize: 20 }),
      ]);
      if (ticket !== generation) return;
      setPage(adminFrame("users", `<section class="admin-content" aria-labelledby="admin-user-detail-title"><p><a class="back-link" href="#admin/usuarios">‹ Voltar para usuários</a></p><div class="admin-content-heading"><h2 id="admin-user-detail-title">${esc(account.display_name || "Conta")}</h2><p>Consulte dados administrativos essenciais e gerencie somente a situação de acesso da conta.</p></div><dl class="admin-user-details"><div><dt>Nome de exibição</dt><dd>${esc(account.display_name || "Não informado")}</dd></div><div><dt>E-mail</dt><dd>${esc(account.email || "Não informado")}</dd></div><div><dt>Identificador da conta</dt><dd><code>${esc(account.account_id)}</code></dd></div><div><dt>Data de criação</dt><dd>${esc(fmtDate(account.created_at, true))}</dd></div><div><dt>Situação</dt><dd>${adminStatus(account.status)}</dd></div><div><dt>Papel ativo</dt><dd>${esc(adminRoleLabels[account.active_role] || account.active_role || "Não informado")}</dd></div><div class="full"><dt>Todos os papéis</dt><dd>${adminRoles(account.roles)}</dd></div></dl>${adminAccountStatusAction(account)}${adminAccountAudit(history)}</section>`), "Detalhes da conta");
    } catch (error) {
      if (ticket === generation) setPage(adminFrame("users", `<section class="admin-content" aria-labelledby="admin-user-detail-title"><div class="admin-content-heading"><h2 id="admin-user-detail-title">Gestão de usuários</h2></div>${adminDirectoryFailure(error, "detail")}</section>`), "Gestão de usuários");
    }
  }
  const moderationStatus = Object.freeze({ active: "Em busca", located: "Localizado", reunited: "Reunido", closed: "Encerrado" });
  const moderationVisibility = Object.freeze({ public: "Visível", under_review: "Oculto para análise" });
  function adminOccurrenceFailure(error, section = "list") {
    const title = error?.code === "NOT_PUBLISHED" ? "Funcionalidade ainda não publicada"
      : error?.code === "DENIED" || error?.code === "AUTH_REQUIRED" ? "Acesso negado"
        : error?.code === "NOT_FOUND" && section === "detail" ? "Ocorrência não encontrada"
          : "Não foi possível carregar";
    const body = error?.code === "NOT_PUBLISHED"
      ? "A fila de moderação ainda não está disponível neste ambiente. Nenhum dado foi simulado."
      : error?.code === "DENIED" || error?.code === "AUTH_REQUIRED"
        ? "Sua conta não está autorizada a consultar ocorrências de moderação."
        : error?.code === "NOT_FOUND" && section === "detail"
          ? "A ocorrência não existe ou não está disponível para esta análise."
          : "Não foi possível concluir a consulta. Tente novamente.";
    const retry = section === "detail" ? "admin-occurrence-retry-detail" : "admin-occurrence-retry";
    return `<div class="notice"><strong>${title}</strong><p>${body}</p><button class="btn secondary small" type="button" data-action="${retry}">Tentar novamente</button></div>`;
  }
  function adminOccurrencesMarkup() {
    const controls = `<form class="admin-occurrence-controls" id="admin-occurrence-controls" aria-label="Filtros de ocorrências">
      <label class="admin-occurrence-search" for="admin-occurrence-query">Buscar por protocolo, animal ou informação pública<input class="control" id="admin-occurrence-query" type="search" maxlength="120" autocomplete="off" value="${esc(adminOccurrences.query)}" placeholder="Nome do animal ou identificador"></label>
      <label for="admin-occurrence-type">Tipo<select class="control" id="admin-occurrence-type"><option value="">Todos</option><option value="lost" ${adminOccurrences.type === "lost" ? "selected" : ""}>Desaparecido</option><option value="found" ${adminOccurrences.type === "found" ? "selected" : ""}>Encontrado</option></select></label>
      <label for="admin-occurrence-status">Situação<select class="control" id="admin-occurrence-status"><option value="">Todas</option>${Object.entries(moderationStatus).map(([key, label]) => `<option value="${key}" ${adminOccurrences.status === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label for="admin-occurrence-visibility">Visibilidade<select class="control" id="admin-occurrence-visibility"><option value="">Todas</option>${Object.entries(moderationVisibility).map(([key, label]) => `<option value="${key}" ${adminOccurrences.visibility === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label for="admin-occurrence-from">Criada a partir de<input class="control" id="admin-occurrence-from" type="date" value="${esc(adminOccurrences.createdFrom)}"></label>
      <label for="admin-occurrence-to">Criada até<input class="control" id="admin-occurrence-to" type="date" value="${esc(adminOccurrences.createdTo)}"></label>
    </form>`;
    return adminFrame("occurrences", `<section class="admin-content" aria-labelledby="admin-occurrences-title"><div class="admin-content-heading"><h2 id="admin-occurrences-title">Moderação de ocorrências</h2><p>Consulte publicações visíveis e ocultas para análise. A fila não inclui registros privados nem localizações exatas.</p></div>${controls}<p id="admin-occurrence-results-status" class="hint" role="status" aria-live="polite">Carregando ocorrências…</p><div id="admin-occurrence-results" aria-live="polite" aria-busy="true"></div></section>`);
  }
  function adminOccurrenceListMarkup(result) {
    const rows = result.occurrences || [];
    if (!rows.length) return `<div class="notice"><strong>${adminOccurrences.query || adminOccurrences.type || adminOccurrences.status || adminOccurrences.visibility || adminOccurrences.createdFrom || adminOccurrences.createdTo ? "Nenhuma ocorrência encontrada" : "Fila vazia"}</strong><p>Não há publicações disponíveis para os filtros selecionados.</p></div>`;
    const start = (adminOccurrences.page - 1) * adminOccurrences.pageSize + 1;
    const end = start + rows.length - 1;
    const pages = Math.max(1, Math.ceil(result.total / adminOccurrences.pageSize));
    return `<div class="admin-occurrence-list">${rows.map((row) => `<article class="admin-occurrence-card"><div class="admin-occurrence-cover" data-admin-occurrence-photo="${esc(row.occurrence_id)}"><span class="photo-placeholder">${icon("paw")}<small>Sem foto de capa</small></span></div><div class="admin-occurrence-copy"><div class="admin-occurrence-meta"><span class="admin-tag ${row.occurrence_type === "lost" ? "lost" : "found"}">${row.occurrence_type === "lost" ? "Desaparecido" : "Encontrado"}</span><span class="admin-status ${row.occurrence_visibility === "public" ? "active" : "suspended"}">${moderationVisibility[row.occurrence_visibility] || esc(row.occurrence_visibility)}</span></div><h3>${esc(row.pet_name || "Animal sem vínculo")} <span>· ${esc(moderationStatus[row.occurrence_status] || row.occurrence_status)}</span></h3><p>${esc(row.city)} · ${esc(row.region)}${row.public_reference ? ` · ${esc(row.public_reference)}` : ""}</p><p class="admin-occurrence-description">${esc(row.description)}</p><small>Criada ${esc(fmtDate(row.created_at, true))} · Protocolo <code>${esc(row.occurrence_id)}</code></small><a class="btn secondary small" href="#admin/ocorrencias/${encodeURIComponent(row.occurrence_id)}">Analisar ocorrência</a></div></article>`).join("")}</div><nav class="admin-pagination" aria-label="Paginação de ocorrências"><span>${start}–${end} de ${metric(result.total)}</span><div><button class="btn secondary small" type="button" data-action="admin-occurrence-page" data-page="${adminOccurrences.page - 1}" ${adminOccurrences.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${adminOccurrences.page} de ${pages}</span><button class="btn secondary small" type="button" data-action="admin-occurrence-page" data-page="${adminOccurrences.page + 1}" ${adminOccurrences.page >= pages ? "disabled" : ""}>Próxima</button></div></nav>`;
  }
  async function showAdminOccurrenceCovers(rows, ticket) {
    const entries = rows.filter((row) => row.cover_photo_path);
    await Promise.all(entries.map(async (row) => {
      const target = document.querySelector(`[data-admin-occurrence-photo="${CSS.escape(row.occurrence_id)}"]`);
      if (!target) return;
      try {
        const blob = await D.downloadPhoto(row.cover_photo_path);
        if (ticket !== generation || !target.isConnected) return;
        const source = URL.createObjectURL(blob);
        photos.push(source);
        const image = document.createElement("img");
        image.src = source;
        image.alt = `Foto de capa de ${row.pet_name || "animal da ocorrência"}`;
        image.loading = "lazy";
        target.replaceChildren(image);
      } catch { if (ticket === generation && target.isConnected) target.innerHTML = '<span class="photo-placeholder">Foto indisponível</span>'; }
    }));
  }
  async function loadAdminOccurrences(ticket = generation) {
    const request = ++adminOccurrences.request;
    const results = document.querySelector("#admin-occurrence-results");
    const status = document.querySelector("#admin-occurrence-results-status");
    if (results) results.setAttribute("aria-busy", "true");
    if (status) status.textContent = "Carregando ocorrências…";
    try {
      const result = await D.listAdminOccurrences(adminOccurrences);
      if (ticket !== generation || request !== adminOccurrences.request || routeInfo().id !== "ocorrencias") return;
      if (results) { results.innerHTML = adminOccurrenceListMarkup(result); results.removeAttribute("aria-busy"); }
      if (status) status.textContent = `${metric(result.total)} ${result.total === 1 ? "ocorrência disponível" : "ocorrências disponíveis"}.`;
      await showAdminOccurrenceCovers(result.occurrences || [], ticket);
    } catch (error) {
      if (ticket !== generation || request !== adminOccurrences.request || routeInfo().id !== "ocorrencias") return;
      if (results) { results.innerHTML = adminOccurrenceFailure(error); results.removeAttribute("aria-busy"); }
      if (status) status.textContent = "Consulta indisponível.";
    }
  }
  async function adminOccurrencesPage(ticket) {
    if (!window.BPPermissions?.can("moderate")) return adminDenied();
    setPage(adminOccurrencesMarkup(), "Moderação de ocorrências");
    await loadAdminOccurrences(ticket);
  }
  function adminOccurrenceAuditMarkup(history) {
    const entries = history?.entries || [];
    return `<section class="admin-account-audit" aria-labelledby="admin-occurrence-audit-title"><h3 id="admin-occurrence-audit-title">Histórico de moderação</h3>${entries.length ? `<ol class="admin-audit-list">${entries.map((entry) => `<li><strong>${entry.action === "occurrence_hidden" ? "Ocorrência ocultada" : "Publicação restaurada"}</strong><span>${esc(fmtDate(entry.created_at, true))} · ${esc(entry.actor_name || "Moderador indisponível")}</span>${entry.reason ? `<p><span class="sr-only">Justificativa: </span>${esc(entry.reason)}</p>` : '<p class="hint">Decisão registrada antes da exigência de justificativa.</p>'}</li>`).join("")}</ol>` : '<p class="hint">Nenhuma decisão de moderação registrada.</p>'}</section>`;
  }
  async function adminOccurrenceDetails(id, ticket) {
    if (!window.BPPermissions?.can("moderate")) return adminDenied();
    const backHref = routeInfo().source === "moderacao" ? "#admin/moderacao" : "#admin/ocorrencias";
    if (!UUID.test(id)) {
      setPage(adminFrame("occurrences", `<section class="admin-content">${adminOccurrenceFailure({ code: "NOT_FOUND" }, "detail")}<p><a class="btn secondary" href="${backHref}">Voltar à fila</a></p></section>`), "Ocorrência não encontrada");
      return;
    }
    try {
      const [row, history] = await Promise.all([
        D.getAdminOccurrence(id), D.listAdminOccurrenceAudit(id, { page: 1, pageSize: 20 }),
      ]);
      if (ticket !== generation) return;
      const photosMarkup = (row.photos || []).map((photo) => `<figure data-admin-review-photo="${esc(photo.id)}"><span class="photo-placeholder">Carregando fotografia…</span><figcaption>${esc(photo.mime_type)} · ${metric(Math.ceil(photo.byte_size / 1024))} KiB</figcaption></figure>`).join("");
      const nextAction = row.visibility === "public" ? "hide" : "restore";
      const actionLabel = nextAction === "hide" ? "Ocultar publicação" : "Restaurar visibilidade pública";
      const actionNote = nextAction === "hide"
        ? "A publicação e suas fotos deixarão de aparecer no feed. O status de busca ou reencontro não será alterado."
        : "A publicação voltará a aparecer no feed. O status de busca ou reencontro não será alterado.";
      setPage(adminFrame("occurrences", `<section class="admin-content admin-occurrence-detail"><p><a class="back-link" href="${backHref}">‹ Voltar à fila</a></p><div class="admin-content-heading"><div class="admin-occurrence-meta"><span class="admin-tag ${row.occurrence_type === "lost" ? "lost" : "found"}">${row.occurrence_type === "lost" ? "Desaparecido" : "Encontrado"}</span><span class="admin-status ${row.visibility === "public" ? "active" : "suspended"}">${moderationVisibility[row.visibility] || esc(row.visibility)}</span></div><h2 id="admin-occurrence-title">${esc(row.pet_name || "Animal sem vínculo")} · ${esc(moderationStatus[row.occurrence_status] || row.occurrence_status)}</h2><p>Protocolo <code>${esc(row.occurrence_id)}</code> · Criada ${esc(fmtDate(row.created_at, true))}</p></div><dl class="admin-user-details"><div><dt>Animal</dt><dd>${esc(row.pet_name || "Sem vínculo")} · ${esc(species[row.pet_species] || "Espécie não informada")}</dd></div><div><dt>Data do último registro</dt><dd>${esc(fmtDate(row.last_seen_at, true))}</dd></div><div><dt>Região pública aproximada</dt><dd>${esc(row.city)} · ${esc(row.region)}${row.public_reference ? ` · ${esc(row.public_reference)}` : ""}</dd></div><div><dt>Visibilidade / situação</dt><dd>${moderationVisibility[row.visibility] || esc(row.visibility)} · ${moderationStatus[row.occurrence_status] || esc(row.occurrence_status)}</dd></div><div class="full"><dt>Descrição</dt><dd>${esc(row.description)}</dd></div>${row.pet_breed || row.pet_coat_description || row.pet_distinctive_features ? `<div class="full"><dt>Características informadas do animal</dt><dd>${[row.pet_breed, row.pet_coat_description, row.pet_distinctive_features].filter(Boolean).map(esc).join(" · ")}</dd></div>` : ""}</dl><section class="admin-account-audit" aria-labelledby="admin-occurrence-photos-title"><h3 id="admin-occurrence-photos-title">Fotografias vinculadas</h3><div class="admin-occurrence-photos">${photosMarkup || '<p class="hint">Nenhuma foto vinculada a esta ocorrência.</p>'}</div></section><section class="admin-account-action" aria-labelledby="admin-occurrence-decision-title"><h3 id="admin-occurrence-decision-title">Registrar decisão</h3><p>${actionNote}</p><form id="admin-occurrence-moderation-form" data-id="${esc(row.occurrence_id)}" data-action-name="${nextAction}"><label for="admin-occurrence-reason">Justificativa obrigatória<textarea class="control" id="admin-occurrence-reason" name="reason" minlength="10" maxlength="500" required aria-describedby="admin-occurrence-reason-help"></textarea></label><span class="hint" id="admin-occurrence-reason-help">Informe de 10 a 500 caracteres. A decisão será registrada no histórico.</span><p class="form-error" role="alert"></p><button class="btn ${nextAction === "hide" ? "danger" : "primary"}" type="submit">${actionLabel}</button></form></section>${adminOccurrenceAuditMarkup(history)}<p><a class="btn secondary" href="${backHref}">Voltar à fila</a></p></section>`), "Análise de ocorrência");
      await Promise.all((row.photos || []).map(async (photo) => {
        const target = document.querySelector(`[data-admin-review-photo="${CSS.escape(photo.id)}"]`);
        if (!target) return;
        try {
          const blob = await D.downloadPhoto(photo.storage_path);
          if (ticket !== generation || !target.isConnected) return;
          const source = URL.createObjectURL(blob);
          photos.push(source);
          const image = document.createElement("img");
          image.src = source;
          image.alt = `Fotografia vinculada à ocorrência ${row.occurrence_id}`;
          image.loading = "lazy";
          target.querySelector(".photo-placeholder")?.remove();
          target.prepend(image);
        } catch { const placeholder = target.querySelector(".photo-placeholder"); if (placeholder) placeholder.textContent = "Foto indisponível"; }
      }));
    } catch (error) {
      if (ticket === generation) setPage(adminFrame("occurrences", `<section class="admin-content">${adminOccurrenceFailure(error, "detail")}<p><a class="btn secondary" href="${backHref}">Voltar à fila</a></p></section>`), "Análise de ocorrência");
    }
  }
  function adminReportFailure(error, detail = false) {
    const title = error?.code === "NOT_PUBLISHED" ? "Denúncias ainda não publicadas"
      : error?.code === "DENIED" || error?.code === "AUTH_REQUIRED" ? "Acesso negado"
        : error?.code === "NOT_FOUND" && detail ? "Denúncia indisponível" : "Consulta indisponível";
    const body = error?.code === "NOT_PUBLISHED"
      ? "O sistema de denúncias está disponível neste ambiente após aplicar a migration correspondente. Nenhum dado foi simulado."
      : error?.code === "DENIED" || error?.code === "AUTH_REQUIRED"
        ? "Sua conta não está autorizada a consultar denúncias administrativas."
        : error?.code === "NOT_FOUND" && detail
          ? "A denúncia não existe ou não está disponível para esta análise."
          : "Não foi possível consultar as denúncias agora. Tente novamente.";
    const action = detail ? "admin-report-retry-detail" : "admin-report-retry";
    return `<div class="notice"><strong>${esc(title)}</strong><p>${esc(body)}</p><button class="btn secondary small" type="button" data-action="${action}">Tentar novamente</button></div>`;
  }
  function adminReportCountsMarkup(counts) {
    return `<div class="admin-metrics admin-report-metrics">${adminMetric("search", counts.open_count, "Denúncias abertas")}${adminMetric("calendar", counts.in_review_count, "Em análise")}${adminMetric("heart", counts.resolved_count, "Resolvidas")}${adminMetric("user", counts.dismissed_count, "Descartadas")}</div>`;
  }
  function adminReportsMarkup() {
    const controls = `<form class="admin-report-controls" id="admin-report-controls" aria-label="Filtros de denúncias">
      <label class="admin-report-search" for="admin-report-query">Buscar por protocolo, alerta ou descrição<input class="control" id="admin-report-query" type="search" maxlength="120" autocomplete="off" value="${esc(adminReports.query)}" placeholder="Identificador ou informação permitida"></label>
      <label for="admin-report-status">Situação<select class="control" id="admin-report-status"><option value="">Todas</option>${Object.entries(reportStatuses).map(([value, label]) => `<option value="${value}" ${adminReports.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label for="admin-report-category">Motivo<select class="control" id="admin-report-category"><option value="">Todos</option>${Object.entries(reportCategories).map(([value, label]) => `<option value="${value}" ${adminReports.category === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label for="admin-report-from">Enviada a partir de<input class="control" id="admin-report-from" type="date" value="${esc(adminReports.createdFrom)}"></label>
      <label for="admin-report-to">Enviada até<input class="control" id="admin-report-to" type="date" value="${esc(adminReports.createdTo)}"></label>
      <label for="admin-report-order">Ordenação<select class="control" id="admin-report-order"><option value="newest" ${adminReports.order === "newest" ? "selected" : ""}>Mais recentes</option><option value="oldest" ${adminReports.order === "oldest" ? "selected" : ""}>Mais antigas</option></select></label>
    </form>`;
    return adminFrame("reports", `<section class="admin-content" aria-labelledby="admin-reports-title"><div class="admin-content-heading"><h2 id="admin-reports-title">Denúncias</h2><p>Analise relatos enviados pela comunidade. A identidade do denunciante não aparece nesta fila.</p></div><div id="admin-report-counts" aria-live="polite"><p class="hint">Carregando indicadores…</p></div>${controls}<p id="admin-report-results-status" class="hint" role="status" aria-live="polite">Carregando denúncias…</p><div id="admin-report-results" aria-live="polite" aria-busy="true"></div></section>`);
  }
  function adminReportListMarkup(result) {
    const rows = result.reports || [];
    if (!rows.length) {
      const filtered = Boolean(adminReports.query || adminReports.status || adminReports.category || adminReports.createdFrom || adminReports.createdTo);
      return `<div class="notice"><strong>${filtered ? "Nenhuma denúncia encontrada" : "Fila vazia"}</strong><p>${filtered ? "Ajuste os filtros para consultar outras denúncias." : "As denúncias válidas aparecerão aqui quando forem enviadas."}</p></div>`;
    }
    const start = (adminReports.page - 1) * adminReports.pageSize + 1;
    const end = start + rows.length - 1;
    const pages = Math.max(1, Math.ceil(result.total / adminReports.pageSize));
    return `<div class="admin-report-list">${rows.map((row) => `<article class="admin-report-card"><header><div><span class="admin-report-category">${esc(reportCategories[row.category] || row.category)}</span><h3>${esc(row.pet_name || "Alerta relacionado")} · ${esc(reportStatuses[row.report_status] || row.report_status)}</h3><p>Denúncia <code>${esc(row.report_id)}</code></p></div><span class="admin-status ${row.report_status === "open" ? "suspended" : row.report_status === "resolved" ? "active" : ""}">${esc(reportStatuses[row.report_status] || row.report_status)}</span></header><p class="admin-report-description">${esc(row.description)}</p><dl><div><dt>Alerta</dt><dd>${esc(row.occurrence_id)}</dd></div><div><dt>Região aproximada</dt><dd>${row.city ? `${esc(row.city)} · ${esc(row.region || "")}` : "Indisponível"}</dd></div><div><dt>Enviada</dt><dd>${esc(fmtDate(row.created_at, true))}</dd></div></dl><a class="btn secondary small" href="#admin/denuncias/${encodeURIComponent(row.report_id)}">Analisar denúncia</a></article>`).join("")}</div><nav class="admin-pagination" aria-label="Paginação de denúncias"><span>${start}–${end} de ${metric(result.total)}</span><div><button class="btn secondary small" type="button" data-action="admin-report-page" data-page="${adminReports.page - 1}" ${adminReports.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${adminReports.page} de ${pages}</span><button class="btn secondary small" type="button" data-action="admin-report-page" data-page="${adminReports.page + 1}" ${adminReports.page >= pages ? "disabled" : ""}>Próxima</button></div></nav>`;
  }
  async function loadAdminReports(ticket = generation) {
    const request = ++adminReports.request;
    const results = document.querySelector("#admin-report-results");
    const status = document.querySelector("#admin-report-results-status");
    if (results) results.setAttribute("aria-busy", "true");
    if (status) status.textContent = "Carregando denúncias…";
    try {
      const [counts, result] = await Promise.all([
        D.getAdminOccurrenceReportCounts(), D.listAdminOccurrenceReports(adminReports),
      ]);
      if (ticket !== generation || request !== adminReports.request || routeInfo().id !== "denuncias") return;
      const countsTarget = document.querySelector("#admin-report-counts");
      if (countsTarget) countsTarget.innerHTML = adminReportCountsMarkup(counts);
      if (results) { results.innerHTML = adminReportListMarkup(result); results.removeAttribute("aria-busy"); }
      if (status) status.textContent = `${metric(result.total)} ${result.total === 1 ? "denúncia encontrada" : "denúncias encontradas"}.`;
    } catch (error) {
      if (ticket !== generation || request !== adminReports.request || routeInfo().id !== "denuncias") return;
      const countsTarget = document.querySelector("#admin-report-counts");
      if (countsTarget) countsTarget.innerHTML = "";
      if (results) { results.innerHTML = adminReportFailure(error); results.removeAttribute("aria-busy"); }
      if (status) status.textContent = "Consulta indisponível.";
    }
  }
  async function adminReportsPage(ticket) {
    if (!window.BPPermissions?.can("moderate")) return adminDenied();
    setPage(adminReportsMarkup(), "Denúncias");
    await loadAdminReports(ticket);
  }
  function adminReportHistoryMarkup(history) {
    const actions = { submitted: "Denúncia recebida", review_started: "Análise iniciada", resolved: "Denúncia resolvida", dismissed: "Denúncia descartada" };
    const entries = history?.entries || [];
    return `<section class="admin-account-audit" aria-labelledby="admin-report-history-title"><h3 id="admin-report-history-title">Histórico da denúncia</h3>${entries.length ? `<ol class="admin-audit-list">${entries.map((entry) => `<li><strong>${esc(actions[entry.action] || entry.action)}</strong><span>${esc(fmtDate(entry.created_at, true))} · ${esc(entry.actor_name || "Responsável indisponível")}</span>${entry.reason ? `<p><span class="sr-only">Justificativa: </span>${esc(entry.reason)}</p>` : ""}</li>`).join("")}</ol>` : '<p class="hint">Nenhuma transição registrada.</p>'}</section>`;
  }
  async function adminOccurrenceReportDetails(id, ticket) {
    if (!window.BPPermissions?.can("moderate")) return adminDenied();
    const backHref = routeInfo().source === "moderacao" ? "#admin/moderacao" : "#admin/denuncias";
    if (!UUID.test(id)) {
      setPage(adminFrame("reports", `<section class="admin-content">${adminReportFailure({ code: "NOT_FOUND" }, true)}<p><a class="btn secondary" href="${backHref}">Voltar para denúncias</a></p></section>`), "Denúncia indisponível");
      return;
    }
    try {
      const [report, history] = await Promise.all([
        D.getAdminOccurrenceReport(id), D.listAdminOccurrenceReportHistory(id, { page: 1, pageSize: 20 }),
      ]);
      if (ticket !== generation) return;
      const occurrenceAvailable = ["public", "under_review"].includes(report.occurrence_visibility);
      let actionForm = '<p class="hint">Esta denúncia já foi encerrada. O registro e seu histórico permanecem disponíveis para consulta.</p>';
      if (report.report_status === "open") {
        actionForm = `<form class="form admin-report-transition-form" id="admin-report-transition-form" data-id="${esc(report.report_id)}"><input type="hidden" name="status" value="in_review"><p>A denúncia ainda está aberta. Inicie a análise para registrar a responsabilidade e liberar uma decisão.</p><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Iniciar análise</button></form>`;
      } else if (report.report_status === "in_review") {
        actionForm = `<form class="form admin-report-transition-form" id="admin-report-transition-form" data-id="${esc(report.report_id)}"><label for="admin-report-status-choice">Decisão<select class="control" id="admin-report-status-choice" name="status" required><option value="">Selecione</option><option value="resolved">Resolver denúncia</option><option value="dismissed">Descartar denúncia</option></select></label><label for="admin-report-reason">Justificativa obrigatória<textarea class="control" id="admin-report-reason" name="reason" minlength="10" maxlength="500" required aria-describedby="admin-report-reason-help"></textarea></label><span class="hint" id="admin-report-reason-help">De 10 a 500 caracteres. A justificativa será mantida no histórico administrativo.</span><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Registrar decisão</button></form>`;
      }
      const occurrenceHref = `#admin/ocorrencias/${encodeURIComponent(report.occurrence_id)}${routeInfo().source === "moderacao" ? "?from=moderacao" : ""}`;
      const occurrenceMarkup = occurrenceAvailable
        ? `<dl class="admin-user-details"><div><dt>Identificador do alerta</dt><dd><code>${esc(report.occurrence_id)}</code></dd></div><div><dt>Animal</dt><dd>${esc(report.pet_name || "Sem vínculo")} · ${esc(species[report.pet_species] || "Espécie não informada")}</dd></div><div><dt>Tipo / situação</dt><dd>${esc(types[report.occurrence_type] || "Indisponível")} · ${esc(states[report.occurrence_status] || "Indisponível")}</dd></div><div><dt>Visibilidade</dt><dd>${esc(report.occurrence_visibility === "under_review" ? "Em análise de moderação" : "Pública")}</dd></div><div><dt>Região pública aproximada</dt><dd>${esc(report.city)} · ${esc(report.region)}${report.public_reference ? ` · ${esc(report.public_reference)}` : ""}</dd></div><div><dt>Último registro</dt><dd>${esc(fmtDate(report.last_seen_at, true))}</dd></div><div class="full"><dt>Descrição pública do alerta</dt><dd>${esc(report.occurrence_description)}</dd></div>${report.pet_breed || report.pet_coat_description || report.pet_distinctive_features ? `<div class="full"><dt>Características públicas do animal</dt><dd>${[report.pet_breed, report.pet_coat_description, report.pet_distinctive_features].filter(Boolean).map(esc).join(" · ")}</dd></div>` : ""}</dl><p><a class="btn secondary" href="${occurrenceHref}">Abrir moderação do alerta e fotografias autorizadas</a></p>`
        : `<div class="notice"><strong>Conteúdo do alerta indisponível</strong><p>A visibilidade atual não permite consultar o conteúdo ou as fotografias por esta análise.</p><code>${esc(report.occurrence_id)}</code></div>`;
      setPage(adminFrame("reports", `<section class="admin-content admin-report-detail"><p><a class="back-link" href="${backHref}">‹ Voltar à fila de denúncias</a></p><div class="admin-content-heading"><div class="admin-occurrence-meta"><span class="admin-report-category">${esc(reportCategories[report.category] || report.category)}</span><span class="admin-status ${report.report_status === "open" ? "suspended" : report.report_status === "resolved" ? "active" : ""}">${esc(reportStatuses[report.report_status] || report.report_status)}</span></div><h2 id="admin-report-title">Análise da denúncia</h2><p>Protocolo <code>${esc(report.report_id)}</code> · Enviada ${esc(fmtDate(report.created_at, true))}</p></div><section class="admin-report-body"><h3>Descrição complementar</h3><p>${esc(report.description)}</p></section><section class="admin-report-related"><h3>Ocorrência relacionada</h3>${occurrenceMarkup}</section><section class="admin-account-action" aria-labelledby="admin-report-decision-title"><h3 id="admin-report-decision-title">Triagem e decisão</h3>${actionForm}</section>${adminReportHistoryMarkup(history)}<p><a class="btn secondary" href="${backHref}">Voltar à fila</a></p></section>`), "Análise da denúncia");
    } catch (error) {
      if (ticket === generation) setPage(adminFrame("reports", `<section class="admin-content">${adminReportFailure(error, true)}<p><a class="btn secondary" href="${backHref}">Voltar para denúncias</a></p></section>`), "Análise da denúncia");
    }
  }
  const moderationStatuses = Object.freeze({
    pending: "Pendentes", open: "Abertas", in_review: "Em análise",
    under_review: "Ocultas", resolved: "Resolvidas", dismissed: "Descartadas", all: "Todas",
  });
  function adminModerationMarkup() {
    const controls = `<form class="admin-moderation-controls" id="admin-moderation-controls" aria-label="Filtros da central de moderação">
      <label for="admin-moderation-query">Buscar protocolo, animal ou informação pública<input class="control" id="admin-moderation-query" type="search" maxlength="120" autocomplete="off" value="${esc(adminModeration.query)}" placeholder="Identificador ou nome do animal"></label>
      <label for="admin-moderation-kind">Tipo de item<select class="control" id="admin-moderation-kind"><option value="all">Denúncias e ocorrências</option><option value="report" ${adminModeration.kind === "report" ? "selected" : ""}>Denúncias</option><option value="occurrence" ${adminModeration.kind === "occurrence" ? "selected" : ""}>Ocorrências ocultas</option></select></label>
      <label for="admin-moderation-status">Situação<select class="control" id="admin-moderation-status">${Object.entries(moderationStatuses).map(([key, label]) => `<option value="${key}" ${adminModeration.status === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label for="admin-moderation-from">Criado a partir de<input class="control" id="admin-moderation-from" type="date" value="${esc(adminModeration.createdFrom)}"></label>
      <label for="admin-moderation-to">Criado até<input class="control" id="admin-moderation-to" type="date" value="${esc(adminModeration.createdTo)}"></label>
      <label for="admin-moderation-order">Ordenação<select class="control" id="admin-moderation-order"><option value="priority" ${adminModeration.order === "priority" ? "selected" : ""}>Prioridade</option><option value="newest" ${adminModeration.order === "newest" ? "selected" : ""}>Mais recentes</option><option value="oldest" ${adminModeration.order === "oldest" ? "selected" : ""}>Mais antigas</option></select></label>
    </form>`;
    return adminFrame("moderation", `<section class="admin-content admin-moderation" aria-labelledby="admin-moderation-title">
      <div class="admin-content-heading"><h2 id="admin-moderation-title">Central de moderação</h2><p>Fila unificada de denúncias e ocorrências ocultas. As decisões e seus históricos permanecem nos fluxos auditados existentes.</p></div>
      <section id="admin-moderation-metrics" class="admin-moderation-metrics" aria-label="Indicadores de moderação" aria-live="polite"><p class="hint">Carregando indicadores…</p></section>
      ${controls}<p id="admin-moderation-results-status" class="hint" role="status" aria-live="polite">Carregando itens…</p><div id="admin-moderation-results" aria-live="polite" aria-busy="true"></div>
      <p class="hint">Os detalhes completos, fotografias autorizadas e ações ficam nas telas próprias de análise. A central não exibe identidade de denunciantes, contatos privados ou coordenadas exatas.</p>
    </section>`);
  }
  function adminModerationQueueMarkup(result) {
    const rows = result.items || [];
    if (!rows.length) return `<div class="notice"><strong>${adminModeration.query || adminModeration.kind !== "all" || adminModeration.status !== "pending" || adminModeration.createdFrom || adminModeration.createdTo ? "Nenhum item encontrado" : "Fila de moderação vazia"}</strong><p>Não há itens reais que correspondam aos filtros selecionados.</p></div>`;
    const start = (adminModeration.page - 1) * adminModeration.pageSize + 1;
    const end = Math.min(start + rows.length - 1, result.total);
    const pages = Math.max(1, Math.ceil(result.total / adminModeration.pageSize));
    return `<div class="admin-moderation-list">${rows.map((row) => {
      const isReport = row.item_type === "report";
      const itemTitle = isReport ? (reportCategories[row.category] || row.category) : "Ocorrência oculta";
      const href = isReport
        ? `#admin/denuncias/${encodeURIComponent(row.item_id)}?from=moderacao`
        : `#admin/ocorrencias/${encodeURIComponent(row.occurrence_id)}?from=moderacao`;
      const statusLabel = reportStatuses[row.item_status] || moderationVisibility[row.occurrence_visibility] || row.item_status;
      const entityTitle = row.pet_name || "Animal sem vínculo";
      return `<article class="admin-moderation-card"><header><div class="admin-occurrence-meta"><span class="admin-tag ${isReport ? "" : "lost"}">${isReport ? "Denúncia" : "Ocorrência"}</span><span class="admin-status ${row.item_status === "open" || row.item_status === "under_review" ? "suspended" : row.item_status === "resolved" ? "active" : ""}">${esc(statusLabel)}</span></div><h3>${esc(entityTitle)} · ${esc(itemTitle)}</h3></header><dl><div><dt>Animal / alerta</dt><dd>${esc(types[row.occurrence_type] || "Tipo indisponível")} · ${esc(states[row.occurrence_status] || "Situação indisponível")}</dd></div><div><dt>Região pública aproximada</dt><dd>${row.city ? `${esc(row.city)} · ${esc(row.region || "")}` : "Indisponível"}</dd></div><div><dt>Criado</dt><dd>${esc(fmtDate(row.created_at, true))}</dd></div><div><dt>Protocolo</dt><dd><code>${esc(row.item_id)}</code></dd></div>${isReport ? `<div><dt>Denúncias ativas neste alerta</dt><dd>${metric(row.active_report_count)}</dd></div>` : ""}</dl>${row.description ? `<p class="admin-moderation-description">${esc(row.description)}</p>` : ""}<a class="btn secondary small" href="${href}">Analisar ${isReport ? "denúncia" : "ocorrência"}</a></article>`;
    }).join("")}</div><nav class="admin-pagination" aria-label="Paginação da central de moderação"><span>${start}–${end} de ${metric(result.total)}</span><div><button class="btn secondary small" type="button" data-action="admin-moderation-page" data-page="${adminModeration.page - 1}" ${adminModeration.page <= 1 ? "disabled" : ""}>Anterior</button><span>Página ${adminModeration.page} de ${pages}</span><button class="btn secondary small" type="button" data-action="admin-moderation-page" data-page="${adminModeration.page + 1}" ${adminModeration.page >= pages ? "disabled" : ""}>Próxima</button></div></nav>`;
  }
  function adminModerationFailure(error) {
    const denied = error?.code === "DENIED" || error?.code === "AUTH_REQUIRED";
    return `<div class="notice"><strong>${denied ? "Acesso negado" : "Central indisponível"}</strong><p>${denied ? "Sua conta não está autorizada a consultar esta fila." : error?.code === "NOT_PUBLISHED" ? "A RPC da central ainda não está publicada neste ambiente." : "Não foi possível consultar a fila real. Tente novamente."}</p></div><p><button class="btn secondary" type="button" data-action="admin-moderation-retry">Tentar novamente</button></p>`;
  }
  async function loadAdminModeration(ticket) {
    const request = ++adminModeration.request;
    const filters = { ...adminModeration };
    const status = document.querySelector("#admin-moderation-results-status");
    const results = document.querySelector("#admin-moderation-results");
    const metrics = document.querySelector("#admin-moderation-metrics");
    if (!results) return;
    results.setAttribute("aria-busy", "true");
    if (status) status.textContent = "Consultando a fila de moderação…";
    try {
      const [summary, queue] = await Promise.all([
        D.getAdminModerationMetrics(), D.listAdminModerationQueue(filters),
      ]);
      if (ticket !== generation || request !== adminModeration.request || routeInfo().id !== "moderacao") return;
      adminModeration.page = queue.page ?? filters.page;
      if (metrics) metrics.innerHTML = `<div class="admin-metrics">${adminMetric("shield", summary.open_reports, "Denúncias abertas")}${adminMetric("search", summary.in_review_reports, "Denúncias em análise")}${adminMetric("search", summary.hidden_occurrences, "Ocorrências ocultas")}${adminMetric("heart", summary.resolved_reports, "Denúncias resolvidas")}${adminMetric("shield", summary.dismissed_reports, "Denúncias descartadas")}${adminMetric("calendar", summary.decisions_last_30_days, "Decisões nos últimos 30 dias")}</div>`;
      results.innerHTML = adminModerationQueueMarkup(queue);
      if (status) status.textContent = `${metric(queue.total)} ${queue.total === 1 ? "item encontrado" : "itens encontrados"}.`;
      results.removeAttribute("aria-busy");
    } catch (error) {
      if (ticket !== generation || request !== adminModeration.request) return;
      if (metrics) metrics.innerHTML = "";
      results.innerHTML = adminModerationFailure(error);
      if (status) status.textContent = "Consulta indisponível.";
      results.removeAttribute("aria-busy");
    }
  }
  async function adminModerationPage(ticket) {
    if (!window.BPPermissions?.can("moderate")) return adminDenied();
    setPage(adminModerationMarkup(), "Central de moderação");
    await loadAdminModeration(ticket);
  }
  function adminDenied() {
    setPage(shell("Acesso negado", "Esta área exige uma conta administrativa ou de moderação ativa.", `<div class="notice"><strong>Acesso protegido</strong><p>Não foi possível autorizar o acesso a esta área.</p></div><div class="actions"><a class="btn primary" href="#painel-tutor">Voltar à minha área</a></div>`, true), "Acesso negado");
  }
  async function adminDashboard(ticket) {
    if (!window.BPPermissions?.can("viewAdminDashboard")) return adminDenied();
    const stats = await D.getAdminDashboardMetrics();
    if (ticket !== generation) return;
    setPage(adminFrame("overview", `<section class="admin-content" aria-labelledby="admin-overview-title"><div class="admin-content-heading"><h2 id="admin-overview-title">Indicadores</h2><p>As contagens são atualizadas a cada acesso ao painel.</p></div><section class="admin-group" aria-labelledby="admin-users-title"><h2 id="admin-users-title">Usuários</h2><div class="admin-metrics">${adminMetric("user", stats.total_accounts, "Contas cadastradas")}${adminMetric("user", stats.active_accounts, "Contas ativas")}${adminMetric("user", stats.suspended_accounts, "Contas suspensas")}</div></section><section class="admin-group" aria-labelledby="admin-pets-title"><h2 id="admin-pets-title">Animais</h2><div class="admin-metrics">${adminMetric("paw", stats.total_pets, "Animais cadastrados")}</div></section><section class="admin-group" aria-labelledby="admin-occurrences-title"><h2 id="admin-occurrences-title">Ocorrências</h2><div class="admin-metrics">${adminMetric("search", stats.total_occurrences, "Total de ocorrências")}${adminMetric("search", stats.active_occurrences, "Buscas ativas")}${adminMetric("pin", stats.lost_occurrences, "Animais desaparecidos")}${adminMetric("paw", stats.found_occurrences, "Animais encontrados")}${adminMetric("heart", stats.resolved_occurrences, "Ocorrências resolvidas", "Inclui localizadas, reunidas e encerradas")}${adminMetric("heart", stats.reunited_occurrences, "Animais reunificados")}</div></section><section class="admin-group" aria-labelledby="admin-sightings-title"><h2 id="admin-sightings-title">Avistamentos</h2><div class="admin-metrics">${adminMetric("pin", stats.total_sightings, "Avistamentos")}${adminMetric("search", stats.pending_sightings, "Pendentes de análise")}</div></section></section>`), "Painel administrativo");
  }
  async function sightingForm(id, ticket) {
    const row = await D.getOccurrence(id);
    if (ticket !== generation) return;
    if (!row || row.status !== "active" || row.visibility !== "public") return unavailable("Este alerta não recebe avistamentos");
    setPage(shell("Registrar avistamento", "Descreva o local aproximado e o momento da observação.", `<p class="notice">O envio sem conta ainda está indisponível. Você está entrando com sua conta para registrar esta pista.</p><form class="form" id="real-sighting-form" data-id="${esc(id)}"><label>Área aproximada *<input class="control" name="area_description" maxlength="200" required></label><label>Quando você viu o animal? *<input class="control" type="datetime-local" name="observed_at" value="${nowLocal()}" max="${nowLocal()}" required><span class="hint">Você pode informar qualquer data e horário anterior ao momento atual.</span></label><button type="button" class="btn secondary small" data-action="sighting-now">Vi o animal agora</button><label>Descrição *<textarea class="control" name="description" minlength="5" maxlength="2000" required></textarea></label><p class="hint">Não inclua endereço residencial ou dados de terceiros. Coordenadas exatas não serão coletadas neste formulário.</p><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Enviar avistamento</button></form>`, true), "Registrar avistamento");
    const form = document.querySelector("#real-sighting-form");
    const description = form?.elements.description?.closest("label");
    description?.insertAdjacentHTML("beforebegin", '<label>Direção observada (opcional)<input class="control" name="direction" maxlength="200" placeholder="Ex.: seguiu em direção à praça"></label>');
    form?.querySelector(".form-error")?.insertAdjacentHTML("beforebegin", pointPickerMarkup("sighting"));
    let initial = null;
    try { initial = await D.getOccurrencePublicLocation(id); }
    catch (error) { console.error("[BuscaPet][localização]", { code: error?.code, cause: error?.message }); }
    if (ticket !== generation) return;
    mountPointPicker("sighting", initial);
    // The occurrence point only centers the picker; it is not an observed sighting.
    selectedPoint = null;
    const status = document.querySelector("#point-selection-status");
    if (status) status.textContent = "Nenhuma região do avistamento marcada.";
    if (initial) document.querySelector('[name="location_consent"]').checked = false;
    const sightingDraft = enableDraft(form, "sighting", id, ["area_description", "observed_at", "direction", "description", "location_description"]);
    if (sightingDraft.restored) {
      const status = form?.querySelector(".draft-status");
      if (status) status.textContent += " Selecione novamente a região no mapa para continuar.";
    }
  }
  function renderAccount() {
    const current = user();
    setPage(shell("Minha conta", "Dados da sua Conta BuscaPet.", `<dl class="account-details"><div><dt>Nome</dt><dd>${esc(current.name)}</dd></div><div><dt>E-mail</dt><dd>${esc(current.email)}</dd></div><div><dt>Situação</dt><dd>${current.status === "suspended" ? "Suspensa" : "Ativa"}</dd></div><div><dt>Tipo de conta</dt><dd>Conta BuscaPet</dd></div></dl><div class="actions"><a class="btn secondary" href="#esqueci-senha">Trocar senha por e-mail</a><button class="btn secondary" data-action="logout">Sair</button></div><p class="hint">As permissões sensíveis são verificadas no servidor. Recursos administrativos não são exibidos nesta versão.</p>`, true), "Minha conta");
  }
  function account() {
    renderAccount();
    const current = user();
    document.querySelector("#real-screen .account-details")?.insertAdjacentHTML("afterend", `<form class="form" id="real-account-form"><label>Nome de exibição<input class="control" name="full_name" value="${esc(current.name)}" minlength="2" maxlength="80" required></label><p class="form-error" role="alert"></p><button class="btn secondary" type="submit">Salvar nome</button></form>`);
  }
  function unavailable(heading = "Página indisponível") {
    setPage(shell(heading, "Este recurso não está disponível no MVP conectado.", '<a class="btn primary" href="#home">Voltar aos alertas</a>', true), heading);
  }
  function staticPage(route) {
    const content = {
      services: ["Rede de apoio", "Cadastro de parceiros e serviços de resgate ainda indisponível neste MVP."],
      sobre: ["Sobre o BuscaPet", "MVP acadêmico com autenticação, animais, ocorrências, fotos e avistamentos autenticados. A revisão jurídica e operacional ainda está pendente."],
      termos: ["Termos de Uso", "Uso acadêmico de demonstração. Publique apenas dados e imagens que você está autorizado a utilizar. Não use este serviço como canal de emergência. A operação pública exige revisão jurídica e política operacional."],
      privacidade: ["Privacidade", "O MVP conectado armazena conta, animais, ocorrências, fotografias e avistamentos no Supabase. A localização pública é aproximada. Prazos de retenção e atendimento aos direitos dos titulares precisam ser definidos antes de lançamento público."],
    }[route];
    if (!content) return unavailable();
    setPage(shell(content[0], content[1], '<a class="btn secondary" href="#home">Voltar</a>', true), content[0]);
  }
  async function render() {
    const ticket = ++generation;
    releasePhotos();
    destroyMap();
    let { route, id, detailId } = routeInfo();
    setPage(shell("Carregando", "Consultando dados autorizados…", "", true), "Carregando");
    try {
      await A.ready;
      if (ticket !== generation) return;
      if (new URLSearchParams(location.search).get("auth") === "reset" && route !== "redefinir-senha") {
        navigate("#redefinir-senha");
        return;
      }
      if (protectedRoutes.has(route) && !A.getSession()) {
        sessionStorage.setItem("bp.real.returnTo", location.hash);
        navigate("#login");
        return;
      }
      chrome(route === "map" ? "mapa" : route);
      if (route === "admin" && (["ocorrencias", "denuncias", "moderacao"].includes(id)
        ? !window.BPPermissions?.can("moderate")
        : !window.BPPermissions?.can("viewAdminDashboard"))) {
        adminDenied();
        return;
      }
      if (route === "home") await home(ticket);
      else if (route === "mapa" || route === "map") {
        if (id) mapMode = "real";
        realMapPage(id);
      }
      else if (route === "services") servicesPage();
      else if (route === "pet") await detail(id, ticket);
      else if (route === "denunciar") await reportOccurrencePage(id, ticket);
      else if (route === "login") login();
      else if (route === "registro") registration();
      else if (route === "esqueci-senha") forgot();
      else if (route === "redefinir-senha") reset();
      else if (route === "verificar-email") verifyEmail();
      else if (route === "meus-animais") await pets(ticket);
      else if (route === "novo-animal") await petForm("", ticket);
      else if (route === "editar-animal") await petForm(id, ticket);
      else if (route === "animal") await petDetail(id, ticket);
      else if (route === "publicar") await occurrenceForm("", id, ticket);
      else if (route === "editar") await occurrenceForm(id, "", ticket);
      else if (route === "painel-tutor") await dashboard(ticket);
      else if (route === "admin" && id === "usuarios") {
        if (detailId) await adminUserDetails(detailId, ticket);
        else await adminUsers(ticket);
      }
      else if (route === "admin" && id === "ocorrencias") {
        if (detailId) await adminOccurrenceDetails(detailId, ticket);
        else await adminOccurrencesPage(ticket);
      }
      else if (route === "admin" && id === "moderacao") await adminModerationPage(ticket);
      else if (route === "admin" && id === "denuncias") {
        if (detailId) await adminOccurrenceReportDetails(detailId, ticket);
        else await adminReportsPage(ticket);
      }
      else if (route === "admin" && !id) await adminDashboard(ticket);
      else if (route === "admin") unavailable("Página administrativa indisponível");
      else if (route === "avistamento") await sightingForm(id, ticket);
      else if (route === "minha-conta") account();
      else staticPage(route);
    } catch (error) {
      if (ticket === generation) setPage(shell("Não foi possível carregar", fail(error), '<button class="btn primary" data-action="retry">Tentar novamente</button>', true), "Erro");
    }
  }
  async function busy(form, task) {
    const button = form.querySelector('button[type="submit"]');
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = "Aguarde…"; }
    form.setAttribute("aria-busy", "true");
    form.querySelector(".form-error").textContent = "";
    try { await task(); }
    catch (error) { form.querySelector(".form-error").textContent = fail(error); }
    finally { if (button) { button.disabled = false; button.textContent = label; } form.removeAttribute("aria-busy"); }
  }
  function formValue(form, name) { return String(new FormData(form).get(name) || "").trim(); }
  function returnAfterLogin() {
    const next = sessionStorage.getItem("bp.real.returnTo");
    sessionStorage.removeItem("bp.real.returnTo");
    return next && /^#[a-z-]+(?:\/[a-z0-9-]+){0,2}$/i.test(next) ? next : "#painel-tutor";
  }
  async function onSubmit(event) {
    const form = event.target;
    if (form.id === "admin-report-transition-form") {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const status = formValue(form, "status");
      if (!window.confirm(status === "in_review"
        ? "Iniciar a análise desta denúncia? A transição ficará no histórico."
        : `Confirma ${status === "resolved" ? "resolver" : "descartar"} esta denúncia? A decisão ficará registrada no histórico.`)) return;
      await busy(form, async () => {
        const result = await D.transitionAdminOccurrenceReport(
          form.dataset.id, status, formValue(form, "reason") || null,
        );
        message(result.report_status === "in_review" ? "Análise iniciada e registrada." : "Decisão da denúncia registrada.");
        await adminOccurrenceReportDetails(form.dataset.id, generation);
      });
      return;
    }
    if (form.id === "admin-report-controls") {
      event.preventDefault();
      clearTimeout(adminReports.searchTimer);
      adminReports.page = 1;
      await loadAdminReports(generation);
      return;
    }
    if (form.id === "admin-occurrence-moderation-form") {
      event.preventDefault();
      if (!form.reportValidity()) return;
      await busy(form, async () => {
        const result = await D.moderateAdminOccurrence(
          form.dataset.id, form.dataset.actionName, formValue(form, "reason"),
        );
        message(result.action === "occurrence_hidden" ? "Ocorrência ocultada e decisão registrada." : "Visibilidade restaurada e decisão registrada.");
        await adminOccurrenceDetails(form.dataset.id, generation);
      });
      return;
    }
    if (form.id === "admin-account-status-form") {
      event.preventDefault();
      if (!form.reportValidity()) return;
      await busy(form, async () => {
        const result = await D.changeAdminUserStatus(
          form.dataset.id,
          form.dataset.status,
          formValue(form, "reason") || null,
        );
        adminDirectory.request += 1;
        document.querySelector("#real-dialog")?.close();
        message(result.account_status === "suspended"
          ? "Conta suspensa. O acesso às operações protegidas foi bloqueado."
          : "Conta reativada. O acesso às operações protegidas foi restaurado.");
        await adminUserDetails(form.dataset.id, generation);
      });
      return;
    }
    if (form.id === "admin-user-controls") {
      event.preventDefault();
      clearTimeout(adminDirectory.searchTimer);
      adminDirectory.page = 1;
      await loadAdminUsers(generation);
      return;
    }
    if (form.id === "admin-occurrence-controls") {
      event.preventDefault();
      clearTimeout(adminOccurrences.searchTimer);
      adminOccurrences.page = 1;
      await loadAdminOccurrences(generation);
      return;
    }
    if (form.id === "real-occurrence-report-form") {
      event.preventDefault();
      if (!form.reportValidity()) return;
      await busy(form, async () => {
        const result = await D.reportOccurrence(
          form.dataset.id, formValue(form, "category"), formValue(form, "description"),
        );
        message(result.already_active
          ? "Você já possui uma denúncia ativa para este alerta."
          : "Denúncia registrada. Obrigado por ajudar na análise da comunidade.");
        navigate(url("pet", form.dataset.id));
      });
      return;
    }
    if (!form.id?.startsWith("real-")) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    await busy(form, async () => {
      if (form.id === "real-account-form") {
        await D.updateProfile({ full_name: formValue(form, "full_name") });
        await A.refresh();
        message("Dados da conta atualizados.");
        void render();
      } else if (form.id === "real-login") {
        await A.signIn(formValue(form, "email"), formValue(form, "password"));
        message("Entrada realizada.");
        navigate(returnAfterLogin());
      } else if (form.id === "real-registration") {
        const passwordValue = formValue(form, "password");
        if (passwordValue.length < 8 || passwordValue !== formValue(form, "passwordConfirmation")) throw Error("Confira a senha e a confirmação (mínimo de 8 caracteres).");
        verificationEmail = formValue(form, "email");
        const result = await A.signUp({ name: formValue(form, "name"), email: verificationEmail, password: passwordValue, passwordConfirmation: formValue(form, "passwordConfirmation"), roles: ["tutor"], activeRole: "tutor", acceptTerms: true, acceptPrivacy: true });
        notice = result.needsEmailConfirmation ? "Confira seu e-mail para ativar a conta." : "Conta criada.";
        navigate(result.needsEmailConfirmation ? "#verificar-email" : "#painel-tutor");
      } else if (form.id === "real-forgot") {
        await A.requestPasswordReset(formValue(form, "email"));
        form.querySelector(".form-success").textContent = "Se houver uma conta para este e-mail, as instruções foram enviadas.";
      } else if (form.id === "real-reset") {
        await A.updatePassword(formValue(form, "password"), formValue(form, "passwordConfirmation"));
        history.replaceState({}, "", location.pathname + "#login");
        notice = "Senha atualizada. Entre novamente.";
        void render();
      } else if (form.id === "real-pet-form") {
        const data = Object.fromEntries(["name", "species", "breed", "sex", "size", "coat_description", "distinctive_features"].map((key) => [key, formValue(form, key)]));
        const row = form.dataset.id ? await D.updatePet(form.dataset.id, data) : await D.createPet(data);
        const selected = [...(form.elements.pet_photos.files || [])];
        const existing = Number(document.querySelector("#pet-photo-gallery")?.dataset.count || 0);
        if (existing + selected.length > 5) throw Error("Cada animal pode ter até cinco fotografias.");
        const prepared = [];
        for (const file of selected) prepared.push(await preparePhoto(file));
        let uploadFailure = "";
        for (const file of prepared) {
          try { await D.uploadPetPhoto(row.id, file); }
          catch (error) { uploadFailure = fail(error); break; }
        }
        clearFormDraft(form);
        message(uploadFailure ? `Animal salvo, mas uma foto não foi enviada: ${uploadFailure}` : "Animal salvo.");
        navigate(url("animal", row.id));
      } else if (form.id === "real-occurrence-form") {
        const amount = Number(formValue(form, "reward") || 0);
        if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw Error("Recompensa inválida.");
        const data = { pet_id: formValue(form, "pet_id") || null, city: formValue(form, "city"), region: formValue(form, "region"), public_reference: formValue(form, "public_reference"), last_seen_at: new Date(formValue(form, "last_seen_at")).toISOString(), description: formValue(form, "description"), reward_cents: Math.round(amount * 100) };
        if (!form.dataset.id) { data.type = formValue(form, "type"); data.visibility = formValue(form, "visibility"); }
        const selected = form.elements.photo.files?.[0];
        const file = selected ? await preparePhoto(selected) : null;
        const point = selectedPoint;
        if (point && !form.elements.location_consent?.checked)
          throw Error("Confirme a divulgação da região aproximada ou remova o marcador.");
        const row = form.dataset.id ? await D.updateOccurrence(form.dataset.id, data) : await D.createOccurrence(data);
        if (point) {
          try { await D.saveOccurrencePublicLocation(row.id, {
            ...point, description: formValue(form, "location_description"), consent: true,
          }); }
          catch (error) { notice = `Alerta salvo, mas a região não foi publicada: ${fail(error)}`; }
        } else if (form.dataset.id && removeExistingPoint) {
          try { await D.deleteOccurrencePublicLocation(row.id); }
          catch (error) { notice = `Alerta salvo, mas a região não foi removida: ${fail(error)}`; }
        }
        if (form.elements.reuse_pet_photos?.checked && data.pet_id) {
          try { await D.reusePetPhotosForOccurrence(data.pet_id, row.id); }
          catch (error) { notice = `Alerta salvo, mas as fotos do animal não foram reutilizadas: ${fail(error)}`; }
        }
        if (file) {
          try { await D.uploadOccurrencePhoto(row.id, file); }
          catch (error) { notice = `Alerta salvo, mas a foto não foi enviada: ${fail(error)}`; }
        }
        clearFormDraft(form);
        message(notice || "Alerta salvo.");
        notice = "";
        navigate(url("pet", row.id));
      } else if (form.id === "real-sighting-form") {
        const observed = new Date(formValue(form, "observed_at"));
        if (!Number.isFinite(observed.getTime()) || observed.getTime() > Date.now() + 60_000)
          throw Error("A data e a hora do avistamento não podem estar no futuro.");
        const point = selectedPoint;
        if (point && !form.elements.location_consent?.checked)
          throw Error("Confirme a divulgação futura da região aproximada ou remova o marcador.");
        const sighting = await D.createSighting({ occurrence_id: form.dataset.id,
          observed_at: observed.toISOString(), area_description: formValue(form, "area_description"),
          direction: formValue(form, "direction"), description: formValue(form, "description") });
        if (point) {
          try { await D.saveSightingPublicLocation(sighting.id, {
            ...point, description: formValue(form, "location_description") || formValue(form, "area_description"), consent: true,
          }); }
          catch (error) { notice = `Avistamento recebido, mas a região não foi associada: ${fail(error)}`; }
        }
        clearFormDraft(form);
        message(notice || "Avistamento registrado para o responsável. A região só aparecerá após revisão e autorização.");
        notice = "";
        navigate(url("pet", form.dataset.id));
      }
    });
  }
  function confirmDialog(heading, body, action, id) {
    const dialog = document.querySelector("#real-dialog");
    lastDialogFocus = document.activeElement;
    dialog.innerHTML = `<h2>${esc(heading)}</h2><p>${esc(body)}</p><div class="actions"><button class="btn secondary" data-action="close-dialog">Cancelar</button><button class="btn danger" data-action="${esc(action)}" data-id="${esc(id)}">Confirmar</button></div>`;
    dialog.showModal();
    dialog.querySelector("button")?.focus();
  }
  function adminAccountStatusDialog(id, name, status) {
    const suspending = status === "suspended";
    const dialog = document.querySelector("#real-dialog");
    lastDialogFocus = document.activeElement;
    dialog.innerHTML = `<form class="form admin-status-dialog" id="admin-account-status-form" data-id="${esc(id)}" data-status="${esc(status)}" aria-labelledby="admin-status-dialog-title"><h2 id="admin-status-dialog-title">${suspending ? "Suspender conta" : "Reativar conta"}</h2><p>${suspending ? `Confirme a suspensão de ${esc(name)}. Os dados serão preservados, mas as operações protegidas serão bloqueadas.` : `Confirme a reativação de ${esc(name)}. A conta voltará a acessar as operações protegidas.`}</p>${suspending ? '<label for="admin-status-reason">Motivo da suspensão *<textarea class="control" id="admin-status-reason" name="reason" minlength="10" maxlength="500" required aria-describedby="admin-status-reason-help"></textarea><span class="hint" id="admin-status-reason-help">Entre 10 e 500 caracteres. Este motivo ficará registrado no histórico administrativo.</span></label>' : ""}<p class="form-error" role="alert"></p><div class="actions"><button class="btn secondary" type="button" data-action="close-dialog">Cancelar</button><button class="btn ${suspending ? "danger" : "primary"}" type="submit">${suspending ? "Confirmar suspensão" : "Confirmar reativação"}</button></div></form>`;
    dialog.showModal();
    dialog.querySelector(suspending ? "textarea" : "button[type=submit]")?.focus();
  }
  async function onClick(event) {
    if (event.target.closest("#real-mobile-nav a")) closeMobileMenu();
    if (event.target.closest(".menu-toggle")) {
      const toggle = document.querySelector(".menu-toggle");
      const menu = document.querySelector("#real-mobile-nav");
      menu.hidden = !menu.hidden;
      toggle.setAttribute("aria-expanded", String(!menu.hidden));
      toggle.setAttribute("aria-label", menu.hidden ? "Abrir menu" : "Fechar menu");
      if (!menu.hidden) menu.querySelector("a")?.focus();
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    try {
      if (action === "admin-page") {
        const page = Number(target.dataset.page);
        if (Number.isInteger(page) && page >= 1) {
          adminDirectory.page = page;
          await loadAdminUsers(generation);
        }
      } else if (action === "admin-report-page") {
        const page = Number(target.dataset.page);
        if (Number.isInteger(page) && page >= 1) {
          adminReports.page = page;
          await loadAdminReports(generation);
        }
      } else if (action === "admin-report-retry") {
        await loadAdminReports(generation);
      } else if (action === "admin-moderation-page") {
        const page = Number(target.dataset.page);
        if (Number.isInteger(page) && page >= 1) {
          adminModeration.page = page;
          await loadAdminModeration(generation);
        }
      } else if (action === "admin-moderation-retry") {
        await loadAdminModeration(generation);
      } else if (action === "admin-report-retry-detail") {
        await adminOccurrenceReportDetails(routeInfo().detailId, generation);
      } else if (action === "admin-occurrence-page") {
        const page = Number(target.dataset.page);
        if (Number.isInteger(page) && page >= 1) {
          adminOccurrences.page = page;
          await loadAdminOccurrences(generation);
        }
      } else if (action === "admin-retry") {
        await loadAdminUsers(generation);
      } else if (action === "admin-occurrence-retry") {
        await loadAdminOccurrences(generation);
      } else if (action === "admin-occurrence-retry-detail") {
        await adminOccurrenceDetails(routeInfo().detailId, generation);
      } else if (action === "admin-account-status") {
        adminAccountStatusDialog(target.dataset.id, target.dataset.name || "Conta", target.dataset.status);
      } else if (action === "map-mode") {
        mapMode = target.dataset.mode === "demo" ? "demo" : "real";
        if (mapMode === "demo" && mapOccurrenceId) navigate("#mapa");
        else realMapPage(mapOccurrenceId);
      } else if (action === "apply-map-filters" || action === "refresh-map") {
        await loadRealMapPoints({ useViewport: action === "refresh-map" });
      } else if (action === "choose-center") {
        pointPicker?.chooseCenter();
      } else if (action === "clear-point") {
        const kind = document.querySelector("#occurrence-point-map") ? "occurrence" : "sighting";
        pointPicker?.destroy();
        pointPicker = null;
        mountPointPicker(kind);
        removeExistingPoint = kind === "occurrence";
        const consent = document.querySelector('[name="location_consent"]');
        if (consent) consent.checked = false;
      } else if (action === "review-sighting") {
        await D.reviewSighting(target.dataset.id, target.dataset.status);
        const occurrenceId = routeInfo().id;
        await showSightings(occurrenceId, generation);
        message(target.dataset.status === "reviewed" ? "Relato revisado. Autorize a região separadamente para aparecer no mapa." : "Relato rejeitado.");
      } else if (action === "publish-sighting") {
        await D.setSightingPublication(target.dataset.id, target.dataset.approved === "true");
        await showSightings(routeInfo().id, generation);
        message(target.dataset.approved === "true" ? "Região autorizada no mapa." : "Região retirada do mapa.");
      } else if (action === "focus-map-point") {
        if (!mapController?.focus(target.dataset.id)) message("Este ponto não está visível com os filtros atuais.");
      } else if (action === "use-location") {
        mapController?.locate({ onSuccess: () => message("Localização usada somente neste mapa; ela não foi salva."), onError: message });
      } else if (action === "toggle-password") {
        const input = target.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        target.textContent = show ? "Ocultar" : "Mostrar";
        target.setAttribute("aria-label", `${show ? "Ocultar" : "Mostrar"} senha`);
        target.setAttribute("aria-pressed", String(show));
      } else if (action === "logout") {
        const previousRoute = location.hash || "#home";
        navigate("#login");
        try { await A.signOut(); }
        catch (error) { navigate(previousRoute); throw error; }
        message("");
        notice = "Sessão encerrada.";
        void render();
      } else if (action === "discard-draft") {
        const form = target.closest("form");
        if (!form || !window.confirm("Descartar o rascunho deste formulário? Esta ação não pode ser desfeita.")) return;
        clearFormDraft(form);
        message("Rascunho descartado.");
        void render();
      } else if (action === "retry") void render();
      else if (action === "sighting-now") {
        const input = target.closest("form")?.elements.observed_at;
        if (input) { input.value = nowLocal(); input.max = nowLocal(); input.focus(); }
      } else if (action === "set-pet-cover") {
        await D.setPetCover(target.dataset.id);
        void render();
      } else if (action === "delete-pet-photo") {
        await D.deletePetPhoto(target.dataset.id);
        message("Foto removida.");
        void render();
      }
      else if (action === "resend-email") {
        const email = user()?.email || verificationEmail;
        if (email) await A.resendVerification(email);
        message("Se houver uma conta pendente, a confirmação será reenviada.");
      } else if (action === "delete-pet") confirmDialog("Excluir animal?", "O vínculo com alertas existentes poderá ser removido. Esta ação não pode ser desfeita.", "confirm-delete-pet", target.dataset.id);
      else if (action === "confirm-delete-pet") {
        await D.deletePet(target.dataset.id);
        document.querySelector("#real-dialog").close();
        navigate("#meus-animais");
        message("Animal excluído.");
      } else if (action === "close-dialog") document.querySelector("#real-dialog").close();
      else if (action === "delete-photo") confirmDialog("Excluir foto?", "A fotografia será removida do alerta e do Storage privado.", "confirm-delete-photo", target.dataset.id);
      else if (action === "confirm-delete-photo") {
        await D.deletePhoto(target.dataset.id);
        document.querySelector("#real-dialog").close();
        message("Foto excluída.");
        void render();
      }
      else if (action === "status") {
        await D.setOccurrenceStatus(target.dataset.id, target.dataset.status);
        message("Situação atualizada.");
        void render();
      }
    } catch (error) { message(fail(error)); }
  }
  function onInput(event) {
    if (event.target.id === "admin-moderation-query") {
      adminModeration.query = event.target.value;
      adminModeration.page = 1;
      adminModeration.request++;
      clearTimeout(adminModeration.searchTimer);
      adminModeration.searchTimer = setTimeout(() => { void loadAdminModeration(generation); }, 300);
      return;
    }
    if (event.target.id === "admin-report-query") {
      adminReports.query = event.target.value;
      adminReports.page = 1;
      clearTimeout(adminReports.searchTimer);
      adminReports.searchTimer = setTimeout(() => { void loadAdminReports(generation); }, 300);
      return;
    }
    if (event.target.id === "admin-occurrence-query") {
      adminOccurrences.query = event.target.value;
      adminOccurrences.page = 1;
      clearTimeout(adminOccurrences.searchTimer);
      adminOccurrences.searchTimer = setTimeout(() => { void loadAdminOccurrences(generation); }, 300);
      return;
    }
    if (event.target.id === "admin-user-query") {
      adminDirectory.query = event.target.value;
      adminDirectory.page = 1;
      clearTimeout(adminDirectory.searchTimer);
      adminDirectory.searchTimer = setTimeout(() => { void loadAdminUsers(generation); }, 300);
      return;
    }
    if (event.target.id === "real-query") {
      filters.query = event.target.value;
      const cards = [...document.querySelectorAll("#real-results .pet")];
      const term = filters.query.toLocaleLowerCase("pt-BR");
      let count = 0;
      for (const card of cards) {
        card.hidden = !card.textContent.toLocaleLowerCase("pt-BR").includes(term);
        if (!card.hidden) count++;
      }
      document.querySelector("#real-result-count").textContent = `${count} ${count === 1 ? "alerta encontrado" : "alertas encontrados"}`;
    }
  }
  function onChange(event) {
    if (["admin-moderation-kind", "admin-moderation-status", "admin-moderation-order", "admin-moderation-from", "admin-moderation-to"].includes(event.target.id)) {
      const key = {
        "admin-moderation-kind": "kind", "admin-moderation-status": "status",
        "admin-moderation-order": "order", "admin-moderation-from": "createdFrom",
        "admin-moderation-to": "createdTo",
      }[event.target.id];
      adminModeration[key] = event.target.value;
      adminModeration.page = 1;
      adminModeration.request++;
      clearTimeout(adminModeration.searchTimer);
      void loadAdminModeration(generation);
      return;
    }
    if (["admin-report-status", "admin-report-category", "admin-report-from", "admin-report-to", "admin-report-order"].includes(event.target.id)) {
      const key = {
        "admin-report-status": "status", "admin-report-category": "category",
        "admin-report-from": "createdFrom", "admin-report-to": "createdTo",
        "admin-report-order": "order",
      }[event.target.id];
      adminReports[key] = event.target.value;
      adminReports.page = 1;
      void loadAdminReports(generation);
      return;
    }
    if (["admin-occurrence-type", "admin-occurrence-status", "admin-occurrence-visibility", "admin-occurrence-from", "admin-occurrence-to"].includes(event.target.id)) {
      const keys = {
        "admin-occurrence-type": "type", "admin-occurrence-status": "status",
        "admin-occurrence-visibility": "visibility", "admin-occurrence-from": "createdFrom",
        "admin-occurrence-to": "createdTo",
      };
      adminOccurrences[keys[event.target.id]] = event.target.value;
      adminOccurrences.page = 1;
      clearTimeout(adminOccurrences.searchTimer);
      void loadAdminOccurrences(generation);
      return;
    }
    if (["admin-user-status", "admin-user-role", "admin-user-order"].includes(event.target.id)) {
      const key = event.target.id === "admin-user-status" ? "status"
        : event.target.id === "admin-user-role" ? "role" : "order";
      adminDirectory[key] = event.target.value;
      adminDirectory.page = 1;
      clearTimeout(adminDirectory.searchTimer);
      void loadAdminUsers(generation);
      return;
    }
    if (event.target.dataset.mapFilter) {
      mapFilters[event.target.dataset.mapFilter] = event.target.checked;
      if (mapController) mapController.setPoints(mapPoints, mapFilters, { fit: false });
      return;
    }
    if (event.target.id === "real-type") { filters.type = event.target.value; void render(); }
    if (event.target.id === "real-status") { filters.status = event.target.value; void render(); }
    if (event.target.id === "pet-photo-input") {
      const preview = document.querySelector("#pet-photo-preview");
      if (!preview) return;
      preview.innerHTML = "";
      const selected = [...event.target.files];
      if (selected.length > 5) { message("Escolha no máximo cinco fotos."); event.target.value = ""; return; }
      for (const file of selected) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { message("Use JPEG, PNG ou WebP com até 5 MiB por foto."); event.target.value = ""; preview.innerHTML = ""; return; }
        const source = URL.createObjectURL(file);
        photos.push(source);
        preview.insertAdjacentHTML("beforeend", `<figure><img src="${source}" alt="Prévia de ${esc(file.name)}"><figcaption>${esc(file.name)}</figcaption></figure>`);
      }
    }
    if (event.target.id === "occurrence-pet") {
      const hint = document.querySelector("#occurrence-pet-hint");
      const form = event.target.closest("form");
      const description = form?.elements.description;
      if (!event.target.value) { if (hint) hint.textContent = "O animal precisa pertencer à sua conta."; return; }
      D.getPet(event.target.value).then((pet) => {
        if (!pet || event.target.value !== pet.id) return;
        if (description && !description.value.trim()) description.value = [pet.name, pet.breed, pet.coat_description, pet.distinctive_features].filter(Boolean).join(" · ");
        if (hint) hint.textContent = `Dados de ${pet.name} carregados. Marque a opção abaixo para reutilizar as fotos.`;
      }).catch((error) => { if (hint) hint.textContent = fail(error); });
    }
  }
  function onKeydown(event) {
    if (event.key === "Escape" && !document.querySelector("#real-mobile-nav")?.hidden) closeMobileMenu(true);
  }
  window.BPRealApp = Object.freeze({ mount, render, onClick, onSubmit, onInput, onChange, onKeydown });
})();
