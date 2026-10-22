// Ordem explícita: os módulos legados expõem contratos em window enquanto a
// migração para imports nativos acontece de forma incremental.
import "./constants.js";
import "./storage.js";
import "./validation.js";
import "./supabase-client.js";
import "./store.js";
import "./remote-store.js";
import "./auth.js";
import "./drafts.js";
import "./permissions.js";
import "./router.js";
import "./legal.js";
import "./images.js";
import "./views.js";
import "./ui-preferences.js";
import "./app.js";
import "./real-app.js";
import "./events.js";
window.BPUIPreferences?.mount();
