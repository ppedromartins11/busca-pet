/* Preferências visuais locais: não participam de autenticação ou autorização. */
(() => {
  "use strict";
  const KEY = "bp.ui.preferences";
  const defaults = { theme: "system", textScale: 1, contrast: false, links: false, focus: false, reduceMotion: false, vlibras: false };
  let preferences = read();
  let opener = null;
  const query = window.matchMedia("(prefers-color-scheme: dark)");

  function read() {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
    catch { return { ...defaults }; }
  }
  function write() {
    localStorage.setItem(KEY, JSON.stringify(preferences));
    apply();
    render();
  }
  function apply() {
    const theme = preferences.theme === "system" ? (query.matches ? "dark" : "light") : preferences.theme;
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themePreference = preferences.theme;
    root.toggleAttribute("data-contrast", preferences.contrast);
    root.toggleAttribute("data-links", preferences.links);
    root.toggleAttribute("data-focus", preferences.focus);
    root.toggleAttribute("data-motion", preferences.reduceMotion);
    root.style.setProperty("--user-text-scale", String(preferences.textScale));
    const widget = document.querySelector("#vlibras-widget");
    if (widget) widget.hidden = !preferences.vlibras;
    if (preferences.vlibras) void loadVLibras();
  }
  function option(label, description, key, checked) {
    return `<label class="accessibility-option"><span><b>${label}</b><small>${description}</small></span><input type="checkbox" data-preference="${key}" ${checked ? "checked" : ""}></label>`;
  }
  function render() {
    const dialog = document.querySelector("#accessibility-dialog");
    if (!dialog) return;
    dialog.innerHTML = `<form method="dialog" class="accessibility-panel"><div class="dialog-heading"><div><h2 id="accessibility-title">Acessibilidade</h2><p>Personalize a leitura e a navegação neste dispositivo.</p></div><button class="plain icon-button" value="cancel" aria-label="Fechar painel de acessibilidade">×</button></div><fieldset><legend>Tema</legend><label>Escolha de cor<select class="control" data-preference="theme"><option value="system" ${preferences.theme === "system" ? "selected" : ""}>Automático (sistema)</option><option value="light" ${preferences.theme === "light" ? "selected" : ""}>Claro</option><option value="dark" ${preferences.theme === "dark" ? "selected" : ""}>Escuro</option></select></label></fieldset><fieldset><legend>Tamanho do texto</legend><div class="accessibility-actions"><button type="button" class="btn secondary small" data-text-scale="-0.1">Diminuir</button><output aria-live="polite">${Math.round(preferences.textScale * 100)}%</output><button type="button" class="btn secondary small" data-text-scale="0.1">Aumentar</button><button type="button" class="plain" data-text-scale="reset">Padrão</button></div></fieldset><fieldset><legend>Leitura e foco</legend>${option("Alto contraste", "Aumenta a distinção entre texto, controles e superfícies.", "contrast", preferences.contrast)}${option("Destacar links", "Sublinha links para facilitar sua identificação.", "links", preferences.links)}${option("Foco reforçado", "Amplia o indicador para navegação por teclado.", "focus", preferences.focus)}${option("Reduzir animações", "Diminui movimentos e transições da interface.", "reduceMotion", preferences.reduceMotion)}${option("VLibras", "Carrega o widget oficial de tradução automática em Libras. O serviço externo pode tratar o texto selecionado.", "vlibras", preferences.vlibras)}</fieldset><div class="actions"><button type="button" class="btn secondary" data-preference-reset>Restaurar preferências</button><button class="btn primary" value="cancel">Concluir</button></div></form>`;
  }
  function loadVLibras() {
    if (window.VLibras || document.querySelector("#vlibras-script")) return;
    document.body.insertAdjacentHTML("beforeend", '<div vw class="enabled" id="vlibras-widget"><div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div></div>');
    const script = document.createElement("script");
    script.id = "vlibras-script";
    script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
    script.async = true;
    script.onload = () => { try { new window.VLibras.Widget("https://vlibras.gov.br/app"); } catch { /* O botão permanece disponível para nova tentativa. */ } };
    document.head.append(script);
  }
  function mount() {
    document.body.insertAdjacentHTML("beforeend", `<button class="accessibility-trigger" type="button" aria-haspopup="dialog" aria-controls="accessibility-dialog" aria-label="Abrir opções de acessibilidade">A<span aria-hidden="true">↗</span></button><dialog id="accessibility-dialog" aria-labelledby="accessibility-title"></dialog>`);
    render();
    const dialog = document.querySelector("#accessibility-dialog");
    const trigger = document.querySelector(".accessibility-trigger");
    trigger.addEventListener("click", () => { opener = trigger; dialog.showModal(); dialog.querySelector("select")?.focus(); });
    dialog.addEventListener("close", () => opener?.focus());
    dialog.addEventListener("change", (event) => {
      const key = event.target.dataset.preference;
      if (!key) return;
      preferences[key] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
      write();
    });
    dialog.addEventListener("click", (event) => {
      const delta = event.target.dataset.textScale;
      if (delta) {
        preferences.textScale = delta === "reset" ? 1 : Math.min(1.35, Math.max(0.9, Math.round((preferences.textScale + Number(delta)) * 100) / 100));
        write();
      }
      if (event.target.matches("[data-preference-reset]")) { preferences = { ...defaults }; write(); }
    });
    query.addEventListener("change", () => { if (preferences.theme === "system") apply(); });
  }
  apply();
  window.BPUIPreferences = Object.freeze({ mount, get: () => ({ ...preferences }) });
})();
