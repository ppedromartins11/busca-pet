/* Controlador e views da interface estática. */
(() => {
  "use strict";
  const S = window.BPStore,
    R = window.BPRules,
    A = window.BPAuth,
    C = window.BPConfig,
    Router = window.BPRouter,
    Storage = window.BPStorage,
    Images = window.BPImages,
    Views = window.BPViews,
    {
      $,
      $$,
      button,
      card,
      empty,
      escape,
      fmtDate,
      icon,
      localTime,
      money,
      normalize,
      page,
      photo,
      safeId,
      title,
    } = Views;
  const species = C.ui.species;
  const statuses = C.ui.reportStatuses;
  const decisionNames = C.ui.moderationDecisions;
  const reasons = C.ui.reportReasons;
  const roleNames = C.roles.names;
  const roleHomes = C.roles.homes;
  let mode = A.getActiveRole() || "visitante",
    filters = {
      q: "",
      species: "todos",
      type: "todos",
      region: "todos",
      status: "ativo",
    },
    reportFilter = "todas",
    timer;
  let loginNotice = "",
    verificationEmail = "";
  const actor = () => A.getCurrentUser()?.id || "";
  const stateNotice = () =>
    S.get().accounts.find((u) => u.id === actor())?.suspended
      ? '<div class="notice warn">Este perfil de demonstração está suspenso. Publicação e colaboração estão bloqueadas.</div>'
      : "";
  function toast(message) {
    clearTimeout(timer);
    $("#toast").textContent = message;
    timer = setTimeout(() => ($("#toast").textContent = ""), 5000);
    $("#storage-warning").textContent = S.issue();
  }
  function success(message) {
    toast(S.issue() ? message + " Apenas nesta sessão." : message);
  }
  function goto(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  function mount() {
    const root = $(".app-shell");
    root.insertAdjacentHTML(
      "afterbegin",
      `<header class="app-header"><a class="logo" href="#home" aria-label="BuscaPet, início">${icon("paw")}<span class="wordmark">Busca<strong>Pet</strong></span></a><div class="header-links"><a href="#services">Rede de apoio</a><a href="#sobre">Sobre o projeto</a><div id="role-control"></div></div></header><div class="demo-strip"><span>Protótipo local · autenticação simulada · não use dados reais</span><a id="account-link" href="#login">Entrar</a></div><div class="storage-warning" id="storage-warning" role="status"></div>`,
    );
    root.insertAdjacentHTML(
      "beforeend",
      `<nav class="main-nav" aria-label="Navegação principal"></nav>`,
    );
    $(".app-header").insertBefore($(".main-nav"), $(".header-links"));
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="toast" class="toast" role="status" aria-live="polite"></div><dialog id="dialog" class="dialog"></dialog>',
    );
    page(
      "map",
      `<div class="page narrow">${title("Busca por região", "O mapa geográfico faz parte da próxima sprint.")}<div class="map-empty">${icon("map")}<h2>Uma localização precisa precisa de dados reais.</h2><p>Esta versão permite informar bairros e pontos de referência. Ainda não coleta GPS nem calcula áreas prioritárias.</p><a class="btn primary" href="#home">Buscar alertas por região</a></div></div>`,
    );
    page(
      "services",
      `<div class="page narrow">${title("Rede de apoio", "A colaboração começa perto de casa.")}<div class="support-directory"><article>${icon("paw")}<h2>Clínicas e pet shops</h2><p>Podem ajudar a divulgar alertas e orientar quem encontrou um animal.</p></article><article>${icon("home")}<h2>Condomínios e comerciantes</h2><p>Podem observar a região e encaminhar pistas com local e horário.</p></article><article>${icon("heart")}<h2>Protetores e voluntários</h2><p>Podem ajudar a revisar informações e organizar verificações seguras.</p></article></div><div class="notice">Ainda não há parceiros cadastrados ou serviços de resgate nesta demonstração.</div><a class="btn primary" href="#home">Ver os alertas</a></div>`,
    );
  }
  function navLink(hash, nav, label, iconName, extra = "") {
    return `<a href="#${hash}" data-nav="${nav}" class="${extra}">${icon(iconName)}${label}</a>`;
  }
  function updateChrome(section) {
    const user = A.getCurrentUser();
    mode = A.getActiveRole() || "visitante";
    let links = [navLink("home", "home", "Início", "home")];
    if (!user) {
      links.push(
        navLink("services", "services", "Rede de apoio", "heart"),
        navLink("login", "login", "Entrar", "user"),
      );
    } else if (mode === "tutor") {
      links.push(
        navLink("painel-tutor", "painel-tutor", "Área do tutor", "paw"),
        navLink("post", "post", "Publicar", "plus", "post-link"),
        navLink("favoritos", "favoritos", "Favoritos", "heart"),
        navLink("minha-conta", "perfil", "Minha conta", "user"),
      );
    } else if (mode === "colaborador") {
      links.push(
        navLink(
          "painel-colaborador",
          "painel-colaborador",
          "Colaboração",
          "paw",
        ),
        navLink("favoritos", "favoritos", "Salvos", "heart"),
        navLink("minha-conta", "perfil", "Minha conta", "user"),
      );
    } else if (mode === "parceiro") {
      links.push(
        navLink("painel-parceiro", "painel-parceiro", "Organização", "paw"),
        navLink("services", "services", "Rede de apoio", "heart"),
        navLink("minha-conta", "perfil", "Minha conta", "user"),
      );
    } else if (mode === "moderador") {
      links.push(
        navLink("admin", "admin", "Moderação", "paw"),
        navLink("minha-conta", "perfil", "Minha conta", "user"),
      );
    } else {
      links.push(navLink("minha-conta", "perfil", "Minha conta", "user"));
    }
    $(".main-nav").innerHTML = links.join("");
    const roleControl = $("#role-control");
    if (!user) roleControl.innerHTML = '<a href="#login">Entrar</a>';
    else if (user.roles.length > 1)
      roleControl.innerHTML = `<label class="role-switch-label">Usando como:<select id="role-switch" aria-label="Função ativa">${user.roles
        .map(
          (role) =>
            `<option value="${role}" ${role === mode ? "selected" : ""}>${roleNames[role]}</option>`,
        )
        .join("")}</select></label>`;
    else
      roleControl.innerHTML = `<span class="mode-pill">${roleNames[mode] || "Conta"}</span>`;
    const accountLink = $("#account-link");
    accountLink.href = user ? "#minha-conta" : "#login";
    accountLink.textContent = user ? "Minha conta" : "Entrar";
    $$(".main-nav a").forEach((link) => {
      const active =
        link.dataset.nav === section ||
        (link.dataset.nav === "post" &&
          ["publicar", "editar"].includes(section)) ||
        (link.dataset.nav === "perfil" &&
          ["perfil", "minha-conta", "denuncias"].includes(section));
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
    });
  }
  function renderLimited(meta) {
    const allowed = (meta.roles || []).filter((role) => A.hasRole(role));
    page(
      "acesso-limitado",
      `<div class="page narrow">${empty(
        "Acesso limitado",
        "Esta página não está disponível para a função ativa.",
      )}${allowed.length ? `<p class="notice">Sua conta tem uma função compatível. Troque a área ativa para continuar.</p><div class="actions">${allowed.map((role) => button(`Usar como ${roleNames[role]}`, "switch-role", role, "primary")).join("")}</div>` : '<p class="notice warn">Sua conta não possui uma das funções necessárias para esta área.</p>'}<a class="btn secondary" href="#minha-conta">Ver funções da conta</a></div>`,
    );
  }
  function render() {
    Images.beginRoute();
    for (const old of $$("#alert-form, #sighting-form")) old.remove();
    const { route, key } = Router.parse(location.hash);
    let section = route;
    const routeAccess = Router.access(route);
    if (routeAccess.status === "login") {
      if (routeAccess.expired)
        loginNotice = "Sua sessão expirou. Entre novamente para continuar.";
      Router.remember(location.hash);
      if (location.hash !== "#login") return goto("#login");
    }
    if (routeAccess.status === "verify-email") {
      if (location.hash !== "#verificar-email") return goto("#verificar-email");
    }
    if (routeAccess.status === "limited") {
      section = "acesso-limitado";
      renderLimited(routeAccess.meta);
    } else if (route === "login") {
      section = "login";
      renderLogin();
    } else if (route === "registro") {
      section = "registro";
      renderRegistration();
    } else if (route === "esqueci-senha") {
      section = "esqueci-senha";
      renderForgotPassword();
    } else if (route === "redefinir-senha") renderResetPassword(key || "valid");
    else if (route === "verificar-email") renderVerifyEmail();
    else if (route === "painel-tutor") renderTutorDashboard();
    else if (route === "painel-colaborador") renderCollaboratorDashboard();
    else if (route === "painel-parceiro") renderPartnerDashboard();
    else if (["home", "favoritos"].includes(route))
      renderHome(route === "favoritos");
    else if (route === "pet") renderDetail(key);
    else if (route === "operacao") renderOperation(key);
    else if (route === "cartaz") renderPoster(key);
    else if (route === "post") renderPost();
    else if (route === "publicar") renderForm(key || "perdido");
    else if (route === "editar") renderForm("", key);
    else if (["perfil", "minha-conta"].includes(route)) {
      section = route;
      renderProfile();
    } else if (route === "avistamento") renderSighting(key);
    else if (route === "denunciar") renderReport(key);
    else if (route === "denuncias") renderReports();
    else if (route === "admin") renderAdmin();
    else if (window.BPLegal[route])
      page(
        route,
        `<div class="page narrow"><a href="#perfil" class="back-link">‹ Minha área</a><article class="legal">${window.BPLegal[route]}</article></div>`,
      );
    else if (!["map", "services"].includes(route)) {
      section = "home";
      renderHome(false);
    }
    $$(".screen").forEach((el) => {
      el.classList.toggle("current", el.id === section);
      el.hidden = el.id !== section;
    });
    const current = document.getElementById(section);
    if (current) {
      current.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const h = $("h1", current);
      if (h) {
        h.setAttribute("tabindex", "-1");
        h.focus({ preventScroll: true });
      }
    }
    updateChrome(section);
    $$(".data-table").forEach((table) => {
      const headings = $$("thead th", table).map((cell) => cell.textContent);
      $$("tbody tr", table).forEach((row) => {
        $$("td", row).forEach(
          (cell, index) => (cell.dataset.label = headings[index] || ""),
        );
      });
    });
    $("#storage-warning").textContent = S.issue() || A.issue();
    document.title =
      "BuscaPet | " +
      ({
        home: "Alertas",
        perfil: "Minha área",
        "minha-conta": "Minha conta",
        login: "Entrar",
        registro: "Criar conta",
        admin: "Moderação",
        post: "Publicar",
      }[section] || "Protótipo funcional");
  }
  function renderHome(favorites) {
    const other = document.getElementById(favorites ? "home" : "favoritos");
    if (other) other.innerHTML = "";
    const regions = [
      ...new Set(
        S.get()
          .alerts.filter((a) => a.visibility === "visivel")
          .map((a) => a.region),
      ),
    ].sort();
    page(
      favorites ? "favoritos" : "home",
      `
      <div class="page catalog-page">
        ${favorites ? title("Seus favoritos", "Acompanhe os alertas que você salvou neste navegador.") : `<div class="search-hero"><div class="hero-copy"><h1 tabindex="-1">Vamos trazer seu pet de volta.</h1><p>Reúna as pistas. Organize a busca.<br>Conte com quem está por perto.</p><div class="hero-actions"><a class="btn primary" href="#publicar/perdido">${icon("paw")} Meu pet sumiu</a><a class="btn secondary" href="#publicar/encontrado">Encontrei um pet</a></div><a class="hero-help" href="#home" data-action="show-alerts">Vi um animal parecido. Quero ajudar.</a></div><figure class="hero-pet"><img src="assets/hex.png" alt="Hex, cão usado no exemplo da demonstração" fetchpriority="high"><figcaption>${icon("pin")}<span><b>Cada pista tem um lugar.</b><small>Foto de exemplo do projeto</small></span></figcaption></figure></div><div class="catalog-heading" id="alertas"><div><h2>Uma atenção a mais pela vizinhança.</h2><p>Abra um alerta para conferir as características e registrar uma pista.</p></div></div>`}
        ${stateNotice()}
        <div class="browse-layout">
          <aside class="browse-sidebar" aria-label="Busca e filtros">
            <label class="search">${icon("search")}<span class="sr-only">Buscar alertas</span><input id="query" value="${escape(filters.q)}" placeholder="Nome, raça ou cidade..."></label>
            <details class="filters-panel" id="filter-details" ${window.matchMedia?.("(min-width: 1024px)").matches ? "open" : ""}>
              <summary>Filtrar alertas <span>${icon("chevron")}</span></summary>
              <div class="filter-controls">
                <label>Tipo de alerta<select id="filter-type" aria-label="Tipo de alerta">${[
                  ["todos", "Todos os alertas"],
                  ["perdido", "Perdidos"],
                  ["encontrado", "Encontrados"],
                ]
                  .map(
                    ([v, n]) =>
                      `<option value="${v}" ${filters.type === v ? "selected" : ""}>${n}</option>`,
                  )
                  .join("")}</select></label>
                <label>Região<select id="filter-region" aria-label="Região"><option value="todos">Todas as regiões</option>${regions.map((r) => `<option ${filters.region === r ? "selected" : ""}>${escape(r)}</option>`).join("")}</select></label>
                <label>Situação<select id="filter-status" aria-label="Situação"><option value="ativo" ${filters.status === "ativo" ? "selected" : ""}>Em busca</option><option value="reencontrado" ${filters.status === "reencontrado" ? "selected" : ""}>Reencontrados</option><option value="encerrado" ${filters.status === "encerrado" ? "selected" : ""}>Todas as encerradas</option><option value="todos" ${filters.status === "todos" ? "selected" : ""}>Todas as situações</option></select></label>
                <button class="plain clear-filters" data-action="clear-filters">Limpar filtros</button>
              </div>
            </details>
            <div class="support-note"><b>Você pode fazer a diferença.</b><p>Viu um pet parecido? Abra o alerta e registre uma pista.</p><a href="#services">Conhecer a rede de apoio</a></div>
          </aside>
          <div class="browse-results">
            <div class="catalog-toolbar"><div class="chips" role="group" aria-label="Filtrar por espécie">${[
              ["todos", "Todos"],
              ["cao", "Cães"],
              ["gato", "Gatos"],
              ["outro", "Outros"],
            ]
              .map(
                ([v, n]) =>
                  `<button data-filter-species="${v}" class="${filters.species === v ? "on" : ""}" aria-pressed="${filters.species === v}">${n}</button>`,
              )
              .join(
                "",
              )}</div><span id="result-count" role="status" aria-live="polite"></span></div>
            <div id="results" class="list alert-grid"></div>
          </div>
        </div>
      </div>`,
    );
    updateResults(favorites);
  }
  function updateResults(favorites = location.hash.startsWith("#favoritos")) {
    const s = S.get(),
      q = normalize(filters.q);
    const alerts = s.alerts.filter(
      (a) =>
        a.visibility === "visivel" &&
        (!favorites || s.favorites.includes(a.id)) &&
        (filters.species === "todos" || a.species === filters.species) &&
        (filters.type === "todos" || a.type === filters.type) &&
        (filters.status === "todos" ||
          (filters.status === "encerrado"
            ? a.status !== "ativo"
            : a.status === filters.status)) &&
        (filters.region === "todos" || a.region === filters.region) &&
        normalize(
          [a.name, a.breed, a.city, a.region, a.place].join(" "),
        ).includes(q),
    );
    $("#results").innerHTML = alerts.length
      ? alerts.map(card).join("")
      : empty(
          "Nenhum alerta por aqui",
          "Altere os filtros ou publique um novo alerta.",
        );
    $("#result-count").textContent =
      alerts.length +
      (alerts.length === 1 ? " alerta encontrado" : " alertas encontrados");
  }
  function renderDetail(key) {
    const s = S.get(),
      a = s.alerts.find((x) => x.id === key),
      own = a?.ownerId === actor() && mode === "tutor";
    if (!a || (a.visibility !== "visivel" && !own && mode !== "moderador"))
      return page(
        "pet",
        `<div class="page">${empty("Publicação indisponível", "O alerta não existe ou está indisponível pela moderação.")}<a class="btn secondary" href="#home">Voltar aos alertas</a></div>`,
      );
    const coordinated = mode !== "moderador" && S.canCoordinate(key, actor());
    const sightings = coordinated
      ? s.sightings.filter((x) => x.alertId === key)
      : [];
    const active = a.status === "ativo" && a.visibility === "visivel";
    page(
      "pet",
      `<div class="page"><a class="back-link" href="#home">‹ Voltar aos alertas</a><div class="detail-layout"><div>${photo(a, "detail-photo")}<div class="actions">${button(s.favorites.includes(key) ? icon("heart") + " Favoritado" : icon("heart") + " Salvar favorito", "favorite", key)}${a.visibility === "visivel" ? `<a class="btn secondary" href="#denunciar/${safeId(key)}">Denunciar</a>` : ""}</div>${a.demo ? '<p class="hint">Este animal e este alerta são exemplos fictícios.</p>' : ""}</div><div><div class="fact-line"><span class="tag ${a.type === "encontrado" ? "found" : ""}">${a.type === "perdido" ? "Pet perdido" : "Pet encontrado"}</span><span class="tag ${a.status === "reencontrado" ? "resolved" : ""}">${a.status !== "ativo" ? escape(R.outcomes[a.status]) : "Em busca"}</span></div><h1>${escape(a.name)}</h1><div class="tags"><span class="tag">${species[a.species]}</span><span class="tag">${escape(a.breed || "Raça não informada")}</span>${a.age ? `<span class="tag">${escape(a.age)}</span>` : ""}</div>${a.visibility !== "visivel" ? '<div class="notice warn">Publicação ' + (a.visibility === "oculto" ? "oculta" : "removida") + ' da lista pública pela moderação. <a href="#denuncias">Ver decisão e contestar</a></div>' : ""}<div class="detail"><div><span class="ico">${icon("pin")}</span><p><small>Local aproximado</small><b>${escape(a.region)} · ${escape(a.city)}</b><small>${escape(a.place)}</small></p></div><div><span class="ico">${icon("calendar")}</span><p><small>${a.type === "perdido" ? "Última vez visto" : "Encontrado em"}</small><b>${fmtDate(a.seenDate)}</b></p></div>${a.reward > 0 ? `<div><span class="ico">${icon("reward")}</span><p><small>Recompensa informada pelo autor</small><b>${money(a.reward)}</b></p></div>` : ""}</div><h2 class="section-heading">Características e informações</h2><p class="desc">${escape(a.description)}</p>${a.contactPublic && a.contact ? `<div class="notice contact-value"><b>Contato informado</b><br>${escape(a.contact)}<br><small>Informação fornecida pelo autor. Não faça pagamentos antecipados por pistas.</small></div>` : '<p class="hint">O autor não divulgou contato. Registre uma pista no próprio alerta.</p>'}<div class="actions">${active ? `<a class="btn primary" href="#avistamento/${safeId(key)}">Registrar avistamento</a>` : ""}${own && a.visibility === "visivel" ? `<a class="btn secondary" href="#editar/${safeId(key)}">Editar alerta</a>` : ""}${coordinated ? `<a class="btn primary" href="#operacao/${safeId(key)}">Abrir central da busca</a>` : ""}${own && a.status === "ativo" ? button("Encerrar busca", "resolve", key) : ""}<a class="btn secondary" href="#cartaz/${safeId(key)}">Cartaz</a></div>${a.resolvedAt ? `<div class="notice">${escape(R.outcomes[a.status])} · ${fmtDate(a.resolvedAt, true)}.</div>` : ""}</div></div><h2 class="section-heading">Avistamentos <span class="count-line">(${sightings.length})</span></h2><div class="timeline">${sightings.length ? sightings.map((v) => `<article><b>${icon("pin")} ${escape(v.place)}</b><p>${escape(v.description)}</p><small>Visto em ${fmtDate(v.seenAt, true)} · registrado em ${fmtDate(v.createdAt, true)}</small></article>`).join("") : '<p class="hint">As pistas detalhadas ficam na central do responsável e dos colaboradores habilitados. Você pode enviar um avistamento sem acessar a central.</p>'}</div></div>`,
    );
  }
  function renderPost() {
    page(
      "post",
      `<div class="page narrow"><p class="eyebrow">Uma informação pode ajudar</p>${title("Encontrou ou perdeu um pet?", "Escolha o tipo de alerta para começar.")}${stateNotice()}<div class="choices"><a class="choice" href="#publicar/perdido"><span class="choiceicon">${icon("paw")}</span><div><h3>Perdi meu pet</h3><p>Informe características e o último local visto.</p></div><b>›</b></a><a class="choice" href="#publicar/encontrado"><span class="choiceicon">${icon("heart")}</span><div><h3>Encontrei um pet</h3><p>Ajude a localizar a pessoa responsável.</p></div><b>›</b></a></div><div class="notice">Use a região ou um ponto de referência. Evite endereço residencial e dados pessoais de terceiros.</div></div>`,
    );
  }
  function draftKey(form) {
    return C.storage.draftPrefix +
      (form.dataset.id || form.elements.type?.value || "perdido");
  }
  function saveDraft(form) {
    if (form?.id !== "alert-form") return;
    const data = {};
    for (const field of form.elements) {
      if (field.name && !["file", "checkbox", "submit"].includes(field.type))
        data[field.name] = field.value;
    }
    if (Storage.writeJSON(sessionStorage, draftKey(form), data).ok) {
      form.querySelector(".draft-state").textContent =
        "Texto salvo nesta aba. Reanexe a foto e confirme as autorizações ao voltar.";
    } else {
      form.querySelector(".draft-state").textContent =
        "Não foi possível salvar o rascunho. Mantenha esta página aberta.";
    }
  }
  function restoreDraft(form) {
    if (!form) return;
    const restored = Storage.readJSON(sessionStorage, draftKey(form));
    if (!restored.ok || !restored.value) return;
    const data = restored.value;
    try {
      for (const field of form.elements)
        if (
          Object.hasOwn(data, field.name) &&
          !["file", "checkbox", "hidden"].includes(field.type)
        )
          field.value = String(data[field.name]);
      form.querySelector(".draft-state").textContent =
        "Rascunho de texto recuperado nesta aba. Revise os campos e reanexe a foto, se necessário.";
    } catch {
      /* Um rascunho inválido nunca impede abrir o formulário. */
    }
  }
  function clearDraft(form) {
    Storage.remove(sessionStorage, draftKey(form));
  }
  function renderOperation(key) {
    const s = S.get(),
      a = s.alerts.find((a) => a.id === key);
    if (mode === "moderador" || !S.canCoordinate(key, actor()))
      return page(
        "operacao",
        `<div class="page narrow">${empty("Acesso à central", "Abra o perfil responsável ou um colaborador incluído nesta busca. Os papéis são simulados neste navegador.")}<a href="#perfil" class="btn primary">Minha área</a></div>`,
      );
    const own = a.ownerId === actor(),
      active = a.status === "ativo",
      editable = own && active;
    const sightings = s.sightings
      .filter((v) => v.alertId === key)
      .sort((a, b) => new Date(b.seenAt) - new Date(a.seenAt));
    const tasks = s.tasks.filter((t) => t.alertId === key),
      members = s.accounts.filter(
        (u) => S.canCoordinate(key, u.id) && !u.suspended,
      );
    const options = (object, selected) =>
      Object.entries(object)
        .map(
          ([v, label]) =>
            `<option value="${v}" ${selected === v ? "selected" : ""}>${label}</option>`,
        )
        .join("");
    const taskHTML = tasks
      .map(
        (t) =>
          `<article class="task-card"><span class="tag">${R.taskStates[t.status]}</span><h3>${escape(t.title)}</h3><p>${escape(t.place)}</p><p class="hint">Responsável: ${escape(s.accounts.find((u) => u.id === t.assigneeId)?.name || "Indisponível")}${t.sightingId ? " · Vinculada a uma pista" : ""}</p>${t.result ? `<p><b>Resultado:</b> ${escape(t.result)}</p><p><b>Método:</b> ${escape(t.method || "Não informado")}</p><small>${fmtDate(t.updatedAt, true)}</small>` : ""}${active && !["concluida", "cancelada"].includes(t.status) && (own || t.assigneeId === actor()) ? `<form class="form task-update-form" data-id="${escape(t.id)}"><label>Situação<select class="control" name="status">${options(R.taskStates, t.status)}</select></label><label>Como verificou?<input class="control" name="method" maxlength="120" placeholder="Ex.: observação da calçada, sem entrar no imóvel"></label><label>Resultado<textarea class="control" name="result" maxlength="600" placeholder="Necessário ao concluir ou cancelar. Não avistar não significa ausência."></textarea></label><div class="form-error" role="alert"></div><button class="btn secondary">Salvar tarefa</button></form>` : ""}</article>`,
      )
      .join("");
    const sightHTML = sightings
      .map(
        (v) =>
          `<article class="sighting-card"><div class="fact-line"><span class="tag">${R.reviews[v.review] || "A revisar"}</span><span class="tag">${v.source === "encaminhada" ? "Recebida de outra pessoa" : v.source === "direta" ? "Observação direta" : "Origem não informada"}</span></div><h3>${escape(v.place)}</h3><p>${escape(v.description)}</p><small>Visto em ${fmtDate(v.seenAt, true)}${v.timeApproximate ? " (aproximado)" : ""}<br>Registrado em ${fmtDate(v.createdAt, true)}</small>${v.image ? photo({ image: v.image, name: "avistamento" }, "sighting-photo") : ""}${v.reviewReason ? `<p><b>Revisão:</b> ${escape(v.reviewReason)}</p>` : ""}${v.duplicateOf ? `<p class="hint">Origem: ${escape(sightings.find((x) => x.id === v.duplicateOf)?.place || "Pista indisponível")}</p>` : ""}${
            editable
              ? `<details><summary>Revisar esta pista</summary><form class="form sighting-review-form" data-id="${escape(v.id)}"><label>Classificação<select class="control" name="review">${options(R.reviews, v.review)}</select></label><label>Pista original, se duplicada<select class="control" name="duplicateOf"><option value="">Selecione se necessário</option>${sightings
                  .filter((x) => x.id !== v.id && x.review !== "duplicada")
                  .map(
                    (x) =>
                      `<option value="${escape(x.id)}" ${x.id === v.duplicateOf ? "selected" : ""}>${escape(x.place)} · ${fmtDate(x.seenAt, true)}</option>`,
                  )
                  .join(
                    "",
                  )}</select></label><label>Justificativa<textarea class="control" name="reason" required minlength="5" maxlength="600">${escape(v.reviewReason)}</textarea></label><div class="form-error" role="alert"></div><button class="btn secondary">Salvar revisão</button></form></details>`
              : ""
          }</article>`,
      )
      .join("");
    page(
      "operacao",
      `<div class="page operation-page"><a class="back-link" href="#pet/${safeId(key)}">‹ Voltar ao alerta</a><p class="eyebrow">Central da busca</p>${title(escape(a.name), active ? "Organize pistas e decida a próxima verificação." : R.outcomes[a.status])}${stateNotice()}<div class="stats"><div><b>${sightings.filter((v) => v.review === "pendente").length}</b><span>Pistas a revisar</span></div><div><b>${tasks.filter((t) => t.status === "concluida").length} / ${tasks.length}</b><span>Tarefas concluídas</span></div><div><b>${members.length}</b><span>Perfis habilitados</span></div></div><div class="notice">Uma pista compatível não confirma a identidade. Uma tarefa concluída não garante que a área esteja sem o animal. Dados e colaboração simulados neste navegador.</div><div class="actions">${active ? `<a class="btn primary" href="#avistamento/${safeId(key)}">Eu vi este animal</a>` : ""}${own ? button(active ? "Encerrar busca" : "Reabrir busca", active ? "resolve" : "reopen", key) : ""}<a class="btn secondary" href="#cartaz/${safeId(key)}">Cartaz de demonstração</a></div>${editable && actor() === "local" ? `<div class="participant-panel"><h2>Colaboração</h2><p>Habilite o perfil Colaborador desta demonstração para acessar pistas e executar tarefas. Nenhum convite será enviado.</p>${button(s.participations.some((p) => p.alertId === key && p.userId === "community") ? "Revogar colaborador de demonstração" : "Incluir colaborador de demonstração", "participant", key)}</div>` : ""}${a.resolutionNote ? `<div class="notice"><b>Encerramento:</b> ${escape(a.resolutionNote)} · ${fmtDate(a.resolvedAt, true)}</div>` : ""}<div class="operation-columns"><section><h2>Pistas e evidências</h2><p class="hint">Ordenadas pelo momento observado, sem percentual de confiança.</p>${sightHTML || empty("Nenhuma pista", "Use o botão Eu vi este animal para testar um relato.")}</section><section><h2>Próximas verificações</h2>${editable ? `<details class="new-task" open><summary>Criar tarefa</summary><form class="form" id="task-form" data-id="${escape(key)}">${field("O que verificar? *", "title", "", 'required minlength="5" maxlength="100" placeholder="Ex.: perguntar ao porteiro sobre um avistamento"')}${field("Local aproximado *", "place", "", 'required maxlength="120"')}<label>Responsável<select class="control" name="assigneeId">${members.map((u) => `<option value="${escape(u.id)}">${escape(u.name)}</option>`).join("")}</select></label><label>Pista relacionada<select class="control" name="sightingId"><option value="">Sem pista específica</option>${sightings.map((v) => `<option value="${escape(v.id)}">${escape(v.place)} · ${fmtDate(v.seenAt, true)}</option>`).join("")}</select></label><p class="hint">Combine ações seguras. Não entre em imóveis sem autorização nem persiga o animal.</p><div class="form-error" role="alert"></div><button class="btn primary">Criar tarefa</button></form></details>` : ""}<div class="task-list">${taskHTML || '<p class="hint">Nenhuma tarefa registrada.</p>'}</div></section></div><details class="operation-history"><summary>Histórico da operação</summary><div class="timeline">${
        s.audit
          .filter((e) => e.target === key)
          .map(
            (e) =>
              `<article><b>${escape(e.action)}</b><p>${escape(e.reason)}</p><small>${fmtDate(e.at, true)}</small></article>`,
          )
          .join("") || '<p class="hint">Sem alterações registradas.</p>'
      }</div></details></div>`,
    );
  }
  function renderPoster(key) {
    const a = S.get().alerts.find(
      (a) => a.id === key && a.visibility === "visivel",
    );
    if (!a)
      return page(
        "cartaz",
        `<div class="page">${empty("Alerta indisponível", "Volte à lista de alertas.")}</div>`,
      );
    page(
      "cartaz",
      `<div class="page narrow"><div class="poster-actions"><a class="back-link" href="#pet/${safeId(key)}">‹ Voltar ao alerta</a><p class="notice">Prévia para impressão. Sem link público ou contato: os registros ainda não são compartilhados entre dispositivos.</p>${button("Imprimir / salvar PDF", "print-poster")}</div><article class="print-poster"><p class="eyebrow">BuscaPet · material fictício de demonstração</p><h1>${a.status !== "ativo" ? escape(R.outcomes[a.status]) : a.type === "perdido" ? "VOCÊ VI ESTE PET?" : "VOCÊ CONHECE ESTE PET?"}</h1>${photo(a, "poster-photo")}<h2>${escape(a.name)}</h2><p><strong>${escape(a.region)} · ${escape(a.city)}</strong></p><p>${fmtDate(a.seenDate)}</p><p>${escape(a.description)}</p><p class="poster-footer">DEMONSTRAÇÃO ACADÊMICA — não é um alerta público.<br>Não faça pagamentos antecipados por pistas.</p></article></div>`,
    );
  }
  function field(label, name, value = "", extra = "", type = "text") {
    return `<label>${label}<input class="control" name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  }
  function renderForm(type, key = "") {
    const other = document.getElementById(key ? "publicar" : "editar");
    if (other) other.innerHTML = "";
    const a = key ? S.get().alerts.find((x) => x.id === key) : null;
    if (
      mode !== "tutor" ||
      (key && (!a || a.ownerId !== actor() || a.visibility !== "visivel"))
    )
      return page(
        key ? "editar" : "publicar",
        `<div class="page narrow">${empty("Perfil de tutor necessário", "A publicação e a edição pertencem ao tutor de demonstração.")}<a class="btn primary" href="#perfil">Abrir Minha área</a></div>`,
      );
    type =
      a?.type || (["perdido", "encontrado"].includes(type) ? type : "perdido");
    Images.set(a?.image || "");
    const account = S.get().accounts.find((item) => item.id === actor());
    page(
      key ? "editar" : "publicar",
      `<div class="page narrow form-page"><a href="#post" class="back-link">‹ Voltar</a>${title(key ? "Editar alerta" : type === "perdido" ? "Meu pet desapareceu" : "Encontrei um pet", "Os campos com * são obrigatórios.")}${stateNotice()}<form class="form" id="alert-form" data-id="${escape(key)}"><p class="draft-state" role="status">O texto será salvo nesta aba enquanto você preenche.</p><input type="hidden" name="type" value="${type}"><div class="form-grid">${field("Nome ou identificação *", "name", a?.name || "", 'required maxlength="60" placeholder="Ex.: Luna ou Cão caramelo"')}<label>Espécie *<select class="control" name="species" required>${Object.entries(
        species,
      )
        .map(
          ([v, n]) =>
            `<option value="${v}" ${a?.species === v ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label>${field("Raça ou aparência", "breed", a?.breed || "", 'maxlength="60" placeholder="Ex.: sem raça definida"')}${field("Idade aproximada", "age", a?.age || "", 'maxlength="25" placeholder="Ex.: 2 anos"')}${field("Cidade / UF *", "city", a?.city || "Campo Grande - MS", 'required maxlength="80" placeholder="Ex.: Campo Grande - MS"')}${field("Bairro ou região *", "region", a?.region || "", 'required maxlength="60" placeholder="Ex.: Centro"')}${field("Ponto de referência *", "place", a?.place || "", 'required maxlength="120" placeholder="Use um local aproximado"')}${field("Data em que foi visto *", "seenDate", a?.seenDate || S.today(), `required max="${S.today()}"`, "date")}<label class="full">Descrição e características *<textarea class="control" name="description" required minlength="10" maxlength="1200" placeholder="Cor, coleira, comportamento e informações que ajudem na identificação">${escape(a?.description || "")}</textarea></label>${field("Recompensa opcional (R$)", "reward", a?.reward || "", 'min="0" max="1000000" step="0.01" placeholder="0,00"', "number")}${field("Contato fictício opcional", "contact", a?.contact || "", 'maxlength="100" placeholder="Somente para testar a apresentação"')}<label class="check-label full"><input type="checkbox" name="contactPublic" ${a?.contactPublic ? "checked" : ""}><span>Quero mostrar o contato informado no alerta.<span class="hint">A escolha é opcional. Para o protótipo, informe apenas dados fictícios.</span></span></label><label class="full">Foto opcional<input class="control" type="file" id="photo-input" accept="image/jpeg,image/png,image/webp"><span class="hint">JPG, PNG ou WebP, até 8 MB. A foto será reduzida e salva neste navegador.</span><img class="photo-preview" id="photo-preview" alt="Prévia da foto" ${Images.get() ? `src="${escape(Images.get())}"` : "hidden"}></label><div class="full">${button("Remover foto", "remove-photo", "", "secondary small")}</div></div><label class="check-label"><input type="checkbox" name="contentRights" required><span>Confirmo que posso usar a foto e as informações e que não estou expondo dados de terceiros indevidamente.</span></label>${!key && account?.acceptedVersion !== S.POLICY_VERSION ? '<label class="check-label"><input type="checkbox" name="acceptTerms" required><span>Aceito os <a href="#termos" target="_blank">Termos de Uso</a> e li a <a href="#privacidade" target="_blank">Política de Privacidade</a> da demonstração.</span></label>' : ""}<div class="form-error" role="alert"></div><div class="actions"><button class="btn primary" type="submit">${key ? "Salvar alterações" : "Publicar alerta"}</button><a class="btn secondary" href="#home">Voltar depois</a>${button("Descartar rascunho", "discard-draft")}</div></form></div>`,
    );
    restoreDraft($("#alert-form"));
  }
  function renderSighting(key) {
    const a = S.get().alerts.find(
      (x) => x.id === key && x.status === "ativo" && x.visibility === "visivel",
    );
    if (!a)
      return page(
        "avistamento",
        `<div class="page">${empty("Alerta indisponível", "Este alerta não recebe novas pistas.")}<a href="#home">Voltar</a></div>`,
      );
    Images.set("");
    page(
      "avistamento",
      `<div class="page narrow"><a class="back-link" href="#pet/${safeId(key)}">‹ ${escape(a.name)}</a>${title("Viu este pet?", "Informe o local aproximado e o momento do avistamento.")}${stateNotice()}<form class="form" id="sighting-form" data-id="${escape(key)}"><label>Origem da pista<select class="control" name="source"><option value="direta">Eu vi pessoalmente</option><option value="encaminhada">Recebi de outra pessoa</option></select></label>${field("Local aproximado *", "place", "", 'required maxlength="120" placeholder="Ex.: perto da praça do Centro"')}${field("Data e hora *", "seenAt", localTime(), `required max="${localTime()}"`, "datetime-local")}<label class="check-label"><input type="checkbox" name="timeApproximate"><span>O horário informado é aproximado.</span></label><label>Observação *<textarea class="control" name="description" required minlength="5" maxlength="600" placeholder="O que você viu? Evite dados pessoais de terceiros."></textarea></label><label>Foto opcional<input class="control" type="file" id="photo-input" accept="image/jpeg,image/png,image/webp"><span class="hint">Use imagem autorizada, até 8 MB. Ela será reduzida neste navegador.</span><img class="photo-preview" id="photo-preview" alt="Prévia da pista" hidden></label>${button("Remover foto", "remove-photo")}<p class="notice">Esta pista será registrada somente neste navegador. Nenhuma notificação será enviada.</p><div class="form-error" role="alert"></div><button class="btn primary">Registrar pista</button></form></div>`,
    );
  }
  function renderReport(key) {
    const a = S.get().alerts.find(
      (x) => x.id === key && x.visibility === "visivel",
    );
    if (!a)
      return page(
        "denunciar",
        `<div class="page">${empty("Publicação indisponível", "Volte à lista de alertas.")}<a href="#home">Voltar</a></div>`,
      );
    page(
      "denunciar",
      `<div class="page narrow"><a class="back-link" href="#pet/${safeId(key)}">‹ ${escape(a.name)}</a>${title("Denunciar publicação", "Descreva o problema para que a moderação possa avaliar.")}<div class="notice">A denúncia gera um registro local. Ela não remove automaticamente a publicação e não é enviada a autoridades.</div><form class="form" id="report-form" data-id="${escape(key)}"><label>Motivo *<select class="control" name="category" required><option value="">Selecione</option>${reasons.map((r) => `<option>${r}</option>`).join("")}</select></label><label>O que aconteceu? *<textarea class="control" name="description" required minlength="10" maxlength="1000" placeholder="Explique o problema sem incluir dados pessoais desnecessários."></textarea></label><div class="form-error" role="alert"></div><button class="btn primary">Enviar denúncia</button></form></div>`,
    );
  }
  function reportCard(r, admin = false) {
    const a = S.get().alerts.find((x) => x.id === r.alertId);
    return `<article class="report-card"><div class="page-title"><div><h3>${escape(a?.name || "Alerta indisponível")} · ${escape(r.category)}</h3><div class="meta">Protocolo ${escape(r.id.slice(-8))} · ${fmtDate(r.createdAt, true)}</div></div><span class="report-status">${statuses[r.status]}</span></div><p>${escape(r.description)}</p>${r.reason ? `<div class="notice"><b>${escape(decisionNames[r.decision] || "Última análise")}</b><br>${escape(r.reason)}</div>` : ""}${r.appeal ? `<p><b>Contestação:</b> ${escape(r.appeal)}</p>` : ""}<div class="actions">${a ? `<a href="#pet/${safeId(a.id)}" class="btn secondary small">Consultar publicação</a>` : ""}${!admin && r.status === "concluida" ? button("Contestar decisão", "appeal", r.id, "secondary small") : ""}</div>${admin && r.status !== "concluida" ? `<form class="form moderation-form" data-id="${escape(r.id)}"><label>Medida<select class="control" name="decision"><option value="analisar">Marcar em análise</option><option value="manter">Manter / restaurar publicação</option><option value="ocultar">Ocultar publicação</option><option value="remover">Remover publicação da lista</option></select></label><label>Justificativa *<textarea class="control" name="reason" required minlength="10" maxlength="800" placeholder="Explique a decisão. Ela ficará visível às partes envolvidas."></textarea></label><div class="form-error" role="alert"></div><button class="btn primary">Registrar decisão</button></form>` : ""}${r.history.length ? `<details><summary>Histórico da denúncia</summary><div class="timeline">${r.history.map((h) => `<article><b>${escape(decisionNames[h.action] || "Contestação")}</b><p>${escape(h.reason)}</p><small>${fmtDate(h.at, true)}</small></article>`).join("")}</div></details>` : ""}</article>`;
  }
  function renderReports() {
    const s = S.get(),
      list = s.reports.filter(
        (r) =>
          r.by === actor() ||
          s.alerts.find((a) => a.id === r.alertId)?.ownerId === actor(),
      );
    page(
      "denuncias",
      `<div class="page narrow"><a class="back-link" href="#perfil">‹ Minha área</a>${title("Denúncias e decisões", "Acompanhe suas denúncias e decisões sobre seus alertas.")}${list.length ? list.map((r) => reportCard(r)).join("") : empty("Nenhuma denúncia", "As denúncias deste perfil aparecerão aqui.")}</div>`,
    );
  }
  function authLayout(form, heading, introText) {
    return `<div class="auth-page"><section class="auth-form-panel"><a class="logo auth-logo" href="#home" aria-label="BuscaPet, início">${icon("paw")}<span class="wordmark">Busca<strong>Pet</strong></span></a><div class="auth-heading"><h1 tabindex="-1">${heading}</h1><p>${introText}</p></div>${form}</section><aside class="auth-context" aria-label="Sobre o BuscaPet"><img src="assets/hex.png" alt="Hex, animal fictício usado na demonstração"><div><p class="eyebrow">Uma conta, mais de uma forma de ajudar</p><h2>Organize buscas sem misturar responsabilidades.</h2><p>Escolha a função ativa para ver somente as ferramentas de Tutor, Colaborador ou Parceiro.</p><p class="hint">Demonstração local: não há autenticação segura nem envio de e-mail.</p></div></aside></div>`;
  }
  function passwordInput(name, label, autocomplete) {
    return `<label>${label}<span class="password-control"><input class="control" type="password" name="${name}" autocomplete="${autocomplete}" required><button type="button" class="password-toggle" data-action="toggle-password" aria-pressed="false" aria-label="Mostrar ${label.toLowerCase()}">Mostrar</button></span><span class="field-error" data-error-for="${name}"></span></label>`;
  }
  function renderLogin() {
    if (A.getCurrentUser()?.emailVerified) {
      const home = roleHomes[A.getActiveRole()] || "#home";
      return page(
        "login",
        authLayout(
          `<div class="notice">Você já está conectado. <a href="${home}">Abrir sua área</a>.</div>`,
          "Entre no BuscaPet",
          "Acesse a mesma conta e escolha a função que deseja usar.",
        ),
      );
    }
    const notice = loginNotice
      ? `<div class="notice" role="status">${escape(loginNotice)}</div>`
      : "";
    loginNotice = "";
    page(
      "login",
      authLayout(
        `${notice}<div class="demo-credentials"><b>Contas da demonstração</b><span>Tutor: tutor@demo.buscapet</span><span>Colaborador: colaborador@demo.buscapet</span><span>Moderador: moderador@demo.buscapet</span><span>Senha: BuscaPetDemo!</span></div><form class="form auth-form" id="login-form" novalidate><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required><span class="field-error" data-error-for="email"></span></label>${passwordInput("password", "Senha", "current-password")}<span class="caps-warning" role="status" aria-live="polite"></span><label class="check-label"><input type="checkbox" name="remember"><span>Manter minha sessão neste dispositivo</span></label><div class="form-error" role="alert" aria-live="assertive"></div><button class="btn primary" type="submit">Entrar</button><div class="auth-links"><a href="#esqueci-senha">Esqueci minha senha</a><a href="#registro">Criar conta</a></div></form>`,
        "Entre no BuscaPet",
        "Use uma única conta para todas as suas formas de participação.",
      ),
    );
  }
  function renderRegistration() {
    page(
      "registro",
      authLayout(
        `<form class="form auth-form registration-form" id="registration-form" novalidate><label>Nome completo<input class="control" name="name" autocomplete="name" maxlength="80" required><span class="field-error" data-error-for="name"></span></label><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required><span class="field-error" data-error-for="email"></span></label>${passwordInput("password", "Senha", "new-password")}<div class="password-meter" aria-live="polite"><span id="password-strength">Use pelo menos 8 caracteres.</span><progress id="password-progress" max="4" value="0"></progress></div>${passwordInput("passwordConfirmation", "Confirmação da senha", "new-password")}<fieldset class="role-fieldset"><legend>Como você quer participar?</legend><p class="hint">Escolha ao menos uma opção. Tutor e Colaborador podem ser usados na mesma conta.</p><label class="role-card"><input type="checkbox" name="roles" value="tutor"><span><b>Quero encontrar e cuidar dos meus animais</b><small>Publique alertas, acompanhe pistas e organize suas buscas.</small><em>Função: Tutor</em></span></label><label class="role-card"><input type="checkbox" name="roles" value="colaborador"><span><b>Quero ajudar nas buscas</b><small>Registre avistamentos e execute tarefas de buscas em que você participa.</small><em>Função: Colaborador</em></span></label><label class="role-card"><input type="checkbox" name="roles" value="parceiro"><span><b>Represento uma organização ou estabelecimento</b><small>Prepare o perfil da organização. Esta função ainda está em implantação.</small><em>Função: Parceiro</em></span></label><span class="field-error" data-error-for="roles"></span></fieldset><fieldset id="initial-role-fields" class="initial-role-fields" hidden><legend>Qual área você quer abrir primeiro?</legend><div id="initial-role-options"></div><span class="field-error" data-error-for="activeRole"></span></fieldset><fieldset id="partner-fields" class="partner-fields" hidden><legend>Dados da organização</legend><p class="notice">Parceiro está em implantação. A solicitação ficará “em análise” nesta demonstração.</p><label>Tipo de organização<select class="control" name="organizationType"><option value="">Selecione</option><option>Clínica veterinária</option><option>Pet shop</option><option>ONG</option><option>Protetor independente</option><option>Condomínio</option><option>Empresa apoiadora</option></select><span class="field-error" data-error-for="partner.organizationType"></span></label><label>Nome público<input class="control" name="publicName" maxlength="100"><span class="field-error" data-error-for="partner.publicName"></span></label><div class="form-grid"><label>Cidade<input class="control" name="partnerCity" maxlength="80"><span class="field-error" data-error-for="partner.city"></span></label><label>Bairro ou região<input class="control" name="partnerRegion" maxlength="80"><span class="field-error" data-error-for="partner.region"></span></label></div><label>Responsável<input class="control" name="responsible" maxlength="80"><span class="field-error" data-error-for="partner.responsible"></span></label><label>CNPJ opcional nesta demonstração<input class="control" name="cnpj" inputmode="numeric" maxlength="18"></label><label class="check-label"><input type="checkbox" name="representationConfirmed"><span>Confirmo que represento esta organização.</span></label><span class="field-error" data-error-for="partner.representationConfirmed"></span></fieldset><label class="check-label"><input type="checkbox" name="acceptTerms"><span>Li e aceito os <a href="#termos" target="_blank">Termos de Uso</a>.</span></label><span class="field-error" data-error-for="acceptTerms"></span><label class="check-label"><input type="checkbox" name="acceptPrivacy"><span>Confirmo que li a <a href="#privacidade" target="_blank">Política de Privacidade</a>.</span></label><span class="field-error" data-error-for="acceptPrivacy"></span><div class="form-error" role="alert" aria-live="assertive"></div><button class="btn primary" type="submit">Criar minha conta</button><p class="auth-footer">Já tem conta? <a href="#login">Entrar</a></p></form>`,
        "Crie sua conta",
        "Uma identidade pode reunir mais de uma função. Você poderá alternar depois.",
      ),
    );
  }
  function renderForgotPassword() {
    page(
      "esqueci-senha",
      authLayout(
        `<form class="form auth-form" id="forgot-form" novalidate><label>E-mail<input class="control" type="email" name="email" autocomplete="email" required><span class="field-error" data-error-for="email"></span></label><div class="form-error" role="alert" aria-live="assertive"></div><div class="form-success" role="status" aria-live="polite"></div><button class="btn primary" type="submit">Enviar instruções</button><a class="back-link" href="#login">‹ Voltar ao login</a></form>`,
        "Esqueci minha senha",
        "Informe o e-mail da conta. A resposta não revela se ele está cadastrado.",
      ),
    );
  }
  function renderResetPassword(state = "valid") {
    const states = {
      expired: ["Link expirado", "Este link de demonstração expirou. Solicite novas instruções."],
      invalid: ["Link inválido", "Este link de demonstração não pode ser usado."],
      error: ["Erro temporário", "Use o formulário para visualizar a falha temporária simulada."],
    };
    const blocked = ["expired", "invalid"].includes(state);
    const content = blocked
      ? `<div class="notice warn" role="alert"><b>${states[state][0]}</b><br>${states[state][1]}</div><a class="btn primary" href="#esqueci-senha">Solicitar novas instruções</a>`
      : `<form class="form auth-form" id="reset-form" data-state="${escape(state)}" novalidate>${passwordInput("password", "Nova senha", "new-password")}<p class="hint">Use pelo menos 8 caracteres. Não exigimos uma combinação arbitrária de símbolos, números e maiúsculas.</p>${passwordInput("passwordConfirmation", "Confirmação da nova senha", "new-password")}<div class="form-error" role="alert" aria-live="assertive"></div><button class="btn primary" type="submit">Salvar nova senha</button></form>`;
    page(
      "redefinir-senha",
      authLayout(
        content,
        "Redefinir senha",
        "Fluxo visual de demonstração: não existe token ou mensagem de e-mail real.",
      ),
    );
  }
  function renderVerifyEmail() {
    const user = A.getCurrentUser();
    const email = user?.email || verificationEmail || "o endereço informado";
    page(
      "verificar-email",
      authLayout(
        `<div class="verification-panel"><div class="notice"><b>Verifique seu e-mail</b><br>Em uma versão conectada, o link seria enviado para <strong>${escape(email)}</strong>.</div><p>Nenhuma mensagem foi enviada: este projeto não possui backend ou provedor de e-mail.</p><p class="hint">Na demonstração, o link fictício teria validade de 30 minutos.</p><div class="actions">${user ? button("Simular e-mail verificado", "verify-email", user.email, "primary") : '<a class="btn primary" href="#login">Voltar ao login</a>'}${button("Simular reenvio", "resend-verification")}</div>${user ? `<form class="form" id="email-change-form"><label>Alterar endereço<input class="control" type="email" name="email" autocomplete="email" value="${escape(user.email)}" required></label><div class="form-error" role="alert"></div><button class="btn secondary">Salvar novo endereço</button></form>` : ""}</div>`,
        "Confirme seu e-mail",
        "A confirmação real será ativada quando houver um provedor de autenticação.",
      ),
    );
  }
  function renderTutorDashboard() {
    const s = S.get();
    const mine = s.alerts.filter((item) => item.ownerId === actor());
    const active = mine.filter((item) => item.status === "ativo");
    const ids = new Set(mine.map((item) => item.id));
    const pending = s.sightings.filter(
      (item) => ids.has(item.alertId) && item.review === "pendente",
    );
    const tasks = s.tasks.filter(
      (item) => ids.has(item.alertId) && !["concluida", "cancelada"].includes(item.status),
    );
    page(
      "painel-tutor",
      `<div class="page role-dashboard"><p class="eyebrow">Área do tutor</p>${title("Cuide dos seus animais e buscas", "Somente ferramentas relacionadas à função Tutor aparecem aqui.", '<a class="btn primary" href="#post">Criar alerta</a>')}<div class="dashboard-summary"><div><b>${mine.length}</b><span>Meus animais</span></div><div><b>${active.length}</b><span>Minhas buscas</span></div><div><b>${pending.length}</b><span>Pistas pendentes</span></div><div><b>${tasks.length}</b><span>Tarefas da operação</span></div></div><h2 class="section-heading">Minhas buscas</h2><div class="alert-grid">${mine.length ? mine.map(card).join("") : empty("Nenhuma busca", "Crie um alerta para começar.")}</div></div>`,
    );
  }
  function renderCollaboratorDashboard() {
    const s = S.get();
    const ids = new Set(
      s.participations.filter((item) => item.userId === actor()).map((item) => item.alertId),
    );
    const searches = s.alerts.filter((item) => ids.has(item.id));
    const tasks = s.tasks.filter((item) => item.assigneeId === actor());
    const contributions = s.sightings.filter((item) => item.userId === actor());
    page(
      "painel-colaborador",
      `<div class="page role-dashboard"><p class="eyebrow">Área do colaborador</p>${title("Ajude em buscas compartilhadas", "Execute tarefas e envie pistas sem alterar decisões do tutor.")}<div class="dashboard-summary"><div><b>${searches.length}</b><span>Buscas das quais participo</span></div><div><b>${tasks.filter((item) => !["concluida", "cancelada"].includes(item.status)).length}</b><span>Minhas tarefas</span></div><div><b>${contributions.length}</b><span>Minhas contribuições</span></div></div><div class="notice">Alertas próximos ou recentes serão adicionados quando houver localização real e controles de privacidade.</div><h2 class="section-heading">Buscas compartilhadas</h2><div class="alert-grid">${searches.length ? searches.map(card).join("") : empty("Nenhuma busca compartilhada", "Um tutor precisa adicionar esta conta a uma busca.")}</div></div>`,
    );
  }
  function renderPartnerDashboard() {
    const user = A.getCurrentUser();
    const partner = user.partner || {};
    page(
      "painel-parceiro",
      `<div class="page role-dashboard"><p class="eyebrow">Área do parceiro</p>${title("Perfil da organização", "Função preparada para futura integração da rede de apoio.")}<div class="notice warn"><b>Situação da verificação: aguardando análise</b><br>Nenhuma organização é publicada ou validada nesta demonstração.</div><dl class="account-details"><div><dt>Nome público</dt><dd>${escape(partner.publicName || "Não informado")}</dd></div><div><dt>Tipo</dt><dd>${escape(partner.organizationType || "Não informado")}</dd></div><div><dt>Região de atuação</dt><dd>${escape([partner.region, partner.city].filter(Boolean).join(" · ") || "Não informada")}</dd></div></dl><div class="dashboard-summary"><div><b>0</b><span>Alertas acompanhados</span></div><div><b>0</b><span>Avisos recebidos</span></div></div></div>`,
    );
  }
  function renderProfile() {
    const s = S.get(),
      user = A.getCurrentUser(),
      pageId = location.hash.startsWith("#perfil") ? "perfil" : "minha-conta";
    const roleRows = user.roles
      .map(
        (role) =>
          `<div class="account-role"><div><b>${roleNames[role]}</b><span>${role === user.activeRole ? "Função ativa" : role === "parceiro" && user.partner?.status === "pending" ? "Solicitação em análise" : "Autorizada"}</span></div><div class="actions">${role !== user.activeRole ? button("Usar esta função", "switch-role", role, "secondary small") : ""}${["tutor", "colaborador"].includes(role) ? button(`Remover ${roleNames[role]}`, "remove-role", role, "plain small") : ""}</div></div>`,
      )
      .join("");
    const addable = ["tutor", "colaborador"].filter(
      (role) => !user.roles.includes(role),
    );
    page(
      pageId,
      `<div class="page account-page">${title("Minha conta", "Uma identidade, uma sessão e as funções autorizadas para você.")}${stateNotice()}<div class="notice warn">Sessão simulada no navegador. Senhas e tokens não são persistidos; segurança real depende de backend e RLS.</div><section class="account-section"><h2>Dados pessoais</h2><dl class="account-details"><div><dt>Nome</dt><dd>${escape(user.name)}</dd></div><div><dt>E-mail</dt><dd>${escape(user.email)}</dd></div><div><dt>Verificação</dt><dd>${user.emailVerified ? "E-mail verificado na demonstração" : '<a href="#verificar-email">Pendente</a>'}</dd></div></dl></section><section class="account-section"><h2>Funções da conta</h2><p class="hint">A função ativa controla menus, atalhos e ações visíveis sem criar outra sessão.</p><div class="account-roles">${roleRows}</div>${addable.length ? `<div class="actions">${addable.map((role) => button(`Adicionar ${roleNames[role]}`, "add-role", role)).join("")}</div>` : ""}<p class="hint">Moderador e Administrador não podem ser adicionados pela própria pessoa.</p></section><section class="account-section"><h2>Segurança</h2><p>O protótipo não guarda sua senha. Contas criadas nesta sessão perdem a credencial temporária ao recarregar a aplicação.</p><a class="btn secondary" href="#esqueci-senha">Redefinir senha na demonstração</a></section><section class="account-section"><h2>Privacidade</h2><div class="actions"><a class="btn secondary" href="#termos">Termos de Uso</a><a class="btn secondary" href="#privacidade">Política de Privacidade</a><a class="btn secondary" href="#denuncias">Denúncias e decisões</a></div></section><section class="account-section"><h2>Dados da demonstração</h2><p class="hint">Exportar inclui alertas, pistas, tarefas, denúncias e histórico locais. Não envie o arquivo ao GitHub.</p><div class="actions">${button("Exportar dados", "export")}${button("Restaurar exemplos", "reset")}${button("Apagar dados locais", "erase", "", "danger")}</div></section><section class="account-section"><h2>Encerrar sessão</h2>${button("Sair do BuscaPet", "logout", "", "secondary")}</section></div>`,
    );
  }
  function renderAdmin() {
    if (mode !== "moderador")
      return page(
        "admin",
        `<div class="page narrow">${empty("Modo de moderação", "Abra Minha área e selecione Moderador para demonstrar o painel.")}<a href="#perfil" class="btn primary">Minha área</a></div>`,
      );
    const s = S.get(),
      reports = s.reports.filter(
        (r) => reportFilter === "todas" || r.status === reportFilter,
      );
    page(
      "admin",
      `<div class="page"><p class="eyebrow">Administração do BuscaPet</p>${title("Moderação", "Denúncias, decisões justificadas e histórico de ações.")}<div class="notice warn">Painel local de demonstração. Autenticação, autorização e registros protegidos no servidor ainda serão desenvolvidos.</div><div class="stats"><div><b>${s.reports.filter((r) => r.status === "pendente").length}</b><span>Pendentes</span></div><div><b>${s.reports.filter((r) => ["em_analise", "em_revisao"].includes(r.status)).length}</b><span>Em análise ou revisão</span></div><div><b>${s.reports.filter((r) => r.status === "concluida").length}</b><span>Concluídas</span></div></div><label>Filtrar denúncias <select class="control compact-control" id="report-filter"><option value="todas">Todas</option>${Object.entries(
        statuses,
      )
        .map(
          ([v, n]) =>
            `<option value="${v}" ${reportFilter === v ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select></label>${reports.length ? reports.map((r) => reportCard(r, true)).join("") : empty("Nenhuma denúncia nesta fila", "Envie uma denúncia em um alerta para testar o fluxo.")}<h2 class="section-heading">Contas de demonstração</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Perfil</th><th>Situação</th><th>Medida</th></tr></thead><tbody>${s.accounts.map((u) => `<tr><td>${escape(u.name)}</td><td>${u.suspended ? "Suspenso" : "Ativo"}</td><td>${button(u.suspended ? "Reativar" : "Suspender", "account", u.id, "secondary small")}</td></tr>`).join("")}</tbody></table></div><h2 class="section-heading">Registro de ações</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Quando</th><th>Quem / ação</th><th>Referência</th><th>Justificativa</th></tr></thead><tbody>${s.audit.length ? s.audit.map((e) => `<tr><td>${fmtDate(e.at, true)}</td><td>${escape(e.actor)}<br><b>${escape(e.action)}</b></td><td>${escape(e.target.slice(-8))}</td><td>${escape(e.reason)}</td></tr>`).join("") : '<tr><td colspan="4">Nenhuma ação registrada.</td></tr>'}</tbody></table></div></div>`,
    );
  }
  function dialog(titleText, body) {
    const d = $("#dialog");
    d.innerHTML = `<h2>${titleText}</h2>${body}`;
    d.showModal();
  }
  function confirmAction(titleText, text, action, key = "") {
    dialog(
      titleText,
      `<p>${text}</p><div class="actions">${button("Cancelar", "close-dialog")}${button("Confirmar", action, key, "primary")}</div>`,
    );
  }
  function clearFormMessages(form) {
    $$(".field-error", form).forEach((item) => (item.textContent = ""));
    const general = $(".form-error", form);
    if (general) general.textContent = "";
  }
  function showFieldErrors(form, fields = {}) {
    const partnerNames = {
      "partner.organizationType": "organizationType",
      "partner.publicName": "publicName",
      "partner.city": "partnerCity",
      "partner.region": "partnerRegion",
      "partner.responsible": "responsible",
      "partner.representationConfirmed": "representationConfirmed",
    };
    for (const [name, message] of Object.entries(fields)) {
      const target = $(`[data-error-for="${name}"]`, form);
      if (target) target.textContent = message;
    }
    const first = Object.keys(fields)[0];
    form.elements[partnerNames[first] || first]?.focus();
  }
  function setBusy(form, busy, text = "Aguarde…") {
    const submit = $('button[type="submit"]', form);
    if (!submit) return;
    if (busy) {
      submit.dataset.label = submit.textContent;
      submit.textContent = text;
      submit.disabled = true;
      form.setAttribute("aria-busy", "true");
    } else {
      submit.textContent = submit.dataset.label || submit.textContent;
      submit.disabled = false;
      form.removeAttribute("aria-busy");
    }
  }
  function syncRegistrationSelections(form) {
    if (!form) return;
    const roles = $$('input[name="roles"]:checked', form).map(
      (input) => input.value,
    );
    $$(".role-card", form).forEach((card) =>
      card.classList.toggle("selected", $("input", card).checked),
    );
    const initial = $("#initial-role-fields", form);
    initial.hidden = roles.length < 2;
    $("#initial-role-options", form).innerHTML = roles
      .map(
        (role, index) =>
          `<label class="radio-option"><input type="radio" name="activeRole" value="${role}" ${index === 0 ? "checked" : ""}>${roleNames[role]}</label>`,
      )
      .join("");
    $("#partner-fields", form).hidden = !roles.includes("parceiro");
  }
  const clickActions = {
    "show-alerts": ({ event }) => {
      event.preventDefault();
      document.getElementById("alertas")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    },
    favorite: ({ key }) => {
      S.favorite(key);
      if (["home", "favoritos"].includes(location.hash.slice(1) || "home"))
        updateResults();
      else render();
      success("Favoritos atualizados.");
    },
    "clear-filters": () => {
      filters = {
        q: "",
        species: "todos",
        type: "todos",
        region: "todos",
        status: "ativo",
      };
      render();
    },
    "switch-role": ({ key }) => {
      A.setActiveRole(key);
      mode = key;
      goto(roleHomes[key] || "#home");
      success(`Agora você está usando a área de ${roleNames[key]}.`);
    },
    "toggle-password": ({ target }) => {
      const input = target.closest(".password-control").querySelector("input");
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      target.setAttribute("aria-pressed", String(!showing));
      target.textContent = showing ? "Mostrar" : "Ocultar";
      target.setAttribute(
        "aria-label",
        `${showing ? "Mostrar" : "Ocultar"} ${input.name === "passwordConfirmation" ? "confirmação da senha" : "senha"}`,
      );
    },
    logout: () => {
      A.signOut();
      mode = "visitante";
      loginNotice = "Sessão encerrada.";
      goto("#login");
    },
    "add-role": ({ key }) => {
      A.addRole(key);
      render();
      success(`${roleNames[key]} foi adicionada à mesma conta.`);
    },
    "remove-role": ({ key }) =>
      confirmAction(
        `Remover ${roleNames[key]}?`,
        "O sistema verificará buscas e tarefas pendentes antes de remover esta função.",
        "confirm-remove-role",
        key,
      ),
    "confirm-remove-role": ({ key }) => {
      A.removeRole(key);
      $("#dialog").close();
      render();
      success(`${roleNames[key]} foi removida da conta.`);
    },
    "verify-email": ({ key }) => {
      A.verifyEmail(key);
      loginNotice = "E-mail verificado na demonstração. Sua conta está pronta.";
      goto(roleHomes[A.getActiveRole()] || "#home");
    },
    "resend-verification": () =>
      toast(
        "Reenvio simulado. Nenhuma mensagem foi enviada porque não há provedor de e-mail.",
      ),
    "remove-photo": () => {
      Images.clear();
      $("#photo-preview").hidden = true;
      $("#photo-input").value = "";
    },
    resolve: ({ key }) =>
      dialog(
        "Encerrar busca",
        `<form class="form" id="resolve-form" data-id="${escape(key)}"><label>O que aconteceu? *<select class="control" name="outcome" required><option value="">Selecione</option>${Object.entries(
          R.outcomes,
        )
          .map(([value, name]) => `<option value="${value}">${name}</option>`)
          .join("")}</select></label><label>O que ajudou ou motivou o encerramento? *<textarea class="control" name="note" required minlength="5" maxlength="800"></textarea></label><p class="hint">Tarefas ainda abertas serão canceladas. Você poderá reabrir a busca.</p><div class="form-error" role="alert"></div><div class="actions">${button("Voltar", "close-dialog")}<button class="btn primary">Confirmar encerramento</button></div></form>`,
      ),
    reopen: ({ key }) =>
      dialog(
        "Reabrir busca",
        `<form class="form" id="reopen-form" data-id="${escape(key)}"><label>Motivo *<textarea class="control" name="reason" required minlength="5" maxlength="800"></textarea></label><p class="hint">Tarefas anteriores permanecem no histórico. Crie novas verificações quando necessário.</p><div class="form-error" role="alert"></div><div class="actions">${button("Voltar", "close-dialog")}<button class="btn primary">Reabrir</button></div></form>`,
      ),
    participant: ({ key }) => {
      const enabled = !S.get().participations.some(
        (participant) =>
          participant.alertId === key && participant.userId === "community",
      );
      S.participant(key, "community", enabled, actor());
      render();
      success("Participação local atualizada.");
    },
    "print-poster": () => window.print(),
    "discard-draft": () =>
      confirmAction(
        "Descartar rascunho?",
        "O texto não publicado desta aba será descartado. Um alerta já publicado não será excluído.",
        "confirm-discard",
      ),
    "confirm-discard": () => {
      clearDraft($("#alert-form"));
      $("#dialog").close();
      render();
    },
    export: () => {
      const blob = new Blob([S.export()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "buscapet-dados-" + S.today() + ".json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Exportação iniciada. Guarde o arquivo fora do repositório.");
    },
    reset: () =>
      confirmAction(
        "Restaurar exemplos?",
        "Todos os registros atuais serão substituídos pelos exemplos iniciais. Exporte os dados que deseja guardar antes de confirmar.",
        "confirm-reset",
      ),
    erase: () =>
      confirmAction(
        "Apagar dados locais?",
        "Alertas, fotos, denúncias, favoritos, aceite e histórico deste navegador serão apagados. Cópias exportadas não são afetadas.",
        "confirm-erase",
      ),
    "confirm-reset": () => replaceLocalData("reset"),
    "confirm-erase": () => replaceLocalData("erase"),
    "close-dialog": () => $("#dialog").close(),
    appeal: ({ key }) =>
      dialog(
        "Contestar decisão",
        `<form id="appeal-form" class="form" data-id="${escape(key)}"><label>Explique seu pedido de revisão<textarea class="control" name="reason" required minlength="10" maxlength="800"></textarea></label><div class="form-error" role="alert"></div><div class="actions">${button("Cancelar", "close-dialog")}<button class="btn primary">Enviar contestação</button></div></form>`,
      ),
    account: ({ key }) => {
      const account = S.get().accounts.find((item) => item.id === key);
      dialog(
        (account.suspended ? "Reativar" : "Suspender") + " conta",
        `<p>${escape(account.name)}</p><form id="account-form" class="form" data-id="${escape(key)}"><label>Justificativa<textarea class="control" name="reason" required minlength="10" maxlength="800"></textarea></label><div class="form-error" role="alert"></div><div class="actions">${button("Cancelar", "close-dialog")}<button class="btn primary">Confirmar medida</button></div></form>`,
      );
    },
  };

  function replaceLocalData(action) {
    action === "reset" ? S.reset() : S.erase();
    $("#dialog").close();
    Storage.removeByPrefix(sessionStorage, C.storage.draftPrefix);
    A.signOut();
    mode = "visitante";
    filters = {
      q: "",
      species: "todos",
      type: "todos",
      region: "todos",
      status: "ativo",
    };
    goto("#login");
    success("Dados locais atualizados. Entre novamente para continuar.");
  }

  function click(event) {
    if (
      event.target.closest("#filter-details summary") &&
      window.matchMedia?.("(min-width: 1024px)").matches
    ) {
      event.preventDefault();
      return;
    }
    const filter = event.target.closest("[data-filter-species]");
    if (filter) {
      filters.species = filter.dataset.filterSpecies;
      $$("[data-filter-species]").forEach((b) => {
        b.classList.toggle("on", b === filter);
        b.setAttribute("aria-pressed", b === filter);
      });
      updateResults();
      return;
    }
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    const handler = clickActions[action];
    if (!handler) return;
    try {
      handler({ action, event, key: target.dataset.id, target });
    } catch (error) {
      toast(error.message);
    }
  }
  function input(e) {
    saveDraft(e.target.closest("form"));
    if (e.target.name === "password" && e.target.closest("#registration-form")) {
      const length = e.target.value.length;
      const score = length >= 16 ? 4 : length >= 12 ? 3 : length >= 8 ? 2 : length ? 1 : 0;
      $("#password-progress").value = score;
      $("#password-strength").textContent =
        score === 0
          ? "Use pelo menos 8 caracteres."
          : score === 1
            ? "Ainda faltam caracteres."
            : score === 2
              ? "Comprimento aceitável."
              : score === 3
                ? "Senha longa."
                : "Senha bem longa.";
    }
    if (e.target.id === "query") {
      filters.q = e.target.value;
      updateResults();
    }
  }
  async function change(e) {
    saveDraft(e.target.closest("form"));
    if (e.target.id === "role-switch") {
      A.setActiveRole(e.target.value);
      mode = e.target.value;
      goto(roleHomes[mode] || "#home");
      success(`Agora você está usando a área de ${roleNames[mode]}.`);
    } else if (e.target.name === "roles") {
      syncRegistrationSelections(e.target.closest("form"));
    } else if (e.target.id.startsWith("filter-")) {
      filters[e.target.id.slice(7)] = e.target.value;
      updateResults();
    } else if (e.target.id === "report-filter") {
      reportFilter = e.target.value;
      render();
    } else if (e.target.id === "photo-input") {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const result = await Images.process(file);
        if (result) {
          $("#photo-preview").src = result;
          $("#photo-preview").hidden = false;
        }
      } catch (error) {
        toast(error.message);
        e.target.value = "";
      }
    }
  }
  async function submit(e) {
    const form = e.target;
    if (!form.matches("form")) return;
    e.preventDefault();
    const fd = new FormData(form),
      value = (n) => String(fd.get(n) || "").trim(),
      key = form.dataset.id;
    const errorEl = $(".form-error", form);
    if (errorEl) errorEl.textContent = "";
    try {
      if (form.id === "login-form") {
        clearFormMessages(form);
        if (!/^\S+@\S+\.\S+$/.test(value("email"))) {
          showFieldErrors(form, { email: "Informe um e-mail válido." });
          throw Error("Revise o e-mail informado.");
        }
        setBusy(form, true, "Entrando…");
        try {
          const user = await A.signIn(value("email"), value("password"), {
            remember: fd.has("remember"),
          });
          mode = user.activeRole;
          const requested = Router.takeRemembered();
          goto(requested || roleHomes[user.activeRole] || "#home");
          success("Sessão de demonstração iniciada.");
        } catch (error) {
          if (error.code === "EMAIL_UNVERIFIED") {
            verificationEmail = error.email || value("email");
            goto("#verificar-email");
            return;
          }
          throw error;
        } finally {
          setBusy(form, false);
        }
      } else if (form.id === "registration-form") {
        clearFormMessages(form);
        const roles = fd.getAll("roles").map(String);
        const data = {
          name: value("name"),
          email: value("email"),
          password: String(fd.get("password") || ""),
          passwordConfirmation: String(fd.get("passwordConfirmation") || ""),
          roles,
          activeRole: roles.length === 1 ? roles[0] : value("activeRole"),
          acceptTerms: fd.has("acceptTerms"),
          acceptPrivacy: fd.has("acceptPrivacy"),
          partner: {
            organizationType: value("organizationType"),
            publicName: value("publicName"),
            city: value("partnerCity"),
            region: value("partnerRegion"),
            responsible: value("responsible"),
            cnpj: value("cnpj"),
            representationConfirmed: fd.has("representationConfirmed"),
          },
        };
        const validation = A.validateSignUp(data);
        if (!validation.valid) {
          showFieldErrors(form, validation.errors);
          throw Error("Revise os campos indicados.");
        }
        setBusy(form, true, "Criando conta…");
        try {
          const user = await A.signUp(data);
          verificationEmail = user.email;
          mode = user.activeRole;
          goto("#verificar-email");
          success("Conta criada na demonstração. Confirme o e-mail para continuar.");
        } finally {
          setBusy(form, false);
        }
      } else if (form.id === "forgot-form") {
        clearFormMessages(form);
        if (!/^\S+@\S+\.\S+$/.test(value("email"))) {
          showFieldErrors(form, { email: "Informe um e-mail válido." });
          throw Error("Revise o e-mail informado.");
        }
        setBusy(form, true, "Enviando…");
        try {
          const result = await A.requestPasswordReset(value("email"));
          $(".form-success", form).textContent = result.message;
        } finally {
          setBusy(form, false);
        }
      } else if (form.id === "reset-form") {
        clearFormMessages(form);
        setBusy(form, true, "Salvando…");
        try {
          await A.updatePassword(
            String(fd.get("password") || ""),
            String(fd.get("passwordConfirmation") || ""),
            form.dataset.state,
          );
          loginNotice = "Senha alterada na demonstração. Entre para continuar.";
          goto("#login");
        } finally {
          setBusy(form, false);
        }
      } else if (form.id === "email-change-form") {
        A.updateEmail(value("email"));
        verificationEmail = value("email");
        render();
        success("Endereço atualizado. A verificação voltou a ficar pendente.");
      } else if (form.id === "task-form") {
        S.createTask(
          key,
          {
            title: value("title"),
            place: value("place"),
            assigneeId: value("assigneeId"),
            sightingId: value("sightingId"),
          },
          actor(),
        );
        render();
        success("Tarefa criada.");
      } else if (form.matches(".task-update-form")) {
        S.updateTask(
          key,
          value("status"),
          value("result"),
          value("method"),
          actor(),
        );
        render();
        success("Resultado da tarefa salvo.");
      } else if (form.matches(".sighting-review-form")) {
        S.reviewSighting(
          key,
          value("review"),
          value("reason"),
          actor(),
          value("duplicateOf"),
        );
        render();
        success("Revisão salva. A classificação não confirma a identidade.");
      } else if (form.id === "resolve-form") {
        S.resolve(key, actor(), value("outcome"), value("note"));
        $("#dialog").close();
        render();
        success("Busca encerrada com o resultado informado.");
      } else if (form.id === "reopen-form") {
        S.reopen(key, actor(), value("reason"));
        $("#dialog").close();
        render();
        success("Busca reaberta.");
      } else if (form.id === "alert-form") {
        if (Images.isPending()) throw Error("Aguarde o processamento da foto.");
        if (
          !value("name") ||
          !value("city") ||
          !value("region") ||
          !value("place") ||
          value("description").length < 10
        )
          throw Error("Preencha os campos obrigatórios e descreva o pet.");
        if (!value("seenDate") || value("seenDate") > S.today())
          throw Error("A data não pode ser futura.");
        if (!fd.has("contentRights"))
          throw Error("Confirme o uso das informações.");
        if (fd.has("contactPublic") && !value("contact"))
          throw Error("Informe o contato ou desmarque sua divulgação.");
        const reward = Number(value("reward") || 0);
        if (!Number.isFinite(reward) || reward < 0 || reward > 1000000)
          throw Error("Recompensa inválida.");
        const data = {
          type: value("type"),
          name: value("name"),
          species: value("species"),
          breed: value("breed"),
          age: value("age"),
          city: value("city"),
          region: value("region"),
          place: value("place"),
          seenDate: value("seenDate"),
          description: value("description"),
          reward,
          contact: value("contact"),
          contactPublic: fd.has("contactPublic"),
          image: Images.get(),
        };
        const currentAccount = S.get().accounts.find(
          (item) => item.id === actor(),
        );
        if (!key && currentAccount?.acceptedVersion !== S.POLICY_VERSION) {
          if (!fd.has("acceptTerms"))
            throw Error(
              "Leia e aceite os termos da demonstração antes de publicar.",
            );
          S.accept(A.getCurrentUser().name, actor());
        }
        const result = key
          ? (S.edit(key, data, actor()), key)
          : S.publish(data, actor());
        filters = {
          q: "",
          species: "todos",
          type: "todos",
          region: "todos",
          status: "ativo",
        };
        clearDraft(form);
        goto("#operacao/" + safeId(result));
        success(
          key ? "Alerta atualizado." : "Alerta publicado neste navegador!",
        );
      } else if (form.id === "sighting-form") {
        if (Images.isPending()) throw Error("Aguarde o processamento da foto.");
        const date = new Date(value("seenAt"));
        if (!value("place") || value("description").length < 5)
          throw Error("Informe o local e descreva a pista.");
        if (Number.isNaN(date.valueOf()) || date > new Date())
          throw Error("Informe uma data válida, sem horário futuro.");
        S.sighting(
          key,
          {
            place: value("place"),
            seenAt: date.toISOString(),
            source: value("source"),
            timeApproximate: fd.has("timeApproximate"),
            image: Images.get(),
            description: value("description"),
          },
          actor(),
        );
        goto("#pet/" + safeId(key));
        success(
          "Pista registrada neste navegador. Nenhum aviso externo foi enviado.",
        );
      } else if (form.id === "report-form") {
        if (
          !reasons.includes(value("category")) ||
          value("description").length < 10
        )
          throw Error("Selecione um motivo e explique o problema.");
        S.report(
          key,
          { category: value("category"), description: value("description") },
          actor(),
        );
        goto("#denuncias");
        success("Denúncia registrada. Acompanhe o protocolo nesta página.");
      } else if (form.matches(".moderation-form")) {
        S.moderate(key, value("decision"), value("reason"), mode);
        render();
        success("Decisão e justificativa registradas.");
      } else if (form.id === "appeal-form") {
        S.appeal(key, value("reason"), actor());
        $("#dialog").close();
        render();
        success("Contestação registrada para revisão.");
      } else if (form.id === "account-form") {
        const u = S.get().accounts.find((x) => x.id === key);
        S.account(key, !u.suspended, value("reason"), mode);
        $("#dialog").close();
        render();
        success("Situação da conta atualizada.");
      }
    } catch (error) {
      if (error.fields) showFieldErrors(form, error.fields);
      if (errorEl) errorEl.textContent = error.message;
      else toast(error.message);
      if (form.getAttribute("aria-busy") === "true") setBusy(form, false);
    }
  }
  function onKeydown(e) {
    if (!e.target.matches('input[type="password"]')) return;
    const warning = e.target.closest("form")?.querySelector(".caps-warning");
    if (warning)
      warning.textContent = e.getModifierState?.("CapsLock")
        ? "Caps Lock está ativado."
        : "";
  }

  function onStorage(e) {
    if (e.key === S.KEY || e.key === null)
      toast("Os dados mudaram em outra aba. Recarregue antes de continuar.");
  }

  function onBreakpoint(e) {
    const details = $("#filter-details");
    if (details) details.open = e.matches;
  }

  window.BPApp = Object.freeze({
    mount,
    onBreakpoint,
    onChange: change,
    onClick: click,
    onInput: input,
    onKeydown,
    onStorage,
    onSubmit: submit,
    render,
  });
})();
