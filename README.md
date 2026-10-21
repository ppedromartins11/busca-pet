# BuscaPet — protótipo local refatorado

Protótipo acadêmico para organizar buscas por animais perdidos. Versão 0.5 com
preparação da Sprint 2, 20/10/2026.

Esta versão preserva os fluxos da entrega 0.4 e reorganiza o código por responsabilidade. A interface continua em HTML, CSS e JavaScript puro, agora com Vite, SDK oficial do Supabase, cliente configurável por ambiente e migrations locais ainda não aplicadas.

## Abrir o projeto

Na pasta do projeto, execute:

```bash
npm install
npm run dev
```

Abra a URL exibida pelo Vite (normalmente `http://localhost:5173`). Enquanto
`.env` não for configurado, o projeto permanece no modo demonstrativo local.

Node.js 22 ou superior é necessário para desenvolvimento e verificações:

```bash
npm test
npm run check
```

O teste de navegador usa Playwright como ferramenta externa de QA e um Chrome/Chromium instalado; Playwright não faz parte da aplicação nem do ZIP de entrega.

## Contas demonstrativas

Todas usam a senha exclusiva da demonstração `BuscaPetDemo!`:

| Conta | E-mail | Função |
|---|---|---|
| Tutor | `tutor@demo.buscapet` | Tutor |
| Colaborador | `colaborador@demo.buscapet` | Colaborador |
| Moderador | `moderador@demo.buscapet` | Moderador, concedido por seed |

O cadastro público permite Tutor, Colaborador e Parceiro. Tutor e Colaborador podem coexistir na mesma identidade e sessão. Moderador e Administrador não são concedidos pelo cadastro público.

## Comportamento preservado

- Cadastro, login, verificação, recuperação e redefinição simulados.
- Uma identidade com várias funções autorizadas e uma única função ativa.
- Guards de rota com retorno ao destino solicitado e tela de acesso limitado.
- Painéis de Tutor, Colaborador, Parceiro e Moderador.
- Alertas, favoritos, fotos, rascunhos, pistas, revisão humana, participantes e tarefas.
- Encerramento, reabertura, histórico, denúncias, contestação, moderação e suspensão.
- Exportação, exclusão, restauração dos exemplos e cartaz para impressão.
- Migração v2→v3, preservação de conteúdo corrompido para exportação, quota e conflito entre abas.
- Navegação por teclado, foco por rota, `aria-live`, layout responsivo e `prefers-reduced-motion`.

## Limites da demonstração

Não há autenticação segura, backend, banco central ou provedor de e-mail. Senha, confirmação e token nunca são gravados. Credenciais de contas criadas existem apenas na memória da página e deixam de funcionar após recarregar.

As permissões locais mantêm a interface coerente, mas não protegem dados contra alguém que controla o navegador. Uma operação real ainda exige backend, autorização no servidor, armazenamento privado, política de retenção e auditoria protegida. Não use dados pessoais nem senhas reais.

## Estrutura principal

| Caminho | Responsabilidade |
|---|---|
| `index.html` | Metadados, entrada do Vite e estrutura global mínima |
| `style.css` | Sistema visual, componentes, responsividade e impressão |
| `src/constants.js` | Papéis, rótulos, estados, versões e chaves |
| `src/storage.js` | Acesso seguro a armazenamento, JSON, cópia e limpeza por prefixo |
| `src/validation.js` | Normalização, validações do domínio e migração |
| `src/auth.js` | Identidade e sessão demonstrativas, a migrar para Auth real |
| `src/supabase-client.js` | Cliente oficial configurado por variáveis públicas do Vite |
| `src/main.js` | Entrada ESM que preserva a ordem de inicialização dos módulos |
| `src/permissions.js` | Função ativa e autorização por ação/recurso |
| `src/store.js` | Transações e operações do domínio |
| `src/router.js` | Parse de hash, metadados e guards |
| `src/images.js` | Validação, redução e estado transitório de fotos |
| `src/views.js` | Componentes de apresentação e escape de conteúdo |
| `src/app.js` | Telas, formulários e controladores da aplicação |
| `src/events.js` | Registro único dos eventos globais |
| `src/legal.js` | Minutas acadêmicas exibidas pela aplicação |
| `tests/` | Testes de acesso, identidade, domínio e navegador |
| `docs/REFATORACAO.md` | Diagnóstico, decisões, remoções e comparação |
| `docs/SUPABASE.md` | Configuração, segurança e aplicação futura da Sprint 2 |

Consulte também [docs/ARQUITETURA.md](docs/ARQUITETURA.md), [docs/SUPABASE.md](docs/SUPABASE.md), [docs/TESTES.md](docs/TESTES.md) e [docs/ROTEIRO.md](docs/ROTEIRO.md).
