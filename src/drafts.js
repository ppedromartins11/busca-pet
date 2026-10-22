/* Rascunhos locais de formulários autenticados. Dados sensíveis, arquivos,
 * coordenadas e consentimentos ficam fora deste mecanismo por definição. */
(() => {
  "use strict";

  const VERSION = 1;
  const TTL = 24 * 60 * 60 * 1000;
  const PREFIX = "buscapet.draft.v1:";
  const pendingSaves = new Map();
  const safeStorage = () => { try { return window.localStorage; } catch { return null; } };
  const keyFor = (userId, formType, recordId = "new") =>
    `${PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(formType)}:${encodeURIComponent(recordId || "new")}`;
  const read = (userId, formType, recordId) => {
    const storage = safeStorage();
    if (!storage || !userId) return null;
    try {
      const raw = storage.getItem(keyFor(userId, formType, recordId));
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (draft.version !== VERSION || draft.userId !== userId || draft.formType !== formType || Date.now() - Number(draft.updatedAt || 0) > TTL) {
        storage.removeItem(keyFor(userId, formType, recordId));
        return null;
      }
      return draft;
    } catch { return null; }
  };
  const write = (draft) => {
    const storage = safeStorage();
    if (!storage) return false;
    try { storage.setItem(keyFor(draft.userId, draft.formType, draft.recordId), JSON.stringify(draft)); return true; } catch { return false; }
  };
  const clear = (userId, formType, recordId) => {
    const storage = safeStorage();
    if (!storage || !userId) return false;
    const key = keyFor(userId, formType, recordId);
    pendingSaves.delete(key);
    try { storage.removeItem(key); return true; } catch { return false; }
  };
  const clearUser = (userId) => {
    const storage = safeStorage();
    if (!storage || !userId) return false;
    try {
      const prefix = `${PREFIX}${encodeURIComponent(userId)}:`;
      for (let index = storage.length - 1; index >= 0; index--) {
        const key = storage.key(index);
        if (key?.startsWith(prefix)) storage.removeItem(key);
      }
      for (const key of pendingSaves.keys()) if (key.startsWith(prefix)) pendingSaves.delete(key);
      return true;
    } catch { return false; }
  };
  const fieldValue = (field) => field.type === "checkbox" ? Boolean(field.checked) : field.value;
  const applyValue = (field, value) => {
    if (field.type === "checkbox") field.checked = Boolean(value);
    else if (typeof value === "string" || typeof value === "number") field.value = String(value);
  };
  function attach(form, { userId, formType, recordId = "new", fields, serverUpdatedAt = null, onStatus } = {}) {
    if (!form || !userId || !formType || !Array.isArray(fields)) return { restored: false, discard: () => false };
    const draft = read(userId, formType, recordId);
    const serverIsNewer = serverUpdatedAt && draft && Date.parse(serverUpdatedAt) > Number(draft.updatedAt || 0);
    let restored = false;
    if (draft && !serverIsNewer) {
      for (const name of fields) {
        const field = form.elements.namedItem(name);
        if (field && Object.hasOwn(draft.values || {}, name)) applyValue(field, draft.values[name]);
      }
      restored = Object.keys(draft.values || {}).length > 0;
      if (restored) onStatus?.("Seu preenchimento anterior foi recuperado.");
      if (draft.hadFiles) onStatus?.("Os dados do formulário foram recuperados. Selecione novamente as fotografias antes de continuar.");
    } else if (serverIsNewer) clear(userId, formType, recordId);
    const storageKey = keyFor(userId, formType, recordId);
    let timer = null;
    const save = () => {
      const values = {};
      for (const name of fields) {
        const field = form.elements.namedItem(name);
        if (field && field.type !== "file") values[name] = fieldValue(field);
      }
      const hasFiles = [...form.querySelectorAll('input[type="file"]')].some((input) => input.files?.length);
      const saved = write({ version: VERSION, userId, formType, recordId: recordId || "new", updatedAt: Date.now(), values, hadFiles: hasFiles || Boolean(draft?.hadFiles) });
      if (saved) onStatus?.("Rascunho salvo neste dispositivo.");
    };
    pendingSaves.set(storageKey, save);
    const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 450); };
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    return { restored, discard: () => { clearTimeout(timer); return clear(userId, formType, recordId); } };
  }
  // pagehide também é emitido no Safari/iOS quando a aba é descartada ou entra no BFCache.
  window.addEventListener?.("pagehide", () => { for (const save of pendingSaves.values()) save(); });
  window.BPDrafts = Object.freeze({ VERSION, TTL, keyFor, read, write, clear, clearUser, attach });
})();
