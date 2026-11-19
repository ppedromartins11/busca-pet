// Cartaz criado no próprio navegador. Não envia fotos ou contatos a serviços externos.
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

function lines(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const result = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      if (current) result.push(current);
      current = word;
    }
  }
  if (current) result.push(current);
  if (result.length <= maxLines) return result;
  const clipped = result.slice(0, maxLines);
  let last = clipped[maxLines - 1];
  while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
  clipped[maxLines - 1] = (last || "") + "…";
  return clipped;
}

export function posterText(row, includePhone = false) {
  const type = row.type === "found" ? "ANIMAL ENCONTRADO" : "PROCURA-SE";
  const phone = includePhone && /^55\d{10,11}$/.test(row.contact_whatsapp || "")
    ? "+" + row.contact_whatsapp.slice(0, 2) + " (" + row.contact_whatsapp.slice(2, 4) + ") "
      + row.contact_whatsapp.slice(4) : "";
  return {
    title: type, name: String(row.pet_name || (row.type === "found" ? "Você conhece este animal?" : "Ajude a encontrar")).trim(),
    location: [row.region, row.city].filter(Boolean).join(" · "),
    reference: String(row.public_reference || "").trim(),
    description: String(row.description || "").trim(),
    phone,
  };
}

export function drawPoster(canvas, row, image = null, includePhone = false) {
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Este navegador não permite gerar o cartaz.");
  const copy = posterText(row, includePhone);
  ctx.fillStyle = "#fbf9ff";
  ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  ctx.fillStyle = "#352448";
  ctx.fillRect(0, 0, POSTER_WIDTH, 205);
  ctx.fillStyle = "#c497ff";
  ctx.font = "bold 42px Arial, sans-serif";
  ctx.fillText("BuscaPet", 72, 69);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 83px Arial, sans-serif";
  ctx.fillText(copy.title, 72, 165);
  const imageX = 72, imageY = 244, imageW = 936, imageH = 525;
  ctx.fillStyle = "#eee7f5";
  ctx.fillRect(imageX, imageY, imageW, imageH);
  if (image && image.width && image.height) {
    const scale = Math.max(imageW / image.width, imageH / image.height);
    const w = image.width * scale, h = image.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(imageX, imageY, imageW, imageH);
    ctx.clip();
    ctx.drawImage(image, imageX + (imageW - w) / 2, imageY + (imageH - h) / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = "#705b82";
    ctx.font = "38px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Foto não cadastrada", 540, 510);
    ctx.textAlign = "left";
  }
  let y = 845;
  ctx.fillStyle = "#352448";
  ctx.font = "bold 66px Arial, sans-serif";
  for (const line of lines(ctx, copy.name, 920, 2)) { ctx.fillText(line, 72, y); y += 78; }
  y += 6;
  ctx.fillStyle = "#66478c";
  ctx.font = "bold 38px Arial, sans-serif";
  for (const line of lines(ctx, copy.location, 920, 2)) { ctx.fillText(line, 72, y); y += 46; }
  y += 16;
  ctx.fillStyle = "#463854";
  ctx.font = "31px Arial, sans-serif";
  for (const line of lines(ctx, [copy.reference, copy.description].filter(Boolean).join(" — "), 930, 3)) {
    ctx.fillText(line, 72, y); y += 39;
  }
  ctx.fillStyle = "#efe6fa";
  ctx.fillRect(0, 1204, 1080, 146);
  ctx.fillStyle = "#39224e";
  ctx.font = "bold 35px Arial, sans-serif";
  ctx.fillText(copy.phone ? "CONTATO DO RESPONSÁVEL" : "COMPARTILHE ESTE CARTAZ", 72, 1260);
  ctx.font = copy.phone ? "bold 48px Arial, sans-serif" : "30px Arial, sans-serif";
  ctx.fillText(copy.phone || "Ajude a divulgar este alerta na sua região.", 72, 1311);
  return canvas;
}
