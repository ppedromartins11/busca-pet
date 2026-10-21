# Homologação local da migration inicial — 20/10/2026

**Registro histórico:** os 34 testes SQL e testes HTTP abaixo se referem à
revisão anterior. A Sprint 2.2 acrescentou nonce transacional e ingresso
Cloudflare; consultar `docs/SPRINT2_2_INGRESS.md` e os resultados da nova
execução local antes de considerar esta revisão homologada.

Escopo: `20261020233414_initial_buscapet_schema.sql`, antes da primeira aplicação
remota. Nenhum comando `supabase db push` foi executado e nenhum projeto remoto
foi alterado.

## Alterações

- `profiles.active_role` e `profiles.status` não têm permissão SQL de UPDATE
  para `authenticated`. A troca de função usa RPC que confere concessão e
  aprovação de parceiro. Suspensão exige moderador para contas comuns ou
  administrador para equipe, sem automoderação.
- `user_roles` aceita inserção direta somente de `colaborador` para a própria
  conta ativa. Parceiro precisa de candidatura pendente e aprovação por outra
  pessoa da equipe. Moderador e administrador dependem de concessão feita por
  administrador. O primeiro administrador exige provisionamento administrativo
  fora da aplicação.
- `occurrences.pet_id` é conferido contra o tutor da ocorrência, com bloqueio
  da linha do animal durante a verificação. Status, visibilidade e revisão
  ganharam operações específicas. Moderação não publica ocorrência privada.
- Metadados de foto exigem registro acessível e objeto no bucket `pet-media`
  com mesmo dono, caminho, MIME e tamanho. A verificação do objeto fica em
  função privada para evitar recursão entre policies. O bucket continua
  privado; arquivos de ocorrências públicas podem ser baixados por operação
  GET específica, sem listar arquivos privados.
- Coordenadas exatas de avistamento saíram da tabela exposta e ficam em
  `buscapet_private.sighting_locations`. Só autor do avistamento e tutor da
  ocorrência podem solicitá-las. Avistamentos e suas fotos permanecem
  restritos às pessoas autorizadas.
- `report-guest-sighting` recebe avistamentos sem conta mediante Turnstile,
  validação de entrada e limite transacional por origem/hora. Somente a função
  de borda usa a chave privilegiada. O banco não concede ingestão ao público.
- Funções `SECURITY DEFINER` ficam em `buscapet_private`; wrappers expostos são
  `SECURITY INVOKER`. Operações administrativas principais geram auditoria
  privada.

## Evidência local

Após `supabase start`, a migration foi executada integralmente no PostgreSQL
local. O primeiro ciclo pgTAP detectou recursão de RLS em fotos; ela foi
corrigida. Um teste HTTP detectou falha de `insert().select()` em ocorrência
privada; a policy de leitura direta do autor corrigiu o retorno. Sobre o SQL
final, foram aprovados **34/34** testes pgTAP, os testes HTTP de Storage e do
endpoint sem conta, **38/38** testes do protótipo, `npm.cmd run check`,
`npm.cmd run build`, `supabase db lint --local` e os Security e Performance
Advisors locais sem alertas. Para repetir:

```powershell
npm.cmd exec -- supabase db reset --local --no-seed
npm.cmd exec -- supabase test db --local
npm.cmd test
npm.cmd run check
npm.cmd run build
```

O teste SQL cobre autoatribuição de administrador, suspensão, autoaprovação de
parceiro, acesso entre tutores, vínculo indevido de animal, criação de foto sem
arquivo, avistamentos restritos, consulta pública, ingestão anônima e quota.
`tests/supabase-storage.integration.mjs` cobre upload, download próprio,
download público condicionado, bloqueio de arquivo privado, moderação e
exclusão. `tests/supabase-guest.integration.mjs` cobre entrada inválida,
envios válidos com [credencial de teste da Cloudflare](https://developers.cloudflare.com/turnstile/troubleshooting/testing/),
limite por origem e invisibilidade dos registros para `anon`. Também cobre
origem não permitida e corpo excessivo. O segredo de teste retornou
`example.com` como hostname na execução local; a produção deve usar o domínio
real do widget.

## Limitações e riscos restantes

- O frontend permanece no modo demonstrativo; a integração com Auth, RPC,
  Storage, Turnstile e o endpoint de avistamento é uma etapa posterior. A
  migration preserva o protótipo atual, mas não o transforma em serviço real.
- A função anônima depende de proxy que sobrescreva `cf-connecting-ip`; ela
  falha fechada se o cabeçalho faltar. Testes locais usam o segredo de teste
  da Cloudflare. O domínio, proxy, segredo real, limites por rede e observação
  de abuso ainda exigem homologação em ambiente de implantação.
- Texto livre da área de avistamento pode incluir localização pessoal exata.
  Moderação, retenção e orientação de preenchimento precisam ser definidos
  antes de abrir o serviço ao público.
- Upload e metadados são duas operações: uma falha entre elas pode deixar
  objeto privado órfão. É necessário processo de limpeza e política de
  retenção, inclusive para hashes de limite e coordenadas de avistamento.
- URLs assinadas já emitidas podem continuar válidas por seu prazo. Usar prazo
  curto e avaliar revogação operacional antes de publicar conteúdo moderado.
- A auditoria atual registra concessões, aprovação, suspensão e visibilidade;
  justificativa, identidade do operador em fluxo administrativo e trilha de
  revisão detalhada devem ser ampliadas na etapa de operação real.
- Security Advisors, testes com contas reais e configuração da Data API em
  projeto remoto só podem ser verificados após autorização expressa para uma
  implantação de desenvolvimento. Não houve validação remota.
