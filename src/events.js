/* Um único ponto de registro para os eventos globais da aplicação. */
(() => {
  "use strict";

  const app = window.BPSupabase?.configured ? window.BPRealApp : window.BPApp;
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
  if (window.BPSupabase?.configured) window.BPAuth.onChange?.(() => app.render());
  app.render();
})();
