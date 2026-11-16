# Engenharia de Software aplicada ao BuscaPet

> Referência acadêmica recuperada do commit `402a226` em 16/11/2026. A situação atual e os resultados executados estão na [matriz](MATRIZ_RASTREABILIDADE.md) e no [relatório de verificação](VERIFICACAO_ACADEMICA_2026-11-16.md). As aulas originais não estavam no checkout; a correspondência abaixo usa os nove títulos informados na solicitação.

Material técnico do projeto integrador de Análise e Desenvolvimento de Sistemas (2026), baseado nas aulas 01–08 e 11 de Engenharia de Software, ministradas por Adriano Marcelo Marques Miyashiro. O conteúdo registra decisões do projeto; não constitui certificação de segurança ou conformidade.

## 1. Problema, produto e processo (Aula 01)

O problema é a dispersão de informações de animais perdidos, encontrados e avistados. O **produto** é uma aplicação web responsiva para publicar, consultar e acompanhar ocorrências. O **processo** inclui levantamento de requisitos, priorização, modelagem, implementação incremental, validação e manutenção. A entrega acadêmica prioriza telas e jornadas funcionais; uma operação pública com usuários reais depende de homologação de autenticação, permissões, armazenamento e disponibilidade.

## 2. Modelo de desenvolvimento (Aula 02)

A evolução ocorre em **incrementos**, com trabalho organizado em sprints descritas em `docs/SPRINTS.md`. O processo aproxima-se de desenvolvimento iterativo e incremental, sem reivindicar adoção integral de Scrum. O ciclo é: demanda → requisito → decisão de projeto → implementação → teste → revisão → nova versão. Critérios de aceitação devem ser verificáveis antes de classificar uma funcionalidade como concluída.

## 3. Projeto e implementação (Aula 03)

Há separação explícita de responsabilidades: `validation.js` normaliza entradas; `permissions.js` centraliza autorizações de interface; `router.js` define navegação e guards; `auth.js` reúne fluxos de identidade; `remote-store.js` centraliza operações remotas; `store.js` guarda transações do protótipo local; `views.js` contém funções visuais reutilizáveis; `events.js` registra eventos globais; `real-app.js` e `app.js` compõem interfaces dos dois modos. A separação melhora coesão por responsabilidade e reduz acoplamento em relação a um script único, embora `app.js`/`real-app.js` ainda sejam extensos.

## 4. Arquitetura e decisões (Aula 04)

**Visão de contexto:** visitante/tutor ↔ navegador ↔ aplicação Vite/JavaScript ↔ serviço Supabase (Auth, Data API/PostgreSQL/RLS, Storage). Serviços Cloudflare de acesso anônimo dependem de implantação separada. **Visão modular:** `src/main.js` estabelece ordem dos módulos; `events.js` seleciona `BPRealApp` quando configurado o Supabase ou `BPApp` no modo local. **Visão de implantação:** Vite desenvolve/empacota o frontend estático; a hospedagem do frontend e o Supabase são serviços distintos.

Decisões registradas:
- **ADR-01 — SPA web responsiva**: evita distribuição de aplicativo móvel; exige cuidados com navegação, conexão e acessibilidade.
- **ADR-02 — dois modos identificáveis**: protótipo local como contingência; exige informar claramente que seus dados não circulam entre dispositivos e não constituem autenticação segura.
- **ADR-03 — responsabilidade remota por segurança**: Auth e RLS devem proteger dados mesmo que o usuário contorne a interface.
- **ADR-04 — localização aproximada**: evita divulgar endereços exatos em listagens públicas; exige verificar limites de exposição nos retornos da API.

## 5. Padrões (Aula 05)

As escolhas verificáveis são **separação por responsabilidade**, módulos de validação, **Repository/Adapter em sentido funcional** (o módulo `remote-store.js` concentra acesso remoto) e **delegação de eventos** em `events.js`. São semelhanças arquiteturais; não se deve afirmar implementação completa de MVC, SOLID ou padrões GoF sem evidência de estrutura e dependências. Evita-se inserir Factory, Singleton ou Observer apenas para citar nomes de padrões.

## 6. Estimativas, métricas e riscos (Aula 06)

As estimativas são hipóteses sujeitas a reavaliação. Para o semestre, classificar itens em pequeno/médio/grande, considerando incerteza e integração. Métricas propostas: casos de teste automatizados aprovados/total, percursos manuais concluídos/planejados, problemas impeditivos abertos, páginas com navegação por teclado verificada e requisitos rastreados/testados. Evitar métricas sem fonte ou taxa de sucesso inventada.

| Risco | Probabilidade | Impacto | Resposta |
|---|---|---|---|
| Falha da autenticação remota/limite de e-mail | Média | Alto | Contas de teste preparadas e modo local identificado |
| Divergência entre commit apresentado e documentação | Média | Alto | Congelar SHA e versão da documentação |
| Migração pendente ou RLS não homologada | Média | Alto | Não depender de fluxo não homologado na apresentação |
| Rede ausente na sala | Média | Médio | Demonstração offline com dados fictícios |
| Fluxo inacessível por teclado em celular | Média | Médio | Teste manual com Tab, Enter, Escape e viewport móvel |

## 7. Configuração e melhoria contínua (Aula 07)

O código, documentação, scripts de banco, testes e configurações de exemplo são **itens de configuração**. Uma **baseline** deve registrar repositório, branch, SHA e versão usada na demonstração; alterações posteriores precisam de novo teste. Pipeline mínimo: `npm ci` → `npm run check` → `npm test` → `npm run build`. A melhoria segue identificar problema, medir, corrigir, verificar e registrar resultado. **Não colocar segredos de servidor em `VITE_*`**.

## 8. Confiança, qualidade e gestão (Aula 08)

Requisitos não funcionais pertinentes: usabilidade, acessibilidade, manutenibilidade, privacidade, segurança, desempenho e portabilidade. Testes de frontend detectam regressões, mas não demonstram conformidade integral a WCAG, operação pública segura nem aprovação de políticas RLS em banco remoto. Falhas de rede devem apresentar estados de erro e recuperação, sem substituir dados reais por exemplos silenciosos.

## 9. Evolução, manutenção e reúso (Aula 11)

- **Corretiva**: corrigir defeitos de navegação, upload ou carregamento.
- **Adaptativa**: ajustar o frontend a mudanças de navegador e APIs.
- **Perfectiva**: melhorar acessibilidade, legibilidade e organização dos módulos.
- **Preventiva**: ampliar testes, reduzir duplicação e revisar dependências.
- **Reúso**: reutilizar `views.js`, `validation.js`, `ui-preferences.js` e bibliotecas explicitamente declaradas, avaliando custos, manutenção e riscos das dependências.

## 10. Critérios de conclusão da entrega acadêmica

1. O visitante consegue abrir a página inicial, navegar, pesquisar, filtrar e consultar um alerta de demonstração ou um estado vazio verdadeiro.
2. O tutor demonstra um fluxo coerente de cadastro/login e publicação de ocorrência no **modo selecionado**, com as limitações deste modo explicitadas.
3. Todas as páginas selecionadas para apresentação funcionam em desktop e celular e oferecem foco visível e controles identificáveis.
4. `npm run check`, `npm test` e `npm run build` são executados no **commit entregue**, com registro dos resultados reais.
5. Documentação, diagramas, matriz de rastreabilidade, riscos e roteiro de demonstração apontam para o mesmo commit.
6. Nenhum recurso em desenvolvimento é identificado como concluído sem uma demonstração ou teste correspondente.

## Fontes de evidência do próprio repositório

`README.md`; `docs/ARQUITETURA.md`; `docs/SPRINTS.md`; `docs/FINALIZACAO_MVP_20261021.md`; `docs/DEMO_PROFESSOR.md`; `tests/`; `src/`; `supabase/migrations/`. Parte desses documentos é histórica; conferir a versão antes de usar números de testes ou declarações de implantação.
