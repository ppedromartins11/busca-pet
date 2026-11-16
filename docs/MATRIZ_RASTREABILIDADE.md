# Matriz de rastreabilidade — BuscaPet

Estado do checkout local em 16/11/2026. Fonte dos enunciados: matriz acadêmica do commit `c13c0a2` (branch `docs/engenharia-software-semestre-2026`). Essa fonte define RF01–RF14 e RNF01–RNF07; **não define RF15–RF16 nem RNF08–RNF09**. As nove aulas não estavam anexadas ao checkout; os nomes informados na solicitação orientam a análise. `Verificado` significa teste executado nesta revisão no escopo indicado, nunca homologação remota. `Sem homologação` significa implementação identificada e teste remoto pendente.

| ID | Critério da fonte | Módulo/contrato | Teste e resultado nesta revisão | Classificação |
|---|---|---|---|---|
| RF01 | Lista pública e estado vazio | `real-app.js`, `remote-store.js`, view `public_occurrences` | `home-ui.browser.cjs` passou com fixtures; backend não testado | Implementado sem homologação |
| RF02 | Pesquisa e filtros | `real-app.js`, `app.js` | Home com fixtures e `browser.cjs` local passaram | Implementado e verificado localmente |
| RF03 | Cadastro com validação | `auth.js`, `validation.js`, Supabase Auth | `auth-real.test.cjs` e navegador local passaram; e-mail real não testado | Implementado sem homologação |
| RF04 | Login, logout e rotas privadas | `auth.js`, `router.js` | `auth-real.test.cjs`, `access.test.cjs` e navegador local passaram; Auth remoto não testado | Implementado sem homologação |
| RF05 | Cadastro e edição de animal | `real-app.js`, `remote-store.js`, `pets`/RLS | Fluxo local no navegador passou; escrita conectada não repetida | Implementado sem homologação |
| RF06 | Publicar perda/encontro e localizar no feed | `real-app.js`, `remote-store.js`, `occurrences`/RLS | Publicação local e regressão com fixture passaram | Implementado sem homologação |
| RF07 | Foto e dados úteis na ocorrência | `images.js`, `remote-store.js`, `pet_photos`, `occurrence_photos`, `pet-media` | Foto local no navegador e testes do cliente passaram; Storage real não repetido | Implementado sem homologação |
| RF08 | Mapa de busca e filtros | `search-map.js`, `real-app.js`, `search_public_map_points` | Código e testes anteriores em `docs/MAPA_REAL.md`; execução atual ausente | Implementado sem homologação |
| RF09 | Avistamento rejeita data futura | `validation.js`, `remote-store.js`, `sightings` | `store.test.cjs` e `remote-store.test.mjs` passaram; escrita real não repetida | Implementado e verificado localmente |
| RF10 | Só autorizado altera recurso privado | `permissions.js`, RLS/migrations | Testes de cliente passaram; pgTAP e duas identidades não repetidos | Implementado sem homologação |
| RF11 | Tema, contraste e tamanho de texto | `ui-preferences.js`, `style.css` | Home com fixtures testou tema; demais controles não foram revisados manualmente | Parcial |
| RF12 | Rede de apoio consultável | `app.js`, `real-app.js` | Rota `#services` abriu nos testes com fixtures; não há diretório de parceiros homologados | Parcial |
| RF13 | Denúncia e moderação | `real-app.js`, RPCs e migrations de moderação | Browser com fixtures e testes do cliente passaram; backend não repetido | Implementado sem homologação |
| RF14 | Modo local identificado | `events.js`, `store.js`, `README.md` | `browser.cjs` passou com `envDir` isolado | Implementado e verificado localmente |
| RF15 | **Sem enunciado na fonte** | — | Não verificável | Não implementado: especificação pendente |
| RF16 | **Sem enunciado na fonte** | — | Não verificável | Não implementado: especificação pendente |

| ID | Critério da fonte | Módulo/contrato | Teste e resultado nesta revisão | Classificação |
|---|---|---|---|---|
| RNF01 | Sem overflow em 320–1440 px | `style.css`, telas | Home: 320/390/768/1024/1440; modo local: 11 larguras, passaram | Implementado e verificado localmente |
| RNF02 | Uso por teclado | Formulários, menu e foco | Browser com fixtures e modo local passaram; leitor de tela não testado | Parcial |
| RNF03 | Entradas inválidas rejeitadas | `validation.js`, `images.js` | 90 testes JS passaram, incluindo casos negativos | Implementado e verificado localmente |
| RNF04 | Sem segredo privilegiado no navegador | `.env.example`, `supabase-client.js` | Inspeção estática do cliente; inspeção completa de artefato remoto não feita | Parcial |
| RNF05 | Autorização remota de leitura/edição | RLS, RPCs, Storage | Docker indisponível; teste atual com duas identidades ausente | Implementado sem homologação |
| RNF06 | Check, testes e build repetíveis | `package.json`, workflow | Três comandos passaram localmente; CI aprovado só no SHA `483d2a5` | Implementado e verificado localmente |
| RNF07 | Manutenção/evolução rastreáveis | Git, `SPRINTS.md`, relatório final | Histórico e mudanças locais inspecionados | Implementado e verificado localmente |
| RNF08 | **Sem enunciado na fonte** | — | Não verificável | Não implementado: especificação pendente |
| RNF09 | **Sem enunciado na fonte** | — | Não verificável | Não implementado: especificação pendente |

Os nomes curtos de módulos da tabela referem-se a `src/`; SQL está em `supabase/migrations/`. Resultado, comandos, riscos e limitações constam de [VERIFICACAO_ACADEMICA_2026-11-16.md](VERIFICACAO_ACADEMICA_2026-11-16.md). A classificação deve ser revista quando os quatro enunciados ausentes e o ambiente de homologação forem disponibilizados.
