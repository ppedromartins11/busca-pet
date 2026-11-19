# BuscaPet

## Versão atual para apresentação — 19/11/2026

A versão publicada em **https://busca-pet-delta.vercel.app/** utiliza o build de apresentação da branch `apresentacao-contas-2026-11-19`. O código possui uma segunda versão conectada ao Supabase, mas **a apresentação publicada não utiliza banco remoto**.

**O que demonstrar:** feed e mapa de alertas, cadastro de animais, fotos, avistamentos, cartaz para divulgação, correspondências entre animais, carteirinha digital, agenda de cuidados, Rede de Apoio, cadastro e moderação de empresas, moderação de publicações e painel administrativo. O administrador também pode cadastrar animais e publicar alertas. Empresas podem manter perfil comercial e atuar como tutor.

**Acesso de demonstração:** `tutor@buscapet.test` ou `admin@buscapet.test`, senha `BuscaPet@2026`. A conta empresarial é criada pela rota `#cadastro-empresa` e precisa de aprovação do administrador antes de aparecer no diretório local.

**Limite operacional:** contas, fotos e alterações ficam somente no navegador onde foram criadas. Outra pessoa usando outro celular não verá os registros locais. Os anúncios iniciais são dados de apresentação; não representam desaparecimentos reais. Não utilizar informações particulares, senhas pessoais, endereços residenciais ou fotos sem autorização. WhatsApp e sites comerciais são links externos.

### Executar e conferir

```bash
npm ci
npm run preview:local
# Em outro terminal:
npm run check
npm test
npm run build:presentation
```

O teste visual automatizado `tests/presentation-homologation.browser.cjs` usa Chromium/Chrome e uma instância local do build de apresentação na porta 5186. A verificação de CI está no workflow `.github/workflows/homologacao-apresentacao.yml`. Leia [Roteiro atual de apresentação](docs/ROTEIRO_APRESENTACAO_ATUAL.md) antes de avaliar o sistema.

**Documentação a seguir:** as notas sobre protótipo legado, configuração remota e entregas de outubro são registros históricos e não substituem as instruções desta versão de apresentação.


SPA em JavaScript e Vite para publicar e acompanhar buscas por animais. O modo conectado usa Supabase Auth, PostgreSQL com RLS e o bucket privado `pet-media`. A homologação online isolada ainda não está configurada. **Não copie valores de `.env` para uma demonstração nem aponte testes para produção.** Em build de produção sem as duas variáveis do Supabase, a aplicação mostra uma mensagem de configuração e não abre o protótipo local.

## Iniciar o modo conectado

Requer Node.js 22 ou superior. Em PowerShell:

```powershell
npm.cmd ci
# Só depois de criar e autorizar um projeto Supabase isolado:
Copy-Item .env.example .env.local
npm.cmd run dev -- --host 127.0.0.1
```

Abra a URL impressa pelo Vite. Substitua os dois valores de exemplo em `.env.local` por URL e chave publicável do projeto de homologação isolado. `.env.local` e `.env` são ignorados pelo Git. Jamais coloque `service_role`, secret key, senha de banco ou segredo de Worker em variáveis `VITE_` ou arquivos do frontend. Reinicie o servidor após mudar o ambiente.

Configure manualmente **Authentication → URL Configuration** no projeto isolado para o host e a porta usados pelo Vite. O cadastro retorna para `/#login` e a recuperação de senha usa `/?auth=reset`. A confirmação de e-mail e o envio de mensagens dependem da configuração de Auth/SMTP hospedada. Consulte o [estado e roteiro da homologação](docs/DEMO_HOMOLOGACAO.md) antes de cadastrar uma conta de teste.

## O que funciona no modo conectado

- Cadastro, login, sessão persistente, logout, pedido de recuperação e redefinição por Supabase Auth, conforme a configuração de e-mail do projeto.
- Feed público e detalhe de ocorrências, com pesquisa por texto e filtros.
- Animais próprios: cadastro, listagem, detalhe, edição e exclusão confirmada.
- Ocorrências: publicação, detalhe, edição e alteração de situação pelo responsável.
- Fotografias: validação até 5 MiB, upload para bucket privado e leitura autorizada, sem URL pública permanente.
- Fotos privadas do animal, tema claro/escuro/automático e painel de acessibilidade estão implementados localmente. A persistência de fotos de animais requer a migration incremental descrita em [FINALIZACAO_MVP_20261021.md](docs/FINALIZACAO_MVP_20261021.md), ainda não aplicada remotamente.
- Avistamento por usuário autenticado e leitura pelo responsável autorizado.

A autorização efetiva depende dos grants, das políticas RLS e das RPCs da migration. O frontend nunca recebe chave privilegiada. Os testes locais não substituem a homologação de escrita e isolamento com duas identidades no projeto remoto.

O relato de visitante **sem conta** ainda depende de Cloudflare Worker, Turnstile e Edge Function, que não foram publicados. Denúncias e moderação têm código e migrations locais, mas dependem da aplicação dos contratos e de homologação no ambiente conectado; favoritos e tarefas continuam indisponíveis nesse modo. Nenhum dado fictício do protótipo é exibido como ocorrência remota.

## Prévia da interface moderna para apresentação

Execute `npm.cmd run preview:local` e abra `http://127.0.0.1:5173/#home`. O comando isola o `.env` e abre a `BPRealApp` com dados somente neste navegador, sem conta real ou senha. Para outra porta: `npm.cmd run preview:local -- 5186`.

Antes da apresentação, entre em **Minha conta → Limpar dados desta prévia** e confirme a exclusão. Na tela de entrada, escolha **Tutor Local**. Cadastre um animal com foto; publique um alerta de animal desaparecido e use **Marcar centro do mapa** com consentimento. Demonstre feed, busca, filtros, detalhe, mapa e avistamento. No detalhe do alerta, crie uma **denúncia de teste**. Saia, escolha **Administrador Local**, abra **Denúncias**, registre a decisão e confira o reflexo no feed e no mapa. Em **Ocorrências**, restaure a publicação e consulte o histórico. A lista textual do mapa continua disponível quando os blocos do OpenStreetMap não carregam. Use somente dados e fotos autorizados. A limpeza remove também denúncias, decisões e rascunhos locais; preferências de acessibilidade permanecem no dispositivo. Os perfis locais não são contas ou permissões do Supabase.

Para gerar os mesmos fluxos como arquivos estáticos, execute `npm.cmd run build:presentation` e `npm.cmd run preview`. A Vercel usa esse build pelo `vercel.json`. O modo `presentation` ignora a configuração Supabase mesmo quando variáveis `VITE_SUPABASE_*` existem no ambiente; `npm.cmd run build` preserva o modo conectado para evolução posterior.

## Modo local de contingência legado

Para uma demonstração isolada, mesmo quando existe `.env` no checkout, execute `npm.cmd run demo`. O comando inicia o Vite em `127.0.0.1:5173` sem carregar o arquivo de ambiente do projeto; para outra porta, use `npm.cmd run demo -- 5180`. Confira o aviso de **protótipo local** antes de apresentar. As credenciais e os registros abaixo são fictícios e ficam somente no navegador.

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

`src/auth.js` preserva a API `BPAuth`; `src/remote-store.js` reúne as operações de Data API e Storage; `src/real-app.js` apresenta o modo conectado; `src/store.js` e `src/app.js` preservam o protótipo offline; `src/events.js` escolhe o modo. A migration inicial está em `supabase/migrations/20261020233414_initial_buscapet_schema.sql`; o checkout contém migrations incrementais posteriores.

Veja [DEMO_HOMOLOGACAO.md](docs/DEMO_HOMOLOGACAO.md), [ARQUITETURA.md](docs/ARQUITETURA.md), [HOMOLOGACAO_MIGRATION.md](docs/HOMOLOGACAO_MIGRATION.md) e [SPRINT2_2_INGRESS.md](docs/SPRINT2_2_INGRESS.md). Parte da documentação anterior descreve o estado histórico da Sprint 2; confirme sempre a data dos relatórios antes de tratar resultados antigos como atuais.

O estado acadêmico atual, resultados e limites estão em [VERIFICACAO_ACADEMICA_2026-11-16.md](docs/VERIFICACAO_ACADEMICA_2026-11-16.md), com a [matriz de rastreabilidade](docs/MATRIZ_RASTREABILIDADE.md). [FINALIZACAO_MVP_20261021.md](docs/FINALIZACAO_MVP_20261021.md) permanece como registro histórico.
