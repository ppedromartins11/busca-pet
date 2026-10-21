# BuscaPet — homologação do MVP em 21/10/2026

## Resultado

O modo conectado da SPA foi exercitado contra `jpnvizdhyrvliqgvyxzx` com identidades sintéticas independentes. A rodada completa `60932773-7b66-4e09-9a4b-3eb7d878ca9d` aprovou 9 grupos de testes: perfil e isolamento, animais, ocorrências públicas e privadas, papéis e suspensão, avistamentos e coordenadas, Storage privado, publicação autorizada de foto, exclusão e navegação autenticada. O manifesto local fica em `.tmp/remote-mvp-<id>.json` (ignorado pelo Git, sem senhas). A limpeza terminou sem erro; auditoria posterior por Auth Admin e Storage encontrou zero usuários e arquivos sintéticos residuais. Os animais e registros dependentes são eliminados pelas FKs `ON DELETE CASCADE` da migration. SELECT SQL direto dessas tabelas não estava disponível para a chave `service_role` deste projeto nem pelo conector.

O navegador automatizado concluiu login inválido e válido, sessão persistente após recarga, criação e edição de animal, cancelamento de exclusão por Escape, publicação e consulta pública da ocorrência, upload e leitura de foto, avistamento por Tutor B e logout. O teste de visitantes verificou que somente registros publicáveis e respectivas fotos eram acessíveis; o Tutor B não leu ou alterou dados privados do Tutor A. Tentativas de autoatribuição de administrador, alteração de suspensão e autoaprovação de parceiro foram rejeitadas.

No ambiente local, `npm.cmd run check`, `npm.cmd test` (55/55) e `npm.cmd run build` passaram. `npm.cmd run test:browser:real` passou em 20 combinações de 4 rotas e larguras de 360, 390, 768, 1024 e 1440 px, com navegação por teclado e zero exceções de página. O navegador do modo legado passou 18 fluxos, 19 rotas e larguras de 320 a 1440 px, sem overflow nem exceções. Não há script de lint separado no `package.json`.

## Limites verificados

- O cadastro público remoto retornou `over_email_send_rate_limit` com endereço sintético de domínio usual. O cadastro e o callback de confirmação por e-mail **não foram homologados**. Tentativas anteriores com domínios reservados retornaram `email_address_invalid`. Configure SMTP/limites e teste com uma caixa controlada antes de demonstrar esse fluxo como concluído.
- A solicitação e o callback de recuperação de senha têm implementação e testes locais, mas o envio e link remoto não foram exercitados por falta de serviço de e-mail disponível e caixa controlada.
- O avistamento sem conta continua desativado até o deploy e a homologação do Cloudflare Worker, Turnstile e Edge Function. Nenhum desses serviços foi publicado nesta tarefa.
- A interface reprocessa fotos para remover metadados antes do upload. Um cliente que usa diretamente a API pode enviar bytes originais; processamento obrigatório no servidor continua pendente para operação pública. A exclusão no Storage pode levar até 60 segundos para invalidar conteúdo em cache, conforme a [documentação do Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
- O teste cobriu teclado em login e diálogo, cinco larguras e ausência de overflow. Ele não equivale a uma auditoria integral WCAG 2.2 AA, incluindo contraste e zoom de 200% em todos os fluxos.
- O feed carrega a primeira página de até 100 ocorrências e filtra esse conjunto no navegador. Paginação e busca no servidor são necessárias para volume maior.
- Favoritos, tarefas, denúncias e moderação não têm persistência no schema conectado; as rotas não implementadas mostram indisponibilidade. O modo local legado continua marcado como demonstração.

## Repetição controlada

O teste remoto está em `tests/remote-mvp.integration.mjs` e **não** roda em `npm test`. Exige `RUN_BUSCAPET_REMOTE_MVP_TEST=I_ACCEPT_SYNTHETIC_WRITES`, `BUSCAPET_TEST_PROJECT_REF=jpnvizdhyrvliqgvyxzx`, `BUSCAPET_TEST_PUBLISHABLE_KEY`, `BUSCAPET_TEST_SERVICE_ROLE_KEY` somente no processo Node local e, para o navegador, `BUSCAPET_TEST_BROWSER_URL` apontando para o Vite local. Nunca use a chave administrativa em variável `VITE_`, navegador, arquivo versionado ou log. O teste registra IDs, limpa objetos pela Storage API, dados com as sessões dos próprios tutores e usuários pelo Auth Admin em `finally`. `tests/remote-fixture-audit.mjs` verifica posteriormente Auth e Storage a partir do manifesto. Se a limpeza falhar, investigue somente os IDs do manifesto antes de outra rodada; não use comandos amplos de exclusão.

Para a apresentação, siga [DEMO_PROFESSOR.md](DEMO_PROFESSOR.md). Não foi executada migration, reset, deploy ou alteração de configuração remota.
