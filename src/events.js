/* Um único ponto de registro para os eventos globais da aplicação. */
(() => {
  "use strict";

  const configured = Boolean(window.BPSupabase?.configured || window.BPLocalPreview?.active);
  const root = document.querySelector("#main-content");
  if (!configured && import.meta.env.PROD) {
    document.title = "BuscaPet | Ambiente não configurado";
    root.innerHTML = `<section class="environment-block" role="alert" aria-labelledby="environment-block-title"><div class="environment-block__icon" aria-hidden="true">!</div><div><p class="environment-block__eyebrow">Ambiente indisponível</p><h1 id="environment-block-title">O BuscaPet ainda não está conectado</h1><p>Este endereço precisa ser configurado para acessar o serviço de dados. Nenhum dado local de demonstração foi carregado.</p></div></section>`;
    return;
  }

  const app = configured ? window.BPRealApp : window.BPApp;
  const responsiveQuery = window.matchMedia?.("(min-width: 1024px)");

  app.mount();
  window.addEventListener("hashchange", app.render);
  if (app.onStorage) window.addEventListener("storage", app.onStorage);
  document.addEventListener("click", app.onClick);
  document.addEventListener("submit", app.onSubmit);
  if (app.onInput) document.addEventListener("input", app.onInput);
  if (app.onChange) document.addEventListener("change", app.onChange);
  if (app.onKeydown) document.addEventListener("keydown", app.onKeydown);
  if (app.onBreakpoint) responsiveQuery?.addEventListener("change", app.onBreakpoint);
  if (configured) window.BPAuth.onChange?.((_, change) => {
    if (change?.signedOutUserId) window.BPDrafts?.clearUser(change.signedOutUserId);
    // TOKEN_REFRESHED não muda a interface e não pode recriar o formulário ativo.
    if (change?.relevant !== false) app.render();
  });
  app.render();
})();
