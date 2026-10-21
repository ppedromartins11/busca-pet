# Mapa e rede de apoio

## Fontes de dados

`src/search-map.js` mantém `DEMO_MAP_POINTS`, uma fonte local, imutável e exclusiva da apresentação acadêmica. Todos os seus pontos são marcados como **Demonstração**, usam Campo Grande/MS somente como região ilustrativa e não são enviados ao Supabase, ao feed público ou às estatísticas.

O modo **Dados reais disponíveis** começa vazio. A estrutura atual não contém coordenadas públicas autorizadas para pontos de mapa. O aplicativo não calcula uma posição a partir de cidade, bairro, referência aproximada ou coordenadas privadas de avistamentos.

Quando uma fonte pública autorizada existir, ela deverá entregar somente pontos aproximados já autorizados pela política de dados. A integração deve continuar separada de `DEMO_MAP_POINTS` e deve passar por revisão de RLS antes de ser ativada.

## Privacidade

- A geolocalização do navegador é solicitada apenas pelo botão **Usar minha localização**.
- A coordenada recebida apenas centraliza o mapa na memória; não é enviada, persistida ou incluída em um avistamento.
- A lista textual continua disponível se os tiles do OpenStreetMap falharem.
- Nenhum contato real de parceiro é apresentado no cenário demonstrativo.

## Execução local e publicação

```powershell
npm.cmd install
npm.cmd run dev
```

Abra `/#mapa`, selecione **Cenário demonstrativo** e use os filtros, a linha do tempo e a lista textual. Para publicar, execute `npm.cmd run build` e faça o deploy usual da Vercel. Esta entrega não requer migration, segredo adicional ou alteração no Supabase.
