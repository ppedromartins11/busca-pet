# R4.4/R4.5: bloqueio de escrita para a janela de release

Estado em 2026-11-07: implementação e homologação **locais**. Nenhuma operação
de escrita foi executada no Supabase ou Vercel remotos. O mecanismo não prova
congelamento completo de Storage, Auth e integrações externas; o release segue
**NÃO APTO** até os controles operacionais e a cópia externa serem verificados.

## Inventário dos canais de escrita

| Canal | Superfícies auditadas | Controle demonstrado | Limitação |
| --- | --- | --- | --- |
| Contas e papéis da aplicação | `profiles`, `user_roles`, `partner_profiles` | Trigger de instrução para INSERT/UPDATE/DELETE/TRUNCATE; signup novo também falha quando o trigger de `auth.users` tenta criar o perfil | Sessões, refresh tokens e outras tabelas gerenciadas de Auth não são congelados |
| Animais e ocorrências | `pets`, `occurrences` | Mesmo trigger; abrange REST, cliente antigo, retorno após INSERT/UPDATE e RPCs de estado | Cliente antigo que faz SELECT amplo pode receber `42501` antes do trigger; verificar contagem para excluir escrita parcial |
| Participação e avistamentos | `occurrence_participants`, `sightings`, `buscapet_private.sighting_locations` | Mesmo trigger, inclusive RPC `SECURITY DEFINER` de revisão/coordenadas | Requisições externas já aceitas precisam de drenagem/reconciliação |
| Fotos e locais | `occurrence_photos`, `pet_photos`, `occurrence_public_locations`, `sighting_public_locations`, `partner_public_locations` | Trigger cobre metadados e localizações exatas/aproximadas | Storage físico não faz parte da transação desses metadados |
| Denúncias e administração | `buscapet_private.occurrence_reports`, `occurrence_report_history`, `admin_audit` e tabelas de perfil/ocorrência acima | Trigger cobre escrita direta e RPCs de denúncia, moderação, parceiro, papéis e status de conta | Leituras administrativas permanecem autorizadas pelo RLS/RPC existente |
| Ingresso sem conta | Worker Cloudflare → Edge Function → `ingest_guest_sighting` com `service_role`; `guest_sighting_limits` e `guest_sighting_nonces` | R4.5 exige modo operacional `open` e consulta assinada de estado antes da cota; trigger R4.4 rejeita a transação com `PT503` | Uma ativação entre preflight e RPC ainda pode consumir uma cota; fechar ambos os modos e drenar ingressos antes de ativar o gate |
| Storage com JWT de usuário | `storage.objects` no bucket privado `pet-media` | Três políticas RLS restritivas para upload, upsert e remoção; downloads autorizados continuam | Rejeição de metadado não prova ausência universal de objeto físico órfão; inventário de bytes e metadados é obrigatório |
| Storage com `service_role` ou operação administrativa | API de Storage, inclusive buckets | **Sem bloqueio pelo RLS**. Upload privilegiado durante a manutenção foi reproduzido e removido na stack isolada | Inventariar e suspender consumidores de chave privilegiada; sem isso não há freeze comprovado |
| Processos assíncronos e integrações | Código local contém Worker, Durable Object e uma Edge Function; não foram encontrados jobs ou cron próprios adicionais | Banco bloqueia gravações nas 18 tabelas inventariadas | Configuração remota, outros consumidores de chaves e eventuais jobs externos exigem inventário de produção somente leitura |

O conjunto de 18 triggers corresponde às 18 tabelas de aplicação observadas
em `public` e `buscapet_private` na stack isolada. Não há triggers novos em
`auth` ou `storage`. Uma nova tabela de aplicação após R4.4 exigirá revisão e
inclusão explícita antes de fechar uma janela futura.

## Arquitetura e privilégios

`20261023200000_maintenance_gate_r4_4.sql` cria uma linha de estado e uma
tabela de transições em `buscapet_private`, sem grants de leitura ou escrita
para `anon`, `authenticated` ou `service_role`; RLS também fica ativo nessas
tabelas. O estado inicial é aberto. A função privada
`set_maintenance(active, reason, expected_generation)` usa os direitos do
invocador, não recebe grant para papéis da API e rejeita geração antiga.
Somente o operador com conexão de banco apropriada pode ativar/desativar.

Cada tentativa de DML nas tabelas listadas passa por trigger `BEFORE` por
instrução. O helper privado consulta a linha de estado `FOR SHARE`, mantendo
o lock até o commit da escrita. Ativação atualiza a mesma linha e espera
essas transações terminarem antes de confirmar o bloqueio. Em manutenção,
o trigger lança `PT503` com mensagem estável `BUSCAPET_MAINTENANCE_ACTIVE`;
PostgREST devolveu HTTP 503 no teste local. O frontend local converte o código
em aviso sem detalhes internos. A Edge Function e o Worker locais propagam
`maintenance_active` sem revelar tabelas ou dados.

As transições, inclusive um `UPDATE` direto do operador com geração válida,
são auditadas na mesma transação em
`buscapet_private.maintenance_transitions`, com geração, estado, motivo,
papel de sessão e horário. Rejeições individuais não podem ser gravadas na
mesma transação que lança erro: essa inserção também seria revertida. Para
tentativas negadas, usar logs/contadores externos sem dados privados.

Os grants e políticas existentes de leitura, propriedade, RLS e Storage não
foram removidos. A função de leitura do estado é executável pelo papel
`authenticated` apenas para a política do Storage, mas vive em schema não
exposto pela Data API e retorna somente se a escrita está aberta. Um cliente
anônimo não recebe esse grant. A página de manutenção no domínio ainda precisa
ser preparada na operação de release; ela reduz novas ações na interface,
enquanto o banco protege sessões antigas e REST direto.

## Ordenação R4.4 comprovada antes da R4.5

O histórico remoto conhecido tinha 11 versões, terminando em `20261023195139`.
A R4.4 foi criada com `supabase migration new` e **somente o arquivo novo** foi
posicionado como `20261023200000`, antes da R4.1 (`20261023213532`). As três
migrations R4 existentes não foram alteradas nem renomeadas.

Um único `supabase db push` com todas as migrations pendentes não permite
ativar o bloqueio entre R4.4 e R4.1. Usar, após autorização, uma área local de
staging de migrations contendo config e as 11 migrations históricas mais
R4.4. Conferir hashes, projeto, TLS, histórico e `--dry-run`; aplicar **somente
R4.4**. Ativar e comprovar o bloqueio. Acrescentar então ao pacote as três
migrations R4 originais, conferir hashes e novo `--dry-run`; aplicar na ordem
R4.1, compat R4.1, R4.3.1. Não usar `--include-all`, `migration repair` ou
manipulação manual de `supabase_migrations` para contornar a ordem.

Esse procedimento R4.4 foi reproduzido exclusivamente em stack isolada antes
da extensão R4.5:
11 migrations → push local da R4.4 → 12; ativação → falha SQL sintética
controlada, sem avançar histórico e com gate ativo; push local das três R4
→ 15 com gate ainda ativo. A falha sintética existiu somente no pacote
descartável, nunca no código de origem. O preflight remoto deve confirmar as
11 versões antes da janela; essa contagem pode ter mudado.

## Homologação R4.4 anterior e limites

- Stack nova com 15 migrations na ordem correta; R4.4 inicia aberta.
- pgTAP: 13 arquivos, **423 testes aprovados**, incluindo 47 da R4.4. Cada
  uma das 18 tabelas teve DML privilegiado negado; TRUNCATE também foi negado.
- Integração: **51 verificações** de Auth, REST, cliente antigo, papéis,
  RPCs, Edge assinada, Storage e recuperação. O bloqueio aguardou uma
  transação de escrita em andamento; depois de abrir, escrita normal voltou.
- Upload, upsert e delete com JWT foram negados. O objeto anterior manteve o
  mesmo SHA-256 e o upload rejeitado não deixou arquivo físico na stack local.
- Upload de Storage com `service_role` **passou durante o bloqueio**. O teste
  removeu o objeto criado; isso comprova a lacuna, não uma proteção completa.
- Cadastro de nova conta falhou pela criação do perfil, mas uma sessão Auth
  existente renovou o token durante o bloqueio; o estado Auth deve ser
  reconciliado no backup final.
- Um cliente antigo que pede retorno amplo recebeu `42501`; a contagem de
  ocorrências permaneceu inalterada. REST direto autorizado recebeu `PT503`.
- O Worker tem teste unitário da propagação de `maintenance_active`; a Edge
  assinada foi testada contra o banco local. Cloudflare real e sua configuração
  remota não foram modificados nem homologados nesta etapa.
- `npm.cmd run check`, `npm.cmd test` (86/86), `npm.cmd run build`, lint SQL
  restrito a `public,buscapet_private` e `git diff --check` passaram. Quatro
  suítes de navegador locais passaram; a Home cobriu 320, 390, 768, 1024 e
  1440 px. O build mantém aviso de chunk acima de 500 kB.

O backup final deve ser feito **depois** da ativação e da drenagem de
requisições em andamento. Inventariar `auth.users`, sessões relevantes,
`storage.objects`, bytes físicos, fotos vinculadas, Durable Object/ingresso e
contagens das tabelas antes/depois. Qualquer diferença inexplicada cancela a
janela. PostgreSQL e Storage não oferecem snapshot conjunto atômico.

## Procedimento e recuperação previstos

1. Conferir estado/generation como operador de banco e registrar os contadores
   de todas as 18 tabelas, Auth, Storage e ingressos externos.
2. Pausar Worker/Edge e qualquer consumidor conhecido de `service_role`;
   mostrar interface de manutenção no domínio. Não tratar a interface como
   prova de bloqueio.
3. Ativar via `select buscapet_private.set_maintenance(true,
   '<motivo aprovado>', <generation observada>);`. Confirmar `active=true`,
   transição auditada, rejeição de cliente antigo, REST, Storage com JWT,
   RPCs e contas. Drenar uploads e operações privilegiadas separadamente.
4. Exportar e restaurar backup final, copiar payload para dispositivo externo
   criptografado aprovado e reconciliar inventários. Manter o gate fechado.
5. Aplicar as três R4 somente com autorização, verificar contratos, promover
   o build compatível e conferir domínio/asset antes de reabrir.
6. Em falha parcial, manter gate e interface de manutenção, registrar versão
   realmente aplicada e corrigir para a frente após revisão. Não retornar ao
   frontend antigo nem restaurar DDL às cegas.
7. Depois dos smokes de leitura e da verificação do domínio, desativar via
   `set_maintenance(false, '<motivo aprovado>', <generation atual>)`.
   Retomar ingressos, executar smokes de escrita por papel, reconciliar
   objetos/contagens e monitorar. Geração antiga falha com `40001`.

Os comandos acima são exemplos planejados; nenhuma ativação remota ocorreu.
Sem inventário e suspensão comprovada de Storage privilegiado, Auth e
ingressos externos, além de backup externo verificado, o parecer continua
**NÃO APTO PARA PUBLICAÇÃO**.

## R4.5: ingressos privilegiados e lacunas restantes

`20261023200001_guest_ingress_maintenance_status_r4_5.sql` foi criada pelo CLI e
posicionada logo após R4.4, antes de R4.1. Expõe apenas a função booleana
`public.guest_ingress_writes_open()` à `service_role`. `anon` e `authenticated`
não podem executá-la, e nem `service_role` pode ler a tabela privada. A função
é `SECURITY DEFINER`, tem `search_path` fixo e usa o helper R4.4 com lock de
leitura. Não há alteração em `auth` ou `storage` gerenciados.

O Worker exige `BUSCAPET_WRITE_MODE=open` para POST e consulta a Edge por
`GET /report-guest-sighting/status` com HMAC, timestamp e nonce antes de
consumir a cota do Durable Object ou validar o Turnstile. A Edge valida o HMAC,
exige também `BUSCAPET_WRITE_MODE=open` e consulta o banco com sua chave
`service_role`. Falta de configuração, falha de rede ou erro da RPC negam o
ingresso. O POST da Edge exige o HMAC original e verifica o modo antes de
chamar `ingest_guest_sighting`; o trigger R4.4 continua sendo a autoridade
transacional final. A verificação antecipada é somente leitura, sem nonce ou
upload. Não envia chave privilegiada ao Worker ou navegador.

**Consumidores identificados no código local:** a Edge Function é o consumidor
de runtime confirmado de `SUPABASE_SERVICE_ROLE_KEY` para a RPC de avistamento;
o Worker usa apenas os segredos HMAC/rate, e a SPA Vite usa chave pública.
Os scripts de integração local usam `service_role` para fixtures e limpeza;
`tests/remote-mvp.integration.mjs` é um teste remoto com gate explícito e
escritas administrativas, que não deve rodar na janela. O mecanismo de backup
externo disponível (`tools/backup.mjs` no pacote de backup de 2026-11-06)
usa chave privilegiada para **listar e baixar** objetos; a inspeção estática
não encontrou upload, exclusão, cópia ou movimento nesse script. Jobs, outros
tokens, integrações e consumidores configurados fora do checkout continuam
**desconhecidos**: exigir inventário de secrets/rotas/jobs de Vercel,
Cloudflare, Supabase e operadores antes da janela. O acesso atual à listagem
de migrations Supabase foi negado; a listagem de deployments Vercel também
retornou 403. A consulta `get_project` confirmou apenas metadados do projeto.

**Storage privilegiado:** o ensaio local provou upload, cópia, movimento,
substituição e exclusão com `service_role` durante o gate fechado. Uma política
RLS adicional não corrige isso. Antes de fechar o gate, suspender os
consumidores conhecidos, impedir novos jobs e uploads administrativos,
confirmar a drenagem de requisições já aceitas e inventariar todos os objetos
por `bucket_id,name,id,updated_at` e hash de bytes. O exportador de backup
permanece apenas em modo de leitura. Se não for possível demonstrar a pausa de
algum consumidor privilegiado, cancelar a publicação.

**Auth:** cadastro novo falhou por causa do trigger de perfil, mas login,
refresh e solicitação de recuperação de senha funcionaram no ambiente local
durante o gate. Essas operações podem alterar tabelas gerenciadas de Auth sem
alterar os 18 objetos de aplicação. Para uma janela estável, suspender na borda
o cadastro e a recuperação; login e refresh podem permanecer para leitura,
com reconciliação de sessões/tokens. Não depender do erro de cadastro como
controle operacional. Operações Auth Admin e provedores externos exigem
inventário e pausa próprios; nenhuma configuração remota foi alterada.

### Reconciliação exigida na janela

1. Registrar antes da pausa, após a drenagem, após o backup, após as migrations
   e antes da reabertura: UTC, geração do gate, versões aplicadas e contagens
   das 18 tabelas. Para Auth, comparar IDs e estados de `auth.users`, perfis,
   sessões e pedidos de recuperação que sejam auditáveis; qualquer conta sem
   perfil ou perfil sem usuário exige investigação individual.
2. Comparar `storage.objects` por bucket/caminho/ID/atualização com o inventário
   físico e SHA-256 de cada byte. Verificar que cada `pet_photos` e
   `occurrence_photos` aponta para objeto existente e que não há novos objetos
   órfãos ou versões inesperadas. O banco e Storage não têm snapshot atômico;
   congelar ingressos, drenar operações e repetir os inventários após exportar.
3. Comparar avistamentos, `guest_sighting_nonces`, `guest_sighting_limits` e
   rejeições/aceites da Edge por janela temporal. Para o Durable Object,
   registrar contadores por identidade conhecida e métricas de requisições
   antes/depois; **não há enumeração completa de chaves no código atual**.
   Qualquer cota consumida na corrida entre preflight e fechamento deve ser
   identificada e reconciliada antes de retomar. Sem visibilidade suficiente,
   o freeze não está provado.

### Ensaio R4.5 em ambiente isolado

- Stack nova: 16 migrations; pgTAP **432/432** em 14 arquivos; lint restrito sem
  erro. Integração do gate: **64 verificações**. Worker: 10 testes unitários,
  incluindo modo fechado, falha de preflight e corrida que consome uma cota.
- O ensaio staged reproduziu 11 → R4.4 (12) → R4.5 (13) → ativação auditada;
  duas falhas SQL sintéticas mantiveram o gate em `13|ativo` e `14|ativo` após
  R4.1 parcial. As duas migrations restantes levaram a 16, ainda ativo;
  desativação auditada chegou à geração 2 e a escrita normal retornou.
- Um dump sintético de 927.830 bytes, papéis sem senhas, foto física de 68
  bytes e SHA-256 foram capturados sob gate fechado. A restauração em outro
  banco isolado da stack, com `supabase_admin`, confirmou 1 usuário/perfil,
  1 animal, 1 metadado Storage, 18 triggers, 3 políticas e estado ativo.
  A primeira tentativa com `postgres` falhou por privilégio insuficiente numa
  função Realtime; não foi aceita como prova de restauração. Esse ensaio usa
  dados sintéticos e não substitui backup/restauração final de produção.
- O frontend antigo fez SELECT amplo antes da R4.1 e recebeu `42501` depois.
  A view pública e o grant da RPC autenticada foram verificados no estado novo.
  Os testes de navegador usam fixtures, sem acesso ao Supabase remoto.

**Risco residual:** `service_role` Storage, Auth gerenciado, consumidores
externos desconhecidos, corrida de cota, ausência de cópia externa criptografada
do backup final e SHA de commit/build de release. Parecer: **NÃO APTO**.
