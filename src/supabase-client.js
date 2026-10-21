import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const configured = Boolean(url && publishableKey);

const client = configured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Ponte temporária para a migração incremental da SPA legada.
 * Esta chave só contém o cliente criado com a publishable key. Nenhuma service
 * role, segredo de banco ou permissão de servidor pode existir no navegador.
 */
window.BPSupabase = Object.freeze({
  client,
  configured,
  missingConfigurationMessage:
    "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para conectar o BuscaPet ao Supabase.",
});

export { client as supabase, configured };
