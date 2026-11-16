# Homologação isolada e demonstração do BuscaPet

Atualizado em 08/11/2026. Este documento registra o estado observado do checkout; não significa que haja uma URL ou backend de homologação disponível.

## Estado atual

**A demonstração online ainda não está configurada.** Não foi encontrado um projeto Supabase isolado autorizado para o BuscaPet. O Docker Desktop está parado e não pôde ser iniciado neste ambiente. A inspeção do Vercel retornou bloqueio de acesso às listagens. Nenhum projeto remoto foi criado, alterado ou publicado.

O checkout contém 16 migrations em ordem cronológica local. Há uma homologação isolada anterior registrada no histórico do trabalho; ela não substitui uma nova execução neste ambiente, que está bloqueada pela indisponibilidade do Docker. A configuração `.env` existente não deve ser usada para ensaios: as credenciais carregadas localmente apontam para produção. Não copie esses valores, nem execute testes de escrita enquanto o alvo continuar assim.

| Fluxo requerido | Estado para demonstração online | Situação do código local |
| --- | --- | --- |
| Criar conta | Não configurado | Tela e chamada Supabase Auth implementadas; depende do projeto isolado, confirmação de e-mail e SMTP testados. |
| Login e logout | Não configurado | Implementados no cliente; falta testar com contas sintéticas do ambiente isolado. |
| Recuperar senha | Não configurado | Fluxo implementado; depende de SMTP, URL de retorno e confirmação do e-mail. |
| Cadastrar animal e fotografia | Não configurado | Fluxos implementados com Storage privado; falta provar upload, leitura e isolamento no projeto isolado. |
| Publicar ocorrência perdida/encontrada | Não configurado | Formulário e operações estão no código; falta execução real com usuário de teste. |
| Home, pesquisa e filtros | Não homologado remotamente | UI pode ser verificada com fixtures locais; isso não prova leitura real da API. |
| Detalhes e fotos autorizadas | Não configurado | Cliente usa metadados e download privado; falta validar RLS/Storage e vínculo com ocorrências reais. |
| Minha Área e edição | Não configurado | Cliente usa operações autenticadas e contratos próprios; falta testar com o dono e uma segunda identidade. |
| Mapa com região aproximada | Não configurado | Consulta ao contrato público implementada; não há pontos sintéticos no backend de demonstração. |
| Registrar e consultar avistamento | Não configurado | Fluxo autenticado implementado; o envio sem conta depende também de Cloudflare/Turnstile/Edge Function configurados. |
| Rede de apoio | Parcial | Orientações de participação estão disponíveis; não há diretório de parceiros reais autorizados. |
| Administração e moderação | Não configurado | Telas e contratos existem; falta ambiente isolado com identidade administrativa autorizada e verificação de permissões. |
| Isolamento entre usuários e acesso negado | Não homologado remotamente | RLS/RPC e testes locais existem; falta ensaio online com duas contas sintéticas e sem expor dados privados. |

As fixtures usadas por testes de interface são apenas dados descartáveis de navegador. Elas não são uma demonstração funcional, não substituem teste de integração e não devem ser descritas como registros do Supabase.

## Bloqueios para habilitar a URL

1. Autorizar a criação ou indicar um projeto Supabase de homologação exclusivo, sem dados de produção e sem vínculos com outros sistemas. A criação pode gerar custo do provedor; nenhum recurso será criado sem autorização específica.
2. Aplicar as 16 migrations primeiro em ambiente descartável/local e então no projeto isolado autorizado. Conferir que o gate R4.4/R4.5 permite operações normais no sandbox.
3. Configurar Auth: Site URL e redirects apenas para a origem de homologação; configurar e testar entrega de e-mail com caixas controladas.
4. Configurar Storage privado e validar regras de upload, leitura e exclusão com duas identidades.
5. Se for necessário publicar uma URL, autorizar um projeto Vercel separado do projeto de produção, configurar variáveis somente do sandbox e revisar o build gerado antes da publicação.
6. Preparar contas sintéticas. A função administrativa deve ser atribuída por procedimento seguro, sem tornar cadastro público capaz de obter privilégio.

O arquivo `.env.example` contém placeholders. Só preencha `.env.local` depois que o projeto isolado estiver provisionado e autorizado. Nunca coloque service role, senha do banco, token de Worker ou secret key em variável `VITE_*`.

## Migrations locais

O diretório `supabase/migrations/` contém 16 arquivos. As três migrations de contratos R4 presentes no checkout são:

- `20261023213532_occurrences_read_contracts_r4_1.sql`
- `20261023214258_occurrences_policy_contract_compat_r4_1.sql`
- `20261024150413_occurrence_public_locations_policy_contract_compat_r4_3_1.sql`

Elas vêm depois das migrations de schema, fotos, mapa, administração, moderação, denúncias e gate de manutenção. Em sandbox recém-criado, verificar a lista e a ordem com `supabase migration list --local` antes de aplicar. Não usar `db push` contra produção. Após aplicação, validar contracts públicos, contratos do dono, políticas de localização e estado aberto do gate.

## Roteiro repetível quando o sandbox existir

Use somente identidades e dados sintéticos. Antes da apresentação, anote os identificadores de fixtures criadas para poder removê-las de forma controlada depois.

1. Como visitante, abrir a Home, pesquisar uma cidade/termo e filtrar alertas públicos. Abrir o detalhe e conferir que só são exibidos campos e região aproximada autorizados.
2. Criar a conta de Tutor A pelo fluxo público, confirmar o e-mail se solicitado e entrar. Cadastrar um animal sintético e enviar uma foto criada para teste.
3. Publicar uma ocorrência perdida com cidade, região, referência pública fictícia, consentimento explícito para região aproximada e foto autorizada. Confirmar que aparece na Home e no detalhe.
4. Em outro perfil, entrar como Tutor B. Confirmar que a ocorrência pública pode ser vista, mas animal, fotos privadas e área pessoal de A não podem ser lidos nem editados.
5. Como B, registrar um avistamento sintético. Como A, consultar a pista na Minha Área e observar o ponto aproximado no mapa. Nunca exibir nem inferir coordenada privada.
6. Validar logout, login, recuperação de senha (somente com caixa controlada), estado vazio/erro, tema claro/escuro, celular e navegação por teclado.
7. Como usuário sem privilégio, tentar acessar operações administrativas e confirmar negação. Só então repetir com a identidade administrativa autorizada e demonstrar a triagem/moderação suportada pelas migrations.
8. Mostrar a Rede de apoio como orientações comunitárias enquanto não houver parceiros que tenham autorizado a divulgação. Não inventar nomes, contatos ou serviços.

## Checagem local sem alcançar produção

O modo de desenvolvimento sem Supabase continua servindo para navegação local e testes de UI. Em build de produção sem configuração Supabase, o app agora mostra aviso de ambiente desconectado e não monta o protótipo legado. Para a checagem de navegador desse aviso, faça o build com as duas variáveis `VITE_SUPABASE_*` vazias, inicie `vite preview` em porta local e execute `node tests/environment-gate.browser.cjs`.

Essa checagem cobre somente o bloqueio de configuração ausente. Para homologação real, executar depois `npm.cmd run check`, `npm.cmd test`, `npm.cmd run build`, suítes de navegador e testes Supabase contra o projeto isolado autorizado. Registre resultados e identidades de teste; não use os testes de UI com fixtures como substitutos.
