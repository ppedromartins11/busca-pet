/* Processamento local e estado transitório das fotos escolhidas pelo usuário. */
(() => {
  "use strict";

  const ACCEPTED_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
  const MAX_FILE_SIZE = 8 * 1024 * 1024;
  const MAX_DATA_URL_SIZE = 600000;
  let value = "";
  let routeGeneration = 0;
  let requestGeneration = 0;
  let pending = false;

  function beginRoute() {
    routeGeneration += 1;
    requestGeneration += 1;
    pending = false;
  }

  function set(nextValue) {
    value = nextValue || "";
  }

  function clear() {
    requestGeneration += 1;
    pending = false;
    value = "";
  }

  async function process(file) {
    const route = routeGeneration;
    const request = ++requestGeneration;
    pending = true;
    let objectUrl = "";

    try {
      if (!ACCEPTED_TYPES.includes(file.type))
        throw Error("Selecione uma foto JPG, PNG ou WebP.");
      if (file.size > MAX_FILE_SIZE) throw Error("A foto deve ter até 8 MB.");

      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error("Não foi possível ler essa foto."));
        image.src = objectUrl;
      });

      const scale = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", 0.76);
      if (result.length > MAX_DATA_URL_SIZE)
        throw Error("Foto muito detalhada. Escolha uma imagem menor.");

      if (route !== routeGeneration || request !== requestGeneration) return null;
      value = result;
      return result;
    } catch (error) {
      if (route !== routeGeneration || request !== requestGeneration) return null;
      throw error;
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (route === routeGeneration && request === requestGeneration) pending = false;
    }
  }

  window.BPImages = Object.freeze({
    beginRoute,
    clear,
    get: () => value,
    isPending: () => pending,
    process,
    set,
  });
})();
