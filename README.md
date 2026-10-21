# BuscaPet — MVP acadêmico

SPA em JavaScript e Vite para publicar e acompanhar buscas por animais. Com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, usa Supabase Auth, PostgreSQL com RLS e o bucket privado `pet-media`. Sem essas variáveis, abre o protótipo local legado, explicitamente identificado como demonstração.

## Iniciar o modo conectado

Requer Node.js 22 ou superior. Em PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev -- --host 127.0.0.1
```

Abra a URL impressa pelo Vite. `.env.example` contém apenas URL e chave pública do projeto `jpnvizdhyrvliqgvyxzx`. `.env.local` e `.env` são ignorados pelo Git. Jamais coloque `service_role`, secret key, senha de banco ou segredo de Worker em variáveis `VITE_` ou arquivos do frontend. Reinicie o servidor após mudar o ambiente.

Configure manualmente **Authentication → URL Configuration** no projeto Supabase para o host e a porta usados pelo Vite. O cadastro retorna para `/#login` e a recuperação de senha usa `/?auth=reset`. A confirmação de e-mail e o envio de mensagens dependem da configuração de Auth/SMTP hospedada. Consulte [o roteiro da apresentação](docs/DEMO_PROFESSOR.md) antes de cadastrar uma conta de teste.

## O que funciona no modo conectado

- Cadastro, login, sessão persistente, logout, pedido de recuperação e redefinição por Supabase Auth, conforme a configuração de e-mail do projeto.
- Feed público e detalhe de ocorrências, com pesquisa por texto e filtros.
- Animais próprios: cadastro, listagem, detalhe, edição e exclusão confirmada.
- Ocorrências: publicação, detalhe, edição e alteração de situação pelo responsável.
- Fotografias: validação até 5 MiB, upload para bucket privado e leitura autorizada, sem URL pública permanente.
- Fotos privadas do animal, tema claro/escuro/automático e painel de acessibilidade estão implementados localmente. A persistência de fotos de animais requer a migration incremental descrita em [FINALIZACAO_MVP_20261021.md](docs/FINALIZACAO_MVP_20261021.md), ainda não aplicada remotamente.
- Avistamento por usuário autenticado e leitura pelo responsável autorizado.

A autorização efetiva depende dos grants, das políticas RLS e das RPCs da migration. O frontend nunca recebe chave privilegiada. Os testes locais não substituem a homologação de escrita e isolamento com duas identidades no projeto remoto.

O relato de visitante **sem conta** ainda depende de Cloudflare Worker, Turnstile e Edge Function, que não foram publicados. Favoritos, tarefas, denúncias e moderação não possuem persistência no schema atual e aparecem como recursos indisponíveis no modo conectado. Nenhum dado fictício do protótipo é exibido como ocorrência remota.

## Modo local de contingência

Sem `.env` e `.env.local` com as variáveis `VITE_SUPABASE_*`, reinicie o Vite. O aviso visual identifica o **protótipo local**, cujos dados ficam neste navegador. As contas fictícias abaixo usam somente a senha de demonstração `BuscaPetDemo!`:

| Papel | E-mail |
|---|---|
| Tutor | `tutor@demo.buscapet` |
| Colaborador | `colaborador@demo.buscapet` |
| Moderador | `moderador@demo.buscapet` |

Esse modo simula cadastro, login, pistas, tarefas, denúncias e moderação. Não oferece autenticação ou colaboração segura entre dispositivos. Não use dados pessoais nem senhas reais nele.

## Verificações

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

Com Vite conectado já iniciado e Chrome/Edge disponível, `npm.cmd run test:browser:real` testa rotas públicas, guarda de rota privada, ausência de seeds, teclado e larguras de 360 a 1440 px. Ele faz uma tentativa de login inválido, sem criar contas ou dados. Para repetir o teste de navegador do protótipo local, inicie um servidor sem as variáveis Supabase e execute `npm.cmd run test:browser` com `BASE_URL` apontando para ele. Os resultados remotos e os limites de Auth estão em [MVP_HOMOLOGACAO_20261021.md](docs/MVP_HOMOLOGACAO_20261021.md).

## Código e documentação

`src/auth.js` preserva a API `BPAuth`; `src/remote-store.js` reúne as operações de Data API e Storage; `src/real-app.js` apresenta o modo conectado; `src/store.js` e `src/app.js` preservam o protótipo offline; `src/events.js` escolhe o modo. A migration está em `supabase/migrations/20261020233414_initial_buscapet_schema.sql`.

Veja [DEMO_PROFESSOR.md](docs/DEMO_PROFESSOR.md), [ARQUITETURA.md](docs/ARQUITETURA.md), [HOMOLOGACAO_MIGRATION.md](docs/HOMOLOGACAO_MIGRATION.md) e [SPRINT2_2_INGRESS.md](docs/SPRINT2_2_INGRESS.md). Parte da documentação anterior descreve o estado histórico da Sprint 2; este README descreve os dois modos atuais da SPA.

O relatório atualizado, limitações, configuração externa e checklist da apresentação estão em [FINALIZACAO_MVP_20261021.md](docs/FINALIZACAO_MVP_20261021.md).
