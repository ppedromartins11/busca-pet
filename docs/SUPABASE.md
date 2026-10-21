# Sprint 2 — Supabase

Esta pasta prepara a migração do protótipo local para autenticação, banco e
armazenamento reais. A migration é **local**: ela não foi aplicada a nenhum
projeto remoto nesta entrega.

## Dependências

- `@supabase/supabase-js`: cliente usado pelo navegador.
- `vite`: servidor e build da SPA.
- `supabase`: CLI para migrations e ambiente local.

Use Node 22 ou superior:

```bash
npm install
npm run dev
```

## Configuração do ambiente

1. Copie `.env.example` para `.env`.
2. No painel do Supabase, copie o Project URL e a **publishable key**.
3. Preencha apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Em Authentication > URL Configuration, adicione `http://localhost:5173` e a
   URL de produção como Redirect URLs.
5. Mantenha a confirmação de e-mail ativa para contas reais.

`VITE_` torna a variável visível no navegador. Portanto, jamais use
`service_role`, secret key, senha de banco ou token administrativo nesse
arquivo ou no front-end.

## Banco e RLS

O arquivo em `supabase/migrations/` cria:

- `profiles` e `user_roles` para uma identidade com múltiplas funções;
- `pets`, `occurrences`, `sightings` e `occurrence_participants`;
- `occurrence_photos` para metadados de imagens;
- bucket privado `pet-media`;
- RLS para limitar criação e alteração à pessoa responsável;
- um trigger de criação de perfil após o cadastro em `auth.users`.

O trigger cria apenas o papel `tutor`. A pessoa autenticada pode acrescentar
`colaborador` diretamente. Para `parceiro`, primeiro insere um
`partner_profiles` pendente; outro moderador ou administrador aprova via
`approve_partner`, que concede o papel. Somente um administrador existente
concede `moderador` ou outro `administrador` via `grant_staff_role`. O primeiro
administrador precisa ser concedido por uma operação SQL administrativa
auditada fora do navegador. A função ativa muda apenas via `switch_active_role`
e precisa estar concedida; parceiro também precisa estar aprovado. A
autorização não usa `user_metadata`.

`profiles.status`, `partner_profiles.status`, papéis de equipe, visibilidade
moderada e revisão de avistamentos são controlados por funções com checagem
do ator. As partes `SECURITY DEFINER` ficam em `buscapet_private`, schema não
exposto na Data API. As funções públicas são wrappers `SECURITY INVOKER` com
`EXECUTE` restrito. Aprovação, concessão de equipe, suspensão e visibilidade
geram registros em `buscapet_private.admin_audit`.

Fotografias ficam no bucket privado `pet-media`, com caminho
`<id-do-upload>/arquivo-uuid.png|jpg|webp`. Após o upload, a aplicação grava
`occurrence_photos` com o mesmo caminho, MIME e tamanho. Leitura pública só é
permitida para foto vinculada diretamente a ocorrência publicada; fotos de
avistamento e ocorrências privadas seguem restritas. O download público usa
Storage com a publishable key e RLS, sem transformar o bucket em público.
Exclua o objeto pela API de Storage e depois o metadado; deleção direta da
tabela `storage.objects` não remove o arquivo subjacente. URLs assinadas
anteriores podem permanecer válidas até expirar, então devem ter prazo curto.

Avistamentos com conta são inseridos diretamente com status pendente. Local
exato fica em `buscapet_private.sighting_locations`; o autor pode acrescentá-lo
via `add_sighting_coordinates`, e apenas autor e tutor da ocorrência podem
consultá-lo via `sighting_coordinates`. Visitantes sem conta usam
o Cloudflare Worker em `cloudflare/guest-ingress`. Ele usa um Durable Object
SQLite para quota de tentativas, valida Turnstile no Siteverify e envia um
corpo sem IP ou token à Edge Function `report-guest-sighting`, com HMAC,
timestamp e nonce. A Edge rejeita chamadas diretas sem assinatura; a RPC
mantém quota de cinco relatos aceitos por hora/origem e rejeita nonce repetido
de forma atômica. Consulte `docs/SPRINT2_2_INGRESS.md` para variáveis,
implantação, rollback e testes. A SPA atual continua demonstrativa.

## Homologação local antes do primeiro push

Com Docker ativo, execute em uma cópia descartável do ambiente local:

```powershell
npm.cmd exec -- supabase start
npm.cmd exec -- supabase test db
npm.cmd exec -- supabase status -o env
```

Com as três variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
`SUPABASE_SERVICE_ROLE_KEY` do ambiente **local** configuradas no terminal,
execute `node tests/supabase-storage.integration.mjs`. O script recusa URLs
não locais, cria contas temporárias e as remove ao final. Confirme também a
invocação da Edge Function com o Turnstile de teste e o proxy configurado.
Nenhuma dessas verificações autoriza `supabase db push`.

## Aplicar quando houver um projeto de desenvolvimento

Revise o SQL primeiro e vincule explicitamente o projeto de desenvolvimento:

```bash
npm exec -- supabase login
npm exec -- supabase link --project-ref SEU_PROJECT_REF
npm exec -- supabase db push
```

Antes do `db push`, confirme no Dashboard que as tabelas do schema `public`
estão expostas à Data API ou mantenha os `GRANT` explícitos já presentes na
migration. Depois, execute os Security Advisors do projeto e teste com duas
contas reais: um tutor e um colaborador.

## Limites desta etapa

O cliente é preparado somente quando as variáveis de ambiente existirem. A
interface ainda usa o modo demonstrativo local; a próxima fatia migra login,
cadastro, ocorrências e avistamentos para as operações reais, preservando os
testes de regressão do protótipo.
