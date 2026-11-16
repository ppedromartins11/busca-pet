import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

const port = Number(process.argv[2] || 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Informe uma porta válida entre 1 e 65535.");
}

// O Vite lê .env mesmo quando uma variável do shell está vazia.
// Este diretório vazio impede que a demonstração carregue a configuração conectada.
delete process.env.VITE_SUPABASE_URL;
delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const envDir = mkdtempSync(join(tmpdir(), "buscapet-demo-env-"));
let server;
try {
  server = await createServer({
    root: process.cwd(),
    envDir,
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await server.listen();
  server.printUrls();
} catch (error) {
  rmSync(envDir, { recursive: true, force: true });
  throw error;
}

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  rmSync(envDir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
