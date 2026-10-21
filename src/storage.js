/* Acesso único aos mecanismos de armazenamento do navegador. */
(() => {
  "use strict";

  function result(operation) {
    try {
      return { ok: true, value: operation() };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function readRaw(storage, key) {
    return result(() => storage?.getItem(key) ?? null);
  }

  function writeRaw(storage, key, value) {
    return result(() => {
      storage?.setItem(key, String(value));
      return true;
    });
  }

  function remove(storage, key) {
    return result(() => {
      storage?.removeItem(key);
      return true;
    });
  }

  function readJSON(storage, key) {
    const raw = readRaw(storage, key);
    if (!raw.ok || raw.value === null) return raw;
    return result(() => JSON.parse(raw.value));
  }

  function writeJSON(storage, key, value) {
    return value === null
      ? remove(storage, key)
      : writeRaw(storage, key, JSON.stringify(value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function removeByPrefix(storage, prefix) {
    return result(() => {
      const keys = [];
      for (let index = 0; index < (storage?.length || 0); index += 1)
        keys.push(storage.key(index));
      for (const key of keys)
        if (key?.startsWith(prefix)) storage.removeItem(key);
      return true;
    });
  }

  window.BPStorage = {
    readRaw,
    writeRaw,
    remove,
    readJSON,
    writeJSON,
    removeByPrefix,
    clone,
  };
})();
