# BuscaPet — relatório de finalização do MVP

Data: 21/10/2026. Projeto Supabase: `jpnvizdhyrvliqgvyxzx`.

## Entregas implementadas

- Header único, alinhado à referência aprovada, com ações de visitante à direita e ações de sessão no lugar delas após autenticação.
- Menu móvel acessível dentro do header: abre sem sobrepor o conteúdo, recebe foco no primeiro link, fecha por `Escape` e devolve o foco ao botão.
- Tema claro, escuro e automático, persistido em `localStorage` antes da folha de estilos para evitar troca perceptível de tema ao abrir a SPA.
- Painel de acessibilidade com tamanho de texto, alto contraste, destaque de links, foco reforçado, redução de animações e restauração de preferências.
- Integração opcional do widget oficial VLibras. Ele só é carregado após a pessoa habilitá-lo; é uma tradução automática complementar e pode enviar conteúdo selecionado ao serviço externo do Governo Federal.
- Campo de avistamento passou a aceitar datas passadas, oferece “Vi o animal agora”, converte o horário local para UTC no envio e rejeita data futura no navegador e na camada de dados.
- Cadastro de animal agora aceita até cinco fotos privadas, com prévia, foto de capa, remoção e substituição. A publicação de desaparecimento permite selecionar o animal, preencher sua descrição quando vazia e reutilizar suas fotos de forma explícita.

## Banco e Storage

Há uma migration incremental local: `20261021203739_pet_photos.sql`.

Ela cria `public.pet_photos`, limita cada animal a cinco arquivos, mantém uma capa, aplica RLS por tutor e reutiliza o bucket privado `pet-media`. As fotos de animais não ficam públicas apenas por existirem: somente a reutilização explícita em uma ocorrência pública cria o metadado correspondente de ocorrência. A migration também adiciona uma restrição para impedir `sightings.observed_at` futuro, com margem de cinco minutos entre registro e validação do banco.

Nenhuma migration, função, segredo, configuração de Auth ou dado do Supabase remoto foi alterado nesta finalização.

Antes de aplicar em um ambiente autorizado, execute:

```powershell
npm.cmd exec -- supabase start
npm.cmd exec -- supabase test db
npm.cmd exec -- supabase migration list --local
npm.cmd exec -- supabase db push --dry-run
```

Depois valide com dois tutores distintos: leitura cruzada de `pet_photos`, limite de cinco fotos, exclusão do objeto privado, foto de capa e reutilização em ocorrência. Só então aplique a migration mediante autorização explícita.

## Auth, Vercel e configuração externa

No Supabase Auth, configure a Site URL como `https://busca-pet-delta.vercel.app` e permita, no mínimo:

```text
https://busca-pet-delta.vercel.app/**
http://localhost:5173/**
```

O callback de recuperação usa `/?auth=reset`. A confirmação e a recuperação dependem da entrega de e-mail. O provedor padrão possui limite baixo; para a apresentação com contas novas, configure SMTP externo e os limites em Authentication → Rate Limits. Não desabilite confirmação de e-mail ou controles de taxa para contornar `over_email_send_rate_limit`.

Na Vercel, mantenha somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` como variáveis públicas. Nunca inclua `service_role`, segredo de Worker, SMTP ou senha de banco. Confirme a regra de SPA para devolver `index.html` em rotas internas antes do deploy. Não foi feito deploy nesta tarefa.

## Resultados de teste

| Verificação | Resultado |
|---|---|
| `npm.cmd run check` | aprovado |
| `npm.cmd test` | 57/57 aprovados |
| `npm.cmd run build` | aprovado |
| Navegador conectado | aprovado, 66 combinações de rota/largura, 320–1920 px |
| Navegador demonstrativo | aprovado, 19 rotas, 320–1920 px, sem overflow ou exceções |
| Inspeção visual | claro, escuro, cadastro, header e menu móvel revisados |
| Verificação de reflow | viewport de 320 px e ampliação equivalente sem overflow no fluxo revisado |

O teste do banco local não foi executado porque o PostgreSQL local em `127.0.0.1:54322` não estava disponível; `supabase migration list --local` retornou erro de conexão. Isso não equivale a aprovação da migration.

## Checklist de apresentação

- [ ] Abrir a aplicação em `https://busca-pet-delta.vercel.app` e confirmar que o header tem uma única linha.
- [ ] Demonstrar tema escuro, alto contraste, texto ampliado e retorno ao padrão pelo botão de acessibilidade.
- [ ] Abrir o menu móvel, navegar com `Tab` e fechá-lo com `Escape`.
- [ ] Entrar com uma conta já confirmada; mostrar cadastro de animal e foto de capa após aplicar a migration em ambiente autorizado.
- [ ] Selecionar um animal ao publicar desaparecimento e revisar o reaproveitamento explícito das fotos.
- [ ] Registrar avistamento com uma data passada e confirmar que uma data futura é recusada.
- [ ] Explicar que o relato de visitante sem conta segue bloqueado até a implantação do Worker, Turnstile e Edge Function.

## Limitações conhecidas

- O VLibras depende de serviço externo, tradução automática e conexão de rede; não substitui revisão humana em Libras nem os recursos WCAG da interface.
- Não há homologação remota da migration de fotos ou dos novos fluxos de escrita nesta entrega.
- Não há leitor de tela NVDA disponível neste ambiente; foram feitos testes por teclado, semântica, labels, foco e anúncios, mas isso não certifica conformidade WCAG 2.2 AA completa.
- O avistamento anônimo continua desativado de propósito até que Cloudflare Worker, Turnstile e Edge Function sejam publicados e homologados.
