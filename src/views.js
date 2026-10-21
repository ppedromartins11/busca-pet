/* Componentes de apresentação reutilizados pelas telas da aplicação. */
(() => {
  "use strict";

  const S = window.BPStore;
  const R = window.BPRules;
  const C = window.BPConfig;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const safeId = (value) => encodeURIComponent(String(value));

  const iconPaths = Object.freeze({
    paw: '<ellipse cx="6" cy="8" rx="2" ry="2.7"/><ellipse cx="11" cy="5" rx="2" ry="2.7"/><ellipse cx="17" cy="6" rx="2" ry="2.7"/><ellipse cx="20" cy="11" rx="1.8" ry="2.5"/><path d="M5 18c0-3 4-7 7-7s7 4 7 7c0 5-5 1-7 1s-7 4-7-1Z"/>',
    home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z"/><path d="M9 3v16M15 5v16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    heart:
      '<path d="M20.8 4.7a5.4 5.4 0 0 0-7.6 0L12 5.9l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.6Z"/>',
    user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
    reward:
      '<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9M12 6v12"/>',
  });
  const demoPhotos = Object.freeze({
    hex: "assets/hex.png",
    bold: "assets/bold.png",
    gargamel: "assets/gargamel.png",
  });

  function icon(name) {
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name] || iconPaths.paw}</svg>`;
  }

  function localTime() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function fmtDate(value, withTime = false) {
    if (!value) return "Não informado";
    const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
    return Number.isNaN(date.valueOf())
      ? "Data inválida"
      : date.toLocaleString(
          "pt-BR",
          withTime
            ? { dateStyle: "short", timeStyle: "short" }
            : { dateStyle: "medium" },
        );
  }

  function money(value) {
    return Number(value).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  // heading/sub/button são fragmentos internos; conteúdo de usuário é escapado no chamador.
  function title(heading, sub = "", button = "") {
    return `<div class="page-title"><div><h1 tabindex="-1">${heading}</h1>${sub ? `<p class="intro">${sub}</p>` : ""}</div>${button}</div>`;
  }

  function button(label, action, id = "", style = "secondary") {
    return `<button type="button" class="btn ${escape(style)}" data-action="${escape(action)}" data-id="${escape(id)}">${escape(label)}</button>`;
  }

  function photo(alert, className = "photo") {
    const uploaded = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(
      alert.image || "",
    );
    const source = uploaded
      ? alert.image
      : alert.demo
        ? demoPhotos[alert.id]
        : "";
    return `<div class="${escape(className)}">${source ? `<img src="${source}" alt="Foto de ${escape(alert.name)}" loading="lazy">` : `<span class="photo-placeholder">${icon("paw")}<small>Sem foto</small></span>`}</div>`;
  }

  function card(alert) {
    const favorite = S.get().favorites.includes(alert.id);
    return `<article class="pet">
      ${photo(alert)}
      <div class="pet-body">
        <div class="card-tags"><span class="tag ${alert.type === "encontrado" ? "found" : ""}">${alert.type === "perdido" ? "Pet perdido" : "Pet encontrado"}</span>${alert.status !== "ativo" ? `<span class="tag resolved">${escape(R.outcomes[alert.status])}</span>` : ""}</div>
        <h3>${escape(alert.name)}</h3>
        <p class="pet-description">${escape(alert.breed || C.ui.species[alert.species])}${alert.age ? " · " + escape(alert.age) : ""}</p>
        <p class="pet-location">${icon("pin")} ${escape(alert.region)}<span>${escape(alert.city)}</span></p>
        <div class="card-bottom"><span>${fmtDate(alert.seenDate)}</span>${alert.reward > 0 ? `<strong>${money(alert.reward)}</strong>` : "<span>Sem recompensa</span>"}</div>
        ${alert.visibility !== "visivel" ? `<span class="tag hidden">${alert.visibility === "oculto" ? "Oculto" : "Removido"} pela moderação</span>` : ""}
        <div class="card-footer"><span>${alert.demo ? "Exemplo fictício" : "Alerta da comunidade"}</span><b>Ver alerta</b></div>
      </div>
      <a class="card-link" href="#pet/${safeId(alert.id)}" aria-label="Ver detalhes de ${escape(alert.name)}"></a>
      <button class="fav" data-action="favorite" data-id="${escape(alert.id)}" aria-label="${favorite ? "Desfavoritar" : "Favoritar"} ${escape(alert.name)}" aria-pressed="${favorite}">${icon("heart")}</button>
    </article>`;
  }

  function empty(heading, text) {
    return `<div class="empty">${icon("paw")}<h2>${heading}</h2><p>${text}</p></div>`;
  }

  function page(id, html) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement("section");
      element.id = id;
      element.className = "screen";
      $(".app-shell").appendChild(element);
    }
    element.innerHTML = html;
    return element;
  }

  window.BPViews = Object.freeze({
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
  });
})();
