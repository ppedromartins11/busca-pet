# Verificação do protótipo 0.5 — 07/10/2026

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
