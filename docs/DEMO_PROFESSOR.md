# BuscaPet — roteiro da apresentação (21/10/2026)

## Iniciar

Na raiz do repositório, com Node.js 22 ou superior:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev -- --host 127.0.0.1
```

Abra **a URL impressa pelo Vite**. O padrão é `http://127.0.0.1:5173`; mantenha o mesmo host e porta durante a apresentação. `.env.local` contém somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, valores públicos carregados pelo Vite. Confira que apontam para `jpnvizdhyrvliqgvyxzx`. Nunca use `service_role`, secret key, senha do banco ou segredo da Edge Function em variável `VITE_`. Reinicie o Vite depois de mudar `.env.local`.

Antes de abrir a apresentação, rode em outro terminal:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
```

Esses comandos verificam o código local; não comprovam operações remotas. Mantenha o terminal do Vite aberto. Abra a aplicação em janela normal e, se possível, em janela privada para mostrar a visão do visitante.

Com o Vite ainda aberto e Chrome/Edge instalado, `npm.cmd run test:browser:real` verifica rotas, teclado e responsividade. Ele faz uma tentativa de login inválido, mas não cria contas nem registros. Ajuste `BASE_URL` se a porta mudar. O teste remoto com duas contas está registrado em [MVP_HOMOLOGACAO_20261021.md](MVP_HOMOLOGACAO_20261021.md).

## Configuração manual necessária no Supabase

No projeto `jpnvizdhyrvliqgvyxzx`, em **Authentication → URL Configuration**, ajuste o **Site URL** para a origem local usada (`http://127.0.0.1:5173` ou `http://localhost:5173`) e inclua os destinos exatos do cadastro (`.../#login`) e da redefinição (`.../?auth=reset`) em **Redirect URLs**, com o mesmo host exibido pelo Vite. O callback de recuperação leva a aplicação à rota `#redefinir-senha`. O arquivo `supabase/config.toml` ainda usa a porta 3000 para o ambiente local do CLI; isso não configura automaticamente o projeto hospedado. Confira os endereços gerados pelos e-mails e, se necessário, o template que usa `RedirectTo`. [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

Em **Authentication → Providers → Email**, confirme se cadastro por e-mail está habilitado e se o projeto exige confirmação. Para demonstrar confirmação e recuperação, configure o envio de e-mail para a caixa de teste e verifique que as mensagens chegam. O serviço de envio padrão da Supabase é limitado e não deve ser pressuposto como confiável para a demonstração; um SMTP próprio exige configuração externa. [Password-based Auth](https://supabase.com/docs/guides/auth/passwords). Não desabilite confirmação apenas para esconder um problema de e-mail durante a apresentação.

**Estado observado em 21/10:** o cadastro público remoto respondeu `over_email_send_rate_limit`. Configure e teste SMTP/limites com uma caixa controlada antes de prometer cadastro ou recuperação por e-mail na apresentação. Até lá, use contas sintéticas previamente criadas e confirmadas pelo responsável do projeto no Auth Dashboard, com senha entregue fora do repositório. A criação por Auth Admin serviu apenas para a homologação e suas contas foram excluídas; não há conta de apresentação pronta neste repositório.

Antes de convidar cadastros, confira a exposição de `public` na Data API, os grants e RLS remotos, e mantenha `buscapet_private` fora dos schemas expostos. A migration aplicada e os testes locais não substituem essa conferência remota. O bucket `pet-media` deve permanecer privado. Cloudflare Worker e Edge Function de avistamento visitante não estão publicados; não exponha a Edge Function diretamente como atalho.

## Conta e conteúdo da demonstração

Use **contas sintéticas** com e-mail controlado pela equipe e senhas únicas não registradas no repositório. Depois que o envio de e-mail for verificado, a conta pode ser criada pela tela `#registro`; abra o e-mail de confirmação se o projeto exigir, então entre por `#login`. Prepare um Tutor A e, para demonstrar isolamento, um Tutor B independente. O cadastro público não concede função de administrador ou moderador. Não use dados pessoais, fotos de terceiros nem animais reais.

Prepare com antecedência, **pela interface real e somente se a criação de dados no projeto estiver autorizada**, um animal e uma ocorrência do Tutor A com descrição, cidade e região fictícias. Registre os IDs dos dados sintéticos para limpeza controlada depois. Uma foto de teste deve ser JPG, PNG ou WebP e obedecer ao limite remoto de 5 MiB. A interface reprocessa a imagem para remover metadados antes do upload; uploads diretos pela API não passam por esse preparo, portanto use apenas arquivos sintéticos revisados. Tenha também um segundo navegador ou perfil limpo para mostrar a visão do visitante. Não use os endereços `@demo.buscapet` e a senha do protótipo como credenciais Supabase; eles existem somente no modo local legado.

## Sequência sugerida (6 a 8 minutos)

1. **Visitante:** abra `#home` em janela privada. Mostre busca, filtros, um detalhe público e a informação de cidade/região. Se o projeto estiver sem ocorrências, mostre o estado vazio real e passe ao cadastro; não apresente cartões fictícios como dados remotos.
2. **Identidade:** abra `#login` com a conta de teste preparada. Mostre validação de campos, senha visível/oculta, erro de login inválido e entrada. Abra `#registro` para mostrar o formulário, explicando o limite atual de envio de e-mail. Demonstre confirmação e `#esqueci-senha` somente depois de configurar SMTP e testar o callback com caixa controlada.
3. **Tutor:** em `#meus-animais`, cadastre um animal sintético, abra o detalhe e edite uma característica. Abra `#publicar/lost` (ou `#publicar/found`), associe o animal, informe local aproximado e publique a ocorrência. Volte ao feed para localizar e abrir o alerta. Se houver foto preparada, mostre upload e leitura; nunca apresente URL permanente de arquivo privado.
4. **Pista autenticada:** abra `#avistamento/<id>` e envie um relato sintético com área aproximada. No painel do responsável, mostre a leitura autorizada da pista, se disponível. Não revele coordenadas exatas no feed público.
5. **Permissões:** saia, entre como Tutor B e demonstre que seus animais e registros privados são distintos. Volte à janela privada para mostrar somente o conteúdo publicável. Encerre com logout.
6. **Limites honestos:** favoritos, tarefas, denúncias e moderação dependem de persistência que não existe no schema atual; a interface deve identificá-los como demonstração local ou indisponíveis. O envio de avistamento **sem conta** está indisponível até Worker, Turnstile e Edge Function terem sido publicados e homologados.

## Verificações rápidas antes de entrar na sala

- Recarregue a página após login para verificar a sessão persistente; saia e tente abrir uma rota privada para conferir o guard.
- Confira `#home`, `#login`, `#registro`, `#meus-animais` e um alerta em larguras de celular e desktop. Use Tab, Enter e Escape nos controles e diálogos.
- Se uma operação falhar, leia o erro mostrado e confira a aba **Network** do navegador; não troque para dados simulados sem avisar. Verifique a URL e a publishable key, redirects do Auth e permissões RLS/Data API.
- Ao fim, elimine apenas fixtures sintéticas identificadas previamente. Não apague dados de terceiros nem use `db reset` ou `db push` para limpar a demonstração.

## Se a internet falhar

O modo real precisa de conexão com Supabase. Para mostrar apenas a navegação e o desenho sem afirmar persistência remota, **pare o Vite**, retire temporariamente **ambos** `.env` e `.env.local` do caminho (guarde-os fora do projeto ou renomeie-os para nomes que o Vite não carregue) e reinicie `npm.cmd run dev`. Outra opção é uma segunda cópia local sem variáveis `VITE_SUPABASE_*`. Confirme visualmente o aviso de **protótipo local**. Nesse modo, use as contas fictícias descritas no `README.md`, demonstre filtros, rotas e responsividade, e diga expressamente que login e dados estão simulados no navegador. Restaure os arquivos de ambiente e reinicie o servidor depois. Não conecte as credenciais fictícias ao projeto Supabase.
