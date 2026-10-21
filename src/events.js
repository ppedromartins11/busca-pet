/* Um único ponto de registro para os eventos globais da aplicação. */
(() => {
  "use strict";

  const app = window.BPApp;
  const responsiveQuery = window.matchMedia?.("(min-width: 1024px)");

  app.mount();
  window.addEventListener("hashchange", app.render);
  window.addEventListener("storage", app.onStorage);
  document.addEventListener("click", app.onClick);
  document.addEventListener("submit", app.onSubmit);
  document.addEventListener("input", app.onInput);
  document.addEventListener("change", app.onChange);
  document.addEventListener("keydown", app.onKeydown);
  responsiveQuery?.addEventListener("change", app.onBreakpoint);
  app.render();
})();
