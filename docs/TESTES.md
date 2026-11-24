# Testes do BuscaPet — entrega do Projeto Integrador II

**Referência atual:** 24/11/2026 · **baseline funcional:** `2507a68` · **frontend em produção:** Vite `presentation`.

Os resultados de 30 ou 38 testes do protótipo v0.5, registrados anteriormente, **não são a métrica da versão apresentada**. O histórico integral permanece ao final.

## Evidências realmente disponíveis

| Verificação | Evidência consultada | O que comprova |
|---|---|---|
| Instalação e sintaxe | Workflow [44581445999](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445999) — sucesso | `npm ci`, `npm run check` |
| Suíte de testes de unidade/regressão | Mesmo workflow — sucesso | `npm test` no SHA do PR funcional |
| Build de verificação | Mesmo workflow — sucesso | `npm run build` |
| Build estático de apresentação | Workflow [44581445883](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445883) — sucesso | `npm run build:presentation` |
| Navegação Chromium e permissões | Workflow [44581445883](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445883) — sucesso | Jornadas de visitante, tutor, admin e empresa; sem erros de console capturados nos casos exercitados |
| Layout em múltiplas larguras | `tests/presentation-homologation.browser.cjs` no workflow aprovado | Sem rolagem horizontal detectada em **320, 390, 768 e 1440 px** |
| Publicação | Vercel `READY`, SHA `2507a68`, verificado em 24/11/2026 | A versão estática de apresentação está acessível no domínio publicado |

Os workflows acima foram executados sobre o código revisado **antes** destas alterações de documentação. Não afirmar “cobertura de 100%”, “zero bugs”, teste Safari físico ou homologação PostgreSQL/RLS porque não há evidência dessas garantias.

## O que os testes cobrem e como repetir

Os arquivos `tests/presentation-*.test.cjs`, `tests/pet-poster-matching.test.mjs` e `tests/nearby-services.test.mjs` exercitam regras como:
- cadastro/edição de pets, empresas e permissões;
- cartaz, texto do contato e comparação entre alertas;
- carteirinha, agenda, estado de compromisso e isolamento por usuário local;
- fotos, registros de avistamento, denúncia, proteção dos dados locais e regressões;
- serviços comerciais e busca de estabelecimentos sob consulta pública.

`tests/presentation-homologation.browser.cjs` exercita rotas e fluxos automatizados no Chromium, incluindo ações com usuários diferentes **no mesmo navegador**. Isso não comprova colaboração real entre dispositivos.

Com Node.js 22 ou superior:
```bash
npm ci
npm run check
npm test
npm run build:presentation
npm run preview -- --host 127.0.0.1 --port 5186
```

Em outro terminal, com Chromium/Chrome instalado:
```bash
BASE_URL=http://127.0.0.1:5186 node tests/presentation-homologation.browser.cjs
```

Alternativamente, confira o workflow `.github/workflows/homologacao-apresentacao.yml`.

## Limitações dos resultados

Não há evidência de ensaio manual com Safari físico, leitor de tela, testes de estresse ou proteção em servidor. O app publicado permanece em armazenamento local; testes de RLS no modo Supabase pertencem a outra arquitetura e não sustentam conclusões sobre a implantação atual.

Leia o [dossiê da entrega](ENTREGA_PROJETO_INTEGRADOR_II_2026-11-24.md) e a [matriz](MATRIZ_RASTREABILIDADE.md).

---

## Anexo histórico — protótipo 0.5, outubro/2026


## Referência anterior

Antes da refatoração:

- `npm test`: **30/30 aprovados**;
- `npm run check`: aprovado nos cinco arquivos JavaScript;
- navegador: **18 fluxos**, **19 rotas** e larguras 320, 390, 768, 1024 e 1440 px, sem overflow ou erro JavaScript.

A cópia imutável foi guardada fora do projeto como `BuscaPet-Sprint-1-v0.4-pre-refactor-2026-10-06.zip`, SHA-256 `4BAEC78B79FA10D0A135DB6A596569868E6D608E9C7A941DF8059C15D8BA45E6`.

## Testes automatizados atuais

```bash
npm run check
npm test
```

Resultado final: **38/38 testes aprovados**. A suíte usa o test runner nativo do Node.js e cobre:

- cadastro, papéis públicos, conta multifunção e função ativa;
- sessão, expiração, logout, e-mail não verificado e conta suspensa;
- ausência de senha, confirmação e token no armazenamento;
- guards de rota, retorno após login e autorização por recurso;
- publicação, edição, imagens e aceite;
- avistamento, revisão, duplicidade, participação e tarefas;
- encerramento, reabertura, auditoria, denúncia, moderação e contestação;
- migração v2→v3, referências quebradas e IDs/estruturas incompatíveis;
- conteúdo corrompido exportável, quota e conflito entre abas;
- restauração e exclusão dos dados locais;
- rejeição de entrada forjada diretamente na camada de domínio.

`npm run check` valida a sintaxe dos 12 módulos em `src/`.

## Navegador real

`tests/browser.cjs` foi executado em Google Chrome Headless com servidor local e fuso `America/Campo_Grande`.

Resultado: **aprovado** — 18 fluxos, 19 rotas, nenhuma exceção JavaScript, nenhum ID duplicado e nenhuma rolagem horizontal nas larguras **320, 390, 768, 1024 e 1440 px**.

Fluxos: filtros, rascunho, publicação com foto, pista, revisão, colaboração, tarefa, encerramento, reabertura, persistência após recarga, denúncia, moderação, contestação, impressão, login com retorno seguro, cadastro multifunção, troca de função e logout.

Para repetir, mantenha o servidor na porta 8000 e disponibilize Playwright externamente:

```powershell
$env:CHROME_PATH='C:\caminho\para\chrome.exe'
npm run test:browser
```

## Inspeção visual e limites

A página inicial foi inspecionada em 1440×900 e 390×844, com cabeçalho, hero, filtros, cartões e navegação móvel preservados. O teste automatizado também valida a impressão sem controles e o foco por teclado após login.

Ainda são recomendados testes com leitor de tela, navegador Safari/Firefox, teclado virtual, dispositivos físicos e falhas reais específicas de cada navegador. Testes locais não comprovam segurança, conformidade WCAG integral nem autorização de servidor.
