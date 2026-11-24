# Mapa demonstrativo

> **Referência histórica ou de evolução futura, não descrição da publicação atual do Projeto Integrador II.** Preserve estas informações como registro técnico da etapa em que foram escritas. Em 24/11/2026 o BuscaPet publicado utiliza armazenamento local no navegador; o dossiê vigente é [Entrega do Projeto Integrador II](ENTREGA_PROJETO_INTEGRADOR_II_2026-11-24.md), com [arquitetura atual](ARQUITETURA.md), [matriz](MATRIZ_RASTREABILIDADE.md) e [testes](TESTES.md). Não pressupor aplicação remota de migrations, segurança RLS homologada, serviços Cloudflare implantados ou testes de backend nesta versão.

`DEMO_MAP_POINTS` permanece em `src/search-map.js` para uma apresentação ilustrativa separada. O botão **Ver exemplo ilustrativo** nunca mistura esses pontos com a resposta do Supabase e mostra aviso de demonstração. Os pontos não são persistidos.

O mapa real está documentado em [MAPA_REAL.md](MAPA_REAL.md). Ele consulta locais efetivamente autorizados e persistidos; ausência de coordenadas mostra um estado vazio, sem inferir posição de bairro ou cidade.
