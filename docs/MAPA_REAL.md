# Mapa real — implantação e segurança

## Implementação

A migration incremental `20261021224002_public_search_map.sql` cria três tabelas PostGIS com RLS e índices GiST: `occurrence_public_locations` (áreas de desaparecimento), `sighting_public_locations` (áreas propostas por quem avistou, com consentimento e aprovação separada do tutor) e `partner_public_locations` (local comercial consentido de parceiro aprovado). Pontos de ocorrências e avistamentos são escolhidos deliberadamente no mapa, arredondados a duas casas decimais e exibidos com raio mínimo de 800 m; a interface usa 900 m. Nenhuma coordenada privada é copiada de `buscapet_private.sighting_locations`.

`get_occurrence_public_location` é `SECURITY INVOKER` e respeita a RLS da tabela. `search_public_map_points` é `SECURITY DEFINER` porque a política existente de `sightings` protege o relato bruto de visitantes. A função retorna apenas colunas públicas fixas e verifica, antes de projetar qualquer coordenada, tipo `lost`, visibilidade pública, consentimento, status `reviewed` e aprovação do tutor. Parceiros precisam estar aprovados e ter consentido. Ela não consulta a tabela privada, valida os parâmetros, usa `ST_DWithin` para buscas geográficas e limita a 200 resultados. O `EXECUTE` é concedido explicitamente só a `anon` e `authenticated`; as tabelas de propostas de avistamento e parceiros não oferecem leitura anônima direta.

No front-end, o fluxo de ocorrência salva a área separadamente após o alerta. Falhas parciais são avisadas, sem afirmar que o ponto foi publicado. O avistamento começa pendente; o tutor primeiro revisa/rejeita o relato e depois autoriza ou retira a área no mapa. Revisão não equivale a confirmação de onde está o animal. A linha do tempo inclui somente eventos publicados; os marcadores têm lista textual, filtro e link para o alerta. O botão **Atualizar pontos** consulta a área visível quando seu raio cabe no limite de 500 km; fora disso, consulta global limitada. A geolocalização do navegador é opcional e só recentraliza o mapa localmente.

## Teste em stack descartável local

Use portas livres, sem parar stacks de outros projetos. Nesta máquina, a porta padrão 54321 estava ocupada; para os testes, alterei temporariamente as portas de `supabase/config.toml` para a faixa 55420–55429, parei a stack isolada após os testes e restaurei o arquivo. Com Docker iniciado:

```powershell
npm.cmd install
node_modules\.bin\supabase.cmd start -x studio,postgres-meta,logflare,vector,supavisor,realtime,imgproxy
node_modules\.bin\supabase.cmd migration up --local
$mapStatus = node_modules\.bin\supabase.cmd status -o json | ConvertFrom-Json
$env:SUPABASE_URL = $mapStatus.API_URL
$env:SUPABASE_ANON_KEY = $mapStatus.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $mapStatus.SERVICE_ROLE_KEY
node tests/supabase-map.integration.mjs
```

Em outro terminal, execute o Vite apontado para a mesma stack e depois o teste de navegador. Nunca use as variáveis `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_ANON_KEY` da stack local em um deploy público:

```powershell
$mapStatus = node_modules\.bin\supabase.cmd status -o json | ConvertFrom-Json
$env:VITE_SUPABASE_URL = $mapStatus.API_URL
$env:VITE_SUPABASE_PUBLISHABLE_KEY = $mapStatus.PUBLISHABLE_KEY
npm.cmd run dev -- --host 127.0.0.1 --port 5175
```

```powershell
$mapStatus = node_modules\.bin\supabase.cmd status -o json | ConvertFrom-Json
$env:SUPABASE_URL = $mapStatus.API_URL
$env:SUPABASE_ANON_KEY = $mapStatus.ANON_KEY
$env:SUPABASE_SERVICE_ROLE_KEY = $mapStatus.SERVICE_ROLE_KEY
$env:BASE_URL = 'http://127.0.0.1:5175'
node tests/browser-map-local.cjs
```

Os dois scripts recusam URL de banco remoto e removem os usuários de teste ao terminar. Não execute `db reset` sobre banco com dados a preservar.

## Aplicação remota — exige autorização separada

Nenhuma migration remota nem deploy Vercel foi feito nesta sprint. Antes da publicação, verifique o projeto Supabase vinculado, backup recente e histórico das migrations. Faça revisão de segurança da nova função privilegiada e das políticas na instância de destino. Simule primeiro:

```powershell
node_modules\.bin\supabase.cmd migration list --linked
node_modules\.bin\supabase.cmd db push --linked --dry-run --skip-vault
```

Depois de autorização explícita para o projeto correto, aplique `db push --linked --skip-vault`; valide a RPC pública e os fluxos autenticados em homologação, faça `npm.cmd run check`, `npm.cmd test`, `npm.cmd run build` e os testes de navegador. Para publicar na Vercel, mantenha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto correto nos ambientes desejados, confirme URLs de redirecionamento do Auth e gere um novo deployment pelo fluxo normal do repositório. Nunca configure `service_role` como `VITE_*`.

## Pendências

`#services` continua página independente. A estrutura de localização comercial e a projeção pública de parceiros aprovados estão prontas, mas o cadastro visual de parceiros, os filtros por clínica/pet shop/protetor/outros e pontos de apoio verificados requerem segunda etapa. Não há estabelecimento fictício no modo real. Ainda são necessários testes manuais com leitor de tela, Safari/Firefox e dispositivos físicos antes de lançamento público.
