# Matriz de rastreabilidade — versão de apresentação do BuscaPet

**Revisão:** 24/11/2026 · **Projeto Integrador II** · **baseline funcional publicada:** `2507a68`.

A classificação abaixo se refere **exclusivamente à versão local publicada**. Os IDs RF01–RF14 e RNF01–RNF07 foram mantidos da matriz acadêmica anterior; seus enunciados originais foram respeitados. RF15/RF16 e RNF08/RNF09 **não possuem enunciado na fonte** e não foram inventados. Implementação remota com Supabase, migrations e RLS é uma evolução separada, **não homologada como parte desta apresentação**.

### RF — requisitos funcionais

| ID | Requisito herdado | Evidência do modo de apresentação | Avaliação no escopo |
|---|---|---|---|
| RF01 | Lista pública e estado vazio | `src/real-app.js`; `tests/presentation-homologation.browser.cjs` | Verificado em Chromium no cenário de alertas semeados |
| RF02 | Pesquisa e filtros | `src/real-app.js`; testes de navegação | Implementado; busca e filtros exercitados nos testes de UI |
| RF03 | Cadastro com validação | `src/local-preview.js`; testes de conta e empresa | Implementado **localmente**; sem e-mail real |
| RF04 | Login, logout e rotas privadas | `src/local-preview.js`, `src/real-app.js`; jornada de navegador | Verificado localmente; sem autenticação de servidor |
| RF05 | Cadastro e edição de animal | `src/real-app.js`, adaptador local; testes de tutor/admin | Implementado no navegador |
| RF06 | Publicar perda/encontro e localizar no feed | `src/real-app.js`; jornadas de navegação | Implementado e demonstrável no mesmo navegador |
| RF07 | Foto e dados úteis na ocorrência | `src/local-preview.js`, `src/images.js` e testes de foto/cartaz | Implementado; fotos locais, não Storage remoto |
| RF08 | Mapa de busca e filtros | `src/search-map.js`, `src/real-app.js`; teste de rota | Rota verificada; consulta geográfica externa depende de rede |
| RF09 | Avistamento rejeita data futura | Validação do avistamento; regressões e suíte local | Implementado localmente; nunca afirmar teste do backend |
| RF10 | Só autorizado altera recurso privado | `src/permissions.js`, `src/local-preview.js`; `presentation-permissions-qa.test.cjs` | Verificações locais de propriedade; **não equivale a RLS** |
| RF11 | Tema, contraste e tamanho do texto | `src/ui-preferences.js`, `style.css` | Controles implementados; auditoria completa de acessibilidade pendente |
| RF12 | Rede de apoio consultável | `src/nearby-services.js`, `src/real-app.js`; rota e empresas | Implementado; estabelecimentos independentes e consulta por proximidade |
| RF13 | Denúncia e moderação | `src/local-preview.js`, painel admin; testes de isolamento e empresa | Implementado **localmente**, com justificativa para decisões |
| RF14 | Modo local identificado | `README.md`, este dossiê, `events.js`, `local-preview.js` | **Documentado e controlado por build**, sem aviso visual na Home a pedido do projeto |
| RF15–RF16 | **Não definidos na fonte acadêmica** | — | Sem critério para avaliar |

### Funcionalidades adicionais, sem criar IDs RF retroativos

| Funcionalidade comprovável | Arquivo/rota | Observação |
|---|---|---|
| Cartaz PNG e impressão | `pet-poster.js`; `#cartaz/:id` | Contato incluído opcionalmente pelo titular |
| Comparação de possíveis animais | `pet-matching.js`; `#semelhantes/:id` | Algoritmo determinístico, não reconhecimento facial |
| Carteirinha digital | `local-preview.js`; `#carteirinha/:id` | Conteúdo privado ao perfil no modo local |
| Agenda de cuidados | `local-preview.js`; `#agenda` | Compromissos locais; sem notificações automáticas |
| Empresas e vitrine comercial | `local-preview.js`, `real-app.js` | Aprovação local, não validação jurídica |
| WhatsApp guiado | `real-app.js`; `#contato/:id` | Sem chat ou antispam robusto |

### RNF — requisitos não funcionais

| ID | Enunciado da fonte | Evidência atual | Avaliação |
|---|---|---|---|
| RNF01 | Sem overflow em 320–1440 px | `presentation-homologation.browser.cjs` em 320/390/768/1440 px | Aprovado nas **quatro larguras verificadas**; 1024 px não é parte desse workflow |
| RNF02 | Uso por teclado | Componentes da UI e testes anteriores | Parcial; não há comprovação de leitor de tela |
| RNF03 | Entradas inválidas rejeitadas | `validation.js` e testes dos formulários/adapter | Implementado e testado no escopo local |
| RNF04 | Sem segredo privilegiado no navegador | `.env.example`, `supabase-client.js`, inspeção estática | Parcial; sem revisão de segurança abrangente |
| RNF05 | Autorização remota de leitura/edição | Arquivos RLS no repositório, **não ativos no build local** | **Não aplicável ao modo apresentado; homologação remota pendente** |
| RNF06 | Check, testes e build repetíveis | Workflows `verificacao.yml` e `homologacao-apresentacao.yml` | Aprovado em 19/11/2026; documentação editada depois |
| RNF07 | Manutenção/evolução rastreáveis | Git, branches, PRs, testes e registro de evolução | Evidência em histórico de alterações |
| RNF08–RNF09 | **Não definidos na fonte acadêmica** | — | Sem critério para avaliar |

### Evidências verificadas

- [Pipeline: sintaxe, testes e build](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445999) — sucesso.
- [Pipeline: Chromium, permissões e layouts](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445883) — sucesso.
- [Dossiê da entrega atual](ENTREGA_PROJETO_INTEGRADOR_II_2026-11-24.md).
- [Perguntas para defesa](PERGUNTAS_ENGENHARIA_PI2.md).

**Atenção à diferença temporal:** a tabela antiga abaixo é um registro de 16/11/2026, incluindo ensaios e ambientes distintos; não substitui esta matriz.

---

## Anexo histórico — matriz de 16/11/2026 (preservada)

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
