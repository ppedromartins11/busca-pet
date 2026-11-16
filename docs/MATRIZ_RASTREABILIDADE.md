# Matriz de rastreabilidade — BuscaPet

A matriz vincula requisito → evidência de implementação → verificação. Situação = leitura do código na branch principal em 16/11/2026, **não** resultado de teste remoto nesta análise. **Local** significa demonstração no navegador, sem autenticação real. **Conectado** exige Supabase configurado e políticas implantadas.

| ID | Requisito / critério de aceitação | Evidência do sistema | Verificação sugerida | Situação |
|---|---|---|---|---|
| RF01 | Visitante consulta lista de ocorrências e estado vazio | `src/real-app.js`, `src/remote-store.js` | Abrir `#home` sem sessão | Implementado no código; testar ambiente |
| RF02 | Pesquisa e filtros refinam resultados | `src/real-app.js`, `src/app.js` | Buscar por espécie/região e limpar filtros | Implementado no código |
| RF03 | Cadastro valida nome, e-mail e senha | `src/auth.js`, `src/validation.js` | Casos válidos/inválidos | Código; e-mail depende de Auth |
| RF04 | Login/logout e proteção de rotas | `src/auth.js`, `src/router.js` | Acessar área privada sem sessão | Código; autenticação real depende de Supabase |
| RF05 | Tutor cadastra e edita dados de animal | `src/real-app.js`, `src/remote-store.js` | Criar, alterar, recarregar, excluir dados fictícios | Código; homologar RLS |
| RF06 | Tutor publica ocorrência de perda/encontro | `src/real-app.js`, `src/remote-store.js` | Publicar e localizar no feed | Código; homologar backend |
| RF07 | Ocorrência possui foto e dados úteis | `src/images.js`, `src/real-app.js` | Upload JPG/PNG/WebP permitido e inválido | Código; migration de foto a conferir |
| RF08 | Usuário consulta mapa de busca | `src/search-map.js`, `src/real-app.js` | Abrir mapa e alternar filtros | Código; dados reais dependem do backend |
| RF09 | Avistamento não aceita data futura | `src/validation.js`, `src/real-app.js` | Enviar data futura e data passada | Validado em código; repetir execução |
| RF10 | Somente autorizado altera recursos privados | `src/permissions.js`, `supabase/migrations/` | Testar Tutor A versus Tutor B | Políticas existem; homologação necessária |
| RF11 | Usuário ajusta contraste, tamanho de texto e tema | `src/ui-preferences.js` | Teclado, modo claro/escuro e contraste | Implementado no código |
| RF12 | Visitante pode consultar rede de apoio | `src/app.js`, `src/real-app.js` | Abrir `#services` e conferir conteúdo | Implementado no código; parceria não verificada |
| RF13 | Denúncias e moderação possuem regras | `src/app.js`, `src/real-app.js`, migrations de moderação | Abrir painel com perfil autorizado e tentar acesso indevido | Código/migrations; validar versão remota |
| RF14 | Existe modo local de contingência identificado | `src/events.js`, `src/store.js`, `README.md` | Iniciar Vite sem variáveis Supabase | Implementado, apenas demonstração |

## Requisitos não funcionais e verificações

| ID | Requisito mensurável | Método | Evidência existente |
|---|---|---|---|
| RNF01 | Navegação em celular sem rolagem horizontal | viewport 320, 390, 768, 1024, 1440 px | `tests/browser*.cjs` |
| RNF02 | Controles utilizáveis via teclado | Tab, Shift+Tab, Enter, Escape | `tests/browser-real.cjs`; inspeção manual |
| RNF03 | Validação negativa de entrada | casos inválidos de identidade, data e imagem | `tests/*.test.cjs` / `*.test.mjs` |
| RNF04 | Nenhum segredo privilegiado no navegador | revisão de `.env.example` e bundles | inspeção manual |
| RNF05 | Leitura/edição dependem de autorização remota | dois usuários, consulta cruzada, RLS | `supabase/tests/`; executar no ambiente |
| RNF06 | Verificações de sintaxe/testes/build repetíveis | três comandos NPM | `package.json` |
| RNF07 | Evidência de manutenção e evolução | comparar commits e sprints | `docs/SPRINTS.md`, histórico Git |

**Regra de rastreabilidade:** se um comportamento não é demonstrável na versão entregue, registrar como **parcial** ou **previsto**; não classificá-lo como concluído apenas porque há uma tela, migration ou teste escrito.
