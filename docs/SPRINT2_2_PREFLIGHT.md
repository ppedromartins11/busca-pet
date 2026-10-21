# Sprint 2.2 — preflight da implantação remota

**Atualização:** o bloqueio de ingresso foi tratado localmente em
`docs/SPRINT2_2_INGRESS.md`. A implementação agora usa Worker, Durable Object,
HMAC e nonce transacional. As referências abaixo a Turnstile e IP diretamente
na Edge descrevem o estado do preflight anterior. O inventário remoto permanece
pendente e nenhuma implantação foi feita.

Projeto de destino: `jpnvizdhyrvliqgvyxzx` (`busca-pet`, PostgreSQL 17.11,
região `us-east-1`). Este documento registra preparação; nenhuma migration,
segredo, configuração de Auth ou Edge Function foi aplicada remotamente.

## Resultado em 20/10/2026

| Verificação | Resultado |
|---|---|
| Vínculo local | `supabase/.temp/project-ref` e `supabase projects list` apontam para `jpnvizdhyrvliqgvyxzx`; projeto `ACTIVE_HEALTHY` |
| Histórico de migrations | `supabase migration list --linked`: `20261020233414` somente local, nenhuma migration remota listada |
| Dry-run | `supabase db push --dry-run --linked --skip-vault`: somente `20261020233414_initial_buscapet_schema.sql` pendente; nada aplicado |
| Functions remotas | `supabase functions list --project-ref jpnvizdhyrvliqgvyxzx`: lista vazia |
| Secrets remotos | `supabase secrets list --project-ref jpnvizdhyrvliqgvyxzx`: lista vazia |
| Inventário de objetos e dados remotos | **Pendente.** Conector Supabase recusou leitura por falta de permissão. O CLI de consulta pode criar papel temporário na ausência de senha de banco, então não foi usado sob a restrição de não alterar o remoto. Executar `supabase/preflight/remote_preflight.readonly.sql` no SQL Editor e revisar o resultado antes de qualquer push. Histórico de migrations vazio não significa banco vazio. |
| Árvore Git | **Pendente.** Esta cópia não contém `.git`; `git status` falhou. Conferir origem, commit e diff no checkout versionado antes de liberar. |

O arquivo `docs/HOMOLOGACAO_MIGRATION.md` documenta 34/34 testes SQL,
38/38 testes do protótipo, integrações HTTP locais, check, build, lint e
advisors locais aprovados. São resultados **locais**. A migration e a função
foram relidas neste preflight, sem edição do SQL homologado.

## Segurança e configuração antes da exposição

1. **Auth:** configurar no Dashboard Authentication > URL Configuration o Site
   URL exato da SPA e Redirect URLs exatas para produção e
   `http://localhost:5173`/`http://127.0.0.1:5173` no desenvolvimento.
   Habilitar confirmação de email, revisar política de senha, limites de
   autenticação e SMTP próprio antes de contas públicas. O `site_url` local em
   `supabase/config.toml` ainda aponta para a porta 3000 e não representa a
   configuração remota. Desabilitar contas anônimas de Auth: o relato visitante
   usa a função separada. Definir procedimento auditado para criar o primeiro
   administrador por SQL privilegiado, sem expor esse privilégio na SPA.
2. **Turnstile:** criar widget com hostnames exatos da SPA. A site key é pública;
   `TURNSTILE_SECRET_KEY` permanece no servidor. Validar cada token no Siteverify
   no servidor, conferir `success` e `hostname`, rejeitar token expirado ou
   reutilizado e renovar o widget após cada tentativa. O código atual faz
   validação e confere hostname; a SPA ainda não gera tokens.
3. **Origem/IP:** `verify_jwt=false` é necessário para visitante sem conta.
   CORS e `Origin` limitam navegadores, não clientes diretos. A função lê
   `cf-connecting-ip` sem autenticar a origem da requisição; chamadas diretas à
   URL Supabase podem falsificar o cabeçalho e contornar a quota de cinco por
   hora/IP. **Não liberar o endpoint publicamente assim.** Preparar ingresso
   confiável que sobrescreva IP e autentique cada chamada na função (por
   exemplo, proxy com assinatura HMAC e timestamp verificados no servidor),
   bloquear ou rejeitar chamadas diretas sem assinatura, e aplicar limite no
   ingresso antes de Siteverify. Testar falsificação do cabeçalho, bypass
   direto, IPv4/IPv6, IP ausente, concorrência e rotação do segredo. O hash
   horário em `guest_sighting_limits` é quota complementar, não substitui
   limite no ingresso. Sem este componente, **não implantar a função**:
   `verify_jwt=false` a deixaria diretamente acessível no endereço Supabase.
4. **Segredos:** `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados no
   runtime da função. Provisionar `TURNSTILE_SECRET_KEY`,
   `GUEST_SIGHTING_RATE_SECRET` (aleatório, ao menos 32 bytes),
   `GUEST_SIGHTING_ALLOWED_HOSTNAMES` e `GUEST_SIGHTING_ALLOWED_ORIGINS` no
   projeto. Usar `supabase/functions/.env.example` só como modelo. Nenhum
   segredo deve usar prefixo `VITE_`, entrar no bundle ou ser commitado.
5. **Storage:** a migration cria `pet-media` privado, limite de 5 MiB e MIME
   JPEG/PNG/WebP. Fazer upload autenticado no caminho `<auth.uid()>/<uuid>.<ext>`;
   criar metadado `occurrence_photos` apenas após upload concluído. Ler com
   `download()` e JWT/anon publishable key sob RLS; apenas fotos de ocorrências
   públicas vinculadas ao metadado são legíveis pelo visitante. Não usar
   `getPublicUrl()` nem tornar o bucket público. A exclusão usa a API Storage
   seguida do metadado; URL assinada, quando necessária, deve ter prazo curto.
6. **Retenção inicial:** definir com responsável pelos dados os prazos antes
   do piloto. Inventariar diariamente objetos sem metadado com mais de 24 h e
   metadados sem objeto; começar com relatório, depois remover por Storage API
   sob conta de serviço, com log, limite por lote e rechecagem. Limpar janelas
   antigas de `guest_sighting_limits` após período aprovado (proposta: 48 h).
   Definir prazos separados para coordenadas, texto livre, fotos após
   encerramento, contas excluídas e auditoria. Testar a limpeza em ambiente de
   desenvolvimento e assegurar backup/restauração antes de automatizar.

## Revisão de RLS e exposição

A migration revoga DML amplo das tabelas públicas, concede colunas específicas,
usa RLS nas oito tabelas públicas e mantém funções `SECURITY DEFINER` no schema
`buscapet_private`, fora da Data API. A função de avistamento com `service_role`
fica no servidor. `anon` lê apenas ocorrências publicadas e metadados das suas
fotos; avistamentos e coordenadas exatas não são públicos. Storage permite
download de foto publicável via operação autenticada de leitura, sem abrir o
bucket. A conferência remota de grants, RLS, schema exposto e Advisors continua
obrigatória após a implantação autorizada.

Dados livres em `description`, `public_reference` e referências públicas podem
conter contato ou localização precisa digitados pelo usuário; orientar o
preenchimento, revisar exibição e moderar antes do piloto. Links assinados já
emitidos têm risco de validade até expiração/cache. O papel inicial de
administrador precisa de operação manual auditada. A migration não implementa
limpeza automática, fluxo de denúncias, tarefas nem favoritos persistidos.

## Integração incremental da SPA

O frontend atual é JavaScript modular com Vite, **não React/TypeScript**.
`src/supabase-client.js` apenas prepara o cliente. `BPAuth` e `BPStore` ainda
operam no armazenamento do navegador. Preservar os contratos globais, rotas,
visuais, comportamento de rascunho e testes do protótipo; introduzir adaptadores
assíncronos em fatias, sem migração automática dos dados fictícios.

| Ordem | Substituição | Aceite da fatia |
|---|---|
| 1 | `BPAuth`: cadastro, entrada, confirmação, recuperação, sessão e papéis via Auth + `profiles`/`user_roles` e RPC de troca de papel | Duas contas e guards corretos; nenhuma promoção pelo cliente |
| 2 | Feed e detalhe de `BPStore`: `occurrences` públicas, `pets`, publicação e edição autenticadas | Visitante consulta; tutor publica; segundo tutor não altera |
| 3 | Fotos: processamento existente de `src/images.js` seguido de upload Storage e metadado; download sob RLS | Pública somente a foto publicável; privada e de pista não vazam; deleção e órfãos verificados |
| 4 | `BPStore.sighting`: autenticado por tabela; visitante pelo Turnstile + ingresso confiável + função | Relato sem conta aceito sem acesso de leitura; quota e spoofing testados |
| 5 | Participantes, revisão e coordenadas via tabelas/RPCs existentes | Dois dispositivos cooperam, coordenada exata só a autor/tutor |
| 6 | Tarefas, denúncias/contestações, auditoria de interface e favoritos | Exigem desenho e migrations próprias antes de substituir o armazenamento local; não fingir persistência multiusuário |

O formulário atual aceita foto local até 8 MB; o bucket remoto aceita 5 MiB.
Alinhar compressão, validação e mensagens no momento da fatia 3. As
funcionalidades locais sem modelo SQL devem permanecer explicitamente como
demo até sua fatia estar pronta, para não sugerir sincronização inexistente.

## Comandos de implantação — **somente após autorização e bloqueios resolvidos**

No checkout versionado e revisado, confirmar novamente o projeto e o diff:

```powershell
git status --short
npm.cmd exec -- supabase projects list --output-format json
npm.cmd exec -- supabase migration list --linked
npm.cmd exec -- supabase db push --dry-run --linked --skip-vault
```

Executar o inventário `supabase/preflight/remote_preflight.readonly.sql` no SQL
Editor e confirmar ausência de colisões. Com autorização expressa para esse
projeto e janela de implantação:

```powershell
npm.cmd exec -- supabase db push --linked --skip-vault
npm.cmd exec -- supabase secrets set --project-ref jpnvizdhyrvliqgvyxzx --env-file supabase/functions/.env
npm.cmd exec -- supabase functions deploy report-guest-sighting --project-ref jpnvizdhyrvliqgvyxzx
```

O arquivo `supabase/functions/.env` deve existir apenas localmente, com valores
reais, fora do Git. A função só deve receber tráfego público após o bloqueio de
IP/proxy descrito acima ser resolvido e testado. Não usar `--prune`. Configurar
Auth no Dashboard, pois `db push` aplica migrations e não prova que as opções
remotas de Auth correspondem ao arquivo local.

## Homologação após implantação autorizada

1. `migration list` mostra a versão remota e Advisors de segurança remotos são
   revisados; grants, RLS e bucket privado conferidos no destino.
2. Cadastro/confirmação e recuperação de senha reais funcionam com URLs e SMTP
   corretos. Primeiro administrador é concedido/auditado por operação segura.
3. Duas contas em dispositivos separados testam acesso cruzado, função ativa,
   aprovação de parceiro por terceiro, suspensão e moderação sem autoaprovação.
4. Visitante vê feed e fotos publicáveis, não vê arquivos privados, pistas nem
   localização exata; upload e remoção funcionam sob RLS.
5. Avistamento sem conta funciona pelo ingresso confiável com token real; testes
   negativos cobrem origem, token, IP forjado, bypass direto e limite concorrente.
6. Logs e alertas de abuso, erros e limpeza estão definidos; retenção e backup
   têm responsável. A SPA deixa claro quais módulos ainda são demonstrativos.

Até esses critérios, a Sprint 2 não deve ser apresentada como serviço público.
