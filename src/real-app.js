/* Interface conectada: dados reais via publishable key, Auth e RLS. */
(() => {
  "use strict";
  const A = window.BPAuth;
  const D = window.BPRemoteStore;
  const { escape: esc, icon, fmtDate, empty } = window.BPViews;
  const root = document.querySelector("#main-content");
  const species = { dog: "Cão", cat: "Gato", other: "Outro" };
  const states = { active: "Em busca", located: "Localizado", reunited: "Reunido", closed: "Encerrado" };
  const types = { lost: "Animal desaparecido", found: "Animal encontrado" };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const protectedRoutes = new Set(["minha-conta", "meus-animais", "novo-animal", "animal", "editar-animal", "publicar", "editar", "painel-tutor", "avistamento"]);
  let generation = 0;
  let filters = { query: "", type: "", status: "" };
  let photos = [];
  let lastDialogFocus = null;
  let notice = "";
  let verificationEmail = "";
  let messageTimer;

  const url = (route, id) => `#${route}${id ? `/${encodeURIComponent(id)}` : ""}`;
  const user = () => A.getCurrentUser();
  const nowLocal = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
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
    const [route = "home", raw = ""] = location.hash.replace(/^#/, "").split("/");
    let id = "";
    try { id = decodeURIComponent(raw); } catch { /* invalid route is handled below */ }
    return { route: route || "home", id };
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
    const links = [
      ["home", "Início", "home"],
      ["services", "Rede de apoio", ""],
      ...(logged ? [["painel-tutor", "Minha área", "paw"], ["meus-animais", "Meus animais", "heart"], ["publicar/lost", "Publicar", "plus"]] : []),
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
  function alertCard(item) {
    return `<article class="pet"><div class="photo"><span class="photo-placeholder">${icon("paw")}<small>Foto no detalhe</small></span></div><div class="pet-body"><div class="card-tags"><span class="tag ${item.type === "found" ? "found" : ""}">${types[item.type]}</span><span class="tag">${states[item.status] || "Situação indisponível"}</span></div><h3>${types[item.type]}</h3><p class="pet-description">${esc(item.description)}</p><p class="pet-location">${icon("pin")} ${esc(item.region)}<span>${esc(item.city)}</span></p>${item.public_reference ? `<p class="hint">${esc(item.public_reference)}</p>` : ""}<div class="card-bottom"><span>${fmtDate(item.last_seen_at)}</span></div><div class="card-footer"><span>Alerta da comunidade</span><b>Ver alerta</b></div></div><a class="card-link" href="${url("pet", item.id)}" aria-label="Ver ${types[item.type]} em ${esc(item.city)}"></a></article>`;
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
  }
  async function detail(id, ticket) {
    if (!UUID.test(id)) return unavailable("Alerta indisponível");
    const row = await D.getOccurrence(id);
    if (ticket !== generation) return;
    if (!row) return unavailable("Alerta indisponível");
    const mine = row.reporter_id === user()?.id;
    const canReport = row.status === "active" && row.visibility === "public";
    const nextStates = row.status === "active" ? ["located", "reunited", "closed"] : ["active"];
    setPage(shell(types[row.type], `${row.city} · ${row.region}`, `<a class="back-link" href="#home">‹ Voltar aos alertas</a><div class="detail-layout"><div><div id="real-photo-gallery" class="detail-photo"><span class="photo-placeholder">${icon("paw")}<small>Sem foto</small></span></div></div><div><div class="fact-line"><span class="tag">${states[row.status]}</span><span class="tag">${row.visibility === "public" ? "Público" : "Privado"}</span></div><div class="detail"><div><span class="ico">${icon("pin")}</span><p><small>Local aproximado</small><b>${esc(row.region)} · ${esc(row.city)}</b><small>${esc(row.public_reference || "Sem referência adicional")}</small></p></div><div><span class="ico">${icon("calendar")}</span><p><small>Visto em</small><b>${fmtDate(row.last_seen_at, true)}</b></p></div></div><h2 class="section-heading">Descrição</h2><p class="desc">${esc(row.description)}</p><div class="actions">${canReport ? `<a class="btn primary" href="${url("avistamento", id)}">${user() ? "Registrar avistamento" : "Entrar para registrar avistamento"}</a>` : ""}${mine ? `<a class="btn secondary" href="${url("editar", id)}">Editar alerta</a><a class="btn secondary" href="${url("painel-tutor")}">Minha área</a>` : ""}</div>${canReport && !user() ? '<p class="hint">O envio sem conta está temporariamente indisponível até a publicação do ingresso protegido.</p>' : ""}${mine && row.visibility !== "under_review" ? `<div class="actions" aria-label="Alterar situação do alerta">${nextStates.map((state) => `<button class="btn secondary small" data-action="status" data-id="${esc(id)}" data-status="${state}">Marcar: ${states[state]}</button>`).join("")}</div>` : ""}</div></div><section id="real-sightings" aria-label="Avistamentos autorizados"></section>`, false), "Detalhes do alerta");
    void showPhotos(id, ticket);
    if (mine) void showSightings(id, ticket);
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
      target.innerHTML = `<h2 class="section-heading">Avistamentos recebidos (${rows.length})</h2>${rows.length ? `<div class="timeline">${rows.map((row) => `<article><b>${esc(row.area_description)}</b><p>${esc(row.description)}</p><small>${fmtDate(row.observed_at, true)} · ${esc(row.status)}</small></article>`).join("")}</div>` : '<p class="hint">Nenhum avistamento recebido.</p>'}`;
    } catch { /* A própria RLS pode limitar os registros. */ }
  }
  function authPage(heading, intro, form) {
    setPage(`<div class="auth-page"><section class="auth-form-panel"><a class="logo auth-logo" href="#home">${icon("paw")}<span class="wordmark">Busca<strong>Pet</strong></span></a><div class="auth-heading"><h1>${esc(heading)}</h1><p>${esc(intro)}</p></div>${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ""}${form}</section><aside class="auth-context"><img src="assets/hex.png" alt="Cão ilustrativo"><div><p class="eyebrow">BuscaPet</p><h2>Uma conta para acompanhar suas buscas.</h2><p>Autenticação e dados protegidos pelo Supabase.</p></div></aside></div>`, heading);
    notice = "";
  }
  const password = (name, label, autocomplete) => `<label>${label}<span class="password-control"><input class="control" type="password" name="${name}" autocomplete="${autocomplete}" required><button class="password-toggle" type="button" data-action="toggle-password" aria-label="Mostrar ${label.toLowerCase()}">Mostrar</button></span></label>`;
  function login() {
    authPage("Entre no BuscaPet", "Use seu e-mail e senha.", `<form class="form auth-form" id="real-login"><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required></label>${password("password", "Senha", "current-password")}<p class="form-error" role="alert"></p><button class="btn primary" type="submit">Entrar</button><div class="auth-links"><a href="#esqueci-senha">Esqueci minha senha</a><a href="#registro">Criar conta</a></div></form>`);
  }
  function registration() {
    authPage("Crie sua conta", "Cadastro real para o MVP acadêmico.", `<form class="form auth-form" id="real-registration"><label>Nome completo<input class="control" name="name" autocomplete="name" minlength="2" maxlength="80" required></label><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required></label>${password("password", "Senha", "new-password")}<p class="hint">Use pelo menos 8 caracteres.</p>${password("passwordConfirmation", "Confirmação da senha", "new-password")}<label class="check-label"><input type="checkbox" name="collaborator"><span>Também quero colaborar em buscas.</span></label><label class="check-label"><input type="checkbox" name="acceptTerms" required><span>Li e aceito os <a href="#termos" target="_blank" rel="noopener">Termos de Uso</a>.</span></label><label class="check-label"><input type="checkbox" name="acceptPrivacy" required><span>Li a <a href="#privacidade" target="_blank" rel="noopener">Política de Privacidade</a>.</span></label><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Criar conta</button><p class="auth-footer">Já tem conta? <a href="#login">Entrar</a></p></form>`);
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
    setPage(shell(id ? "Editar alerta" : types[kind], "Escolha um animal para reaproveitar os dados e as fotos autorizadas.", `<form class="form form-page" id="real-occurrence-form" data-id="${esc(id || "")}"><input type="hidden" name="type" value="${kind}"><div class="form-grid"><label>Animal vinculado<select class="control" name="pet_id" id="occurrence-pet"><option value="">Sem vínculo</option>${pets.map((pet) => `<option value="${esc(pet.id)}" ${pet.id === row?.pet_id ? "selected" : ""}>${esc(pet.name)}</option>`).join("")}</select></label><p class="hint" id="occurrence-pet-hint">O animal precisa pertencer à sua conta. <a href="#novo-animal">Cadastrar animal</a></p><label>Cidade *<input class="control" name="city" value="${esc(row?.city || "")}" maxlength="80" required></label><label>Bairro ou região *<input class="control" name="region" value="${esc(row?.region || "")}" maxlength="100" required></label><label>Referência pública aproximada<input class="control" name="public_reference" value="${esc(row?.public_reference || "")}" maxlength="200"></label><label>Data e hora *<input class="control" type="datetime-local" name="last_seen_at" value="${row?.last_seen_at ? esc(new Date(new Date(row.last_seen_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)) : nowLocal()}" max="${nowLocal()}" required></label><label>Recompensa opcional (R$)<input class="control" type="number" min="0" max="1000000" step="0.01" name="reward" value="${row ? (row.reward_cents / 100).toFixed(2) : ""}"></label><label class="full">Descrição *<textarea class="control" name="description" minlength="10" maxlength="2000" required>${esc(row?.description || "")}</textarea></label><label>Visibilidade<select class="control" name="visibility" ${id ? "disabled" : ""}><option value="public" ${row?.visibility !== "private" ? "selected" : ""}>Pública</option><option value="private" ${row?.visibility === "private" ? "selected" : ""}>Privada</option></select></label><label class="check-label full"><input type="checkbox" name="reuse_pet_photos"><span>Reutilizar as fotos privadas do animal selecionado nesta ocorrência.</span></label><label class="full">Foto adicional opcional<input class="control" type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span class="hint">JPEG, PNG ou WebP, até 5 MiB. A foto é reprocessada para remover metadados antes do envio.</span></label></div><label class="check-label"><input type="checkbox" name="rights" required><span>Confirmo que posso usar as informações e a foto.</span></label><p class="form-error" role="alert"></p><div class="actions"><button class="btn primary" type="submit">${id ? "Salvar alterações" : "Publicar alerta"}</button><a class="btn secondary" href="${id ? url("pet", id) : "#home"}">Cancelar</a></div></form>`, true), id ? "Editar alerta" : types[kind]);
  }
  async function dashboard(ticket) {
    const [pets, occurrences] = await Promise.all([D.listOwnPets(), D.listOwnOccurrences()]);
    if (ticket !== generation) return;
    const active = occurrences.filter((row) => row.status === "active").length;
    setPage(shell("Minha área", "Dados atualizados do Supabase.", `<div class="actions"><a class="btn primary" href="#novo-animal">Cadastrar animal</a><a class="btn secondary" href="#publicar/lost">Criar alerta</a></div><div class="dashboard-summary"><div><b>${pets.length}</b><span>Meus animais</span></div><div><b>${occurrences.length}</b><span>Meus alertas</span></div><div><b>${active}</b><span>Buscas ativas</span></div></div><h2 class="section-heading">Meus alertas</h2>${occurrences.length ? `<div class="alert-grid">${occurrences.map(alertCard).join("")}</div>` : empty("Nenhum alerta", "Publique um alerta para começar.")}`), "Minha área");
  }
  async function sightingForm(id, ticket) {
    const row = await D.getOccurrence(id);
    if (ticket !== generation) return;
    if (!row || row.status !== "active" || row.visibility !== "public") return unavailable("Este alerta não recebe avistamentos");
    setPage(shell("Registrar avistamento", "Descreva o local aproximado e o momento da observação.", `<p class="notice">O envio sem conta ainda está indisponível. Você está entrando com sua conta para registrar esta pista.</p><form class="form" id="real-sighting-form" data-id="${esc(id)}"><label>Área aproximada *<input class="control" name="area_description" maxlength="200" required></label><label>Quando você viu o animal? *<input class="control" type="datetime-local" name="observed_at" value="${nowLocal()}" max="${nowLocal()}" required><span class="hint">Você pode informar qualquer data e horário anterior ao momento atual.</span></label><button type="button" class="btn secondary small" data-action="sighting-now">Vi o animal agora</button><label>Descrição *<textarea class="control" name="description" minlength="5" maxlength="2000" required></textarea></label><p class="hint">Não inclua endereço residencial ou dados de terceiros. Coordenadas exatas não serão coletadas neste formulário.</p><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Enviar avistamento</button></form>`, true), "Registrar avistamento");
  }
  function account() {
    const current = user();
    setPage(shell("Minha conta", "Sessão e funções autorizadas no Supabase.", `<dl class="account-details"><div><dt>Nome</dt><dd>${esc(current.name)}</dd></div><div><dt>E-mail</dt><dd>${esc(current.email)}</dd></div><div><dt>Situação</dt><dd>${current.status === "suspended" ? "Suspensa" : "Ativa"}</dd></div><div><dt>Funções</dt><dd>${esc(current.roles.join(", "))}</dd></div></dl>${current.roles.length > 1 ? `<label>Função ativa<select class="control" id="real-role">${current.roles.map((role) => `<option value="${esc(role)}" ${role === current.activeRole ? "selected" : ""}>${esc(role)}</option>`).join("")}</select></label>` : ""}<div class="actions"><a class="btn secondary" href="#esqueci-senha">Trocar senha por e-mail</a><button class="btn secondary" data-action="logout">Sair</button></div><p class="hint">Apenas funções concedidas no servidor podem ser usadas. O perfil Tutor é criado no cadastro.</p>`, true), "Minha conta");
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
    let { route, id } = routeInfo();
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
      chrome(route);
      if (route === "home") await home(ticket);
      else if (route === "pet") await detail(id, ticket);
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
    return next && /^#[a-z-]+(?:\/[a-z0-9-]+)?$/i.test(next) ? next : "#painel-tutor";
  }
  async function onSubmit(event) {
    const form = event.target;
    if (!form.id?.startsWith("real-")) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    await busy(form, async () => {
      if (form.id === "real-login") {
        await A.signIn(formValue(form, "email"), formValue(form, "password"));
        message("Entrada realizada.");
        navigate(returnAfterLogin());
      } else if (form.id === "real-registration") {
        const passwordValue = formValue(form, "password");
        if (passwordValue.length < 8 || passwordValue !== formValue(form, "passwordConfirmation")) throw Error("Confira a senha e a confirmação (mínimo de 8 caracteres).");
        verificationEmail = formValue(form, "email");
        const result = await A.signUp({ name: formValue(form, "name"), email: verificationEmail, password: passwordValue, passwordConfirmation: formValue(form, "passwordConfirmation"), roles: form.elements.collaborator.checked ? ["tutor", "colaborador"] : ["tutor"], activeRole: "tutor", acceptTerms: true, acceptPrivacy: true });
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
        message(uploadFailure ? `Animal salvo, mas uma foto não foi enviada: ${uploadFailure}` : "Animal salvo.");
        navigate(url("animal", row.id));
      } else if (form.id === "real-occurrence-form") {
        const amount = Number(formValue(form, "reward") || 0);
        if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw Error("Recompensa inválida.");
        const data = { pet_id: formValue(form, "pet_id") || null, city: formValue(form, "city"), region: formValue(form, "region"), public_reference: formValue(form, "public_reference"), last_seen_at: new Date(formValue(form, "last_seen_at")).toISOString(), description: formValue(form, "description"), reward_cents: Math.round(amount * 100) };
        if (!form.dataset.id) { data.type = formValue(form, "type"); data.visibility = formValue(form, "visibility"); }
        const selected = form.elements.photo.files?.[0];
        const file = selected ? await preparePhoto(selected) : null;
        const row = form.dataset.id ? await D.updateOccurrence(form.dataset.id, data) : await D.createOccurrence(data);
        if (!form.dataset.id && form.elements.reuse_pet_photos?.checked && data.pet_id) {
          try { await D.reusePetPhotosForOccurrence(data.pet_id, row.id); }
          catch (error) { notice = `Alerta salvo, mas as fotos do animal não foram reutilizadas: ${fail(error)}`; }
        }
        if (file) {
          try { await D.uploadOccurrencePhoto(row.id, file); }
          catch (error) { notice = `Alerta salvo, mas a foto não foi enviada: ${fail(error)}`; }
        }
        message(notice || "Alerta salvo.");
        notice = "";
        navigate(url("pet", row.id));
      } else if (form.id === "real-sighting-form") {
        const observed = new Date(formValue(form, "observed_at"));
        if (!Number.isFinite(observed.getTime()) || observed.getTime() > Date.now() + 60_000)
          throw Error("A data e a hora do avistamento não podem estar no futuro.");
        await D.createSighting({ occurrence_id: form.dataset.id, observed_at: observed.toISOString(), area_description: formValue(form, "area_description"), description: formValue(form, "description") });
        message("Avistamento registrado para o responsável.");
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
      if (action === "toggle-password") {
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
    if (event.target.id === "real-type") { filters.type = event.target.value; void render(); }
    if (event.target.id === "real-status") { filters.status = event.target.value; void render(); }
    if (event.target.id === "real-role") A.setActiveRole(event.target.value).then(() => {
      message("Função ativa atualizada.");
      void render();
    }).catch((error) => { message(fail(error)); void render(); });
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
