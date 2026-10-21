# Relatório de refatoração — versão 0.5

## Diagnóstico

### MANTER

- Chave `buscapet.v2`, migração v2→v3, exportação de conteúdo corrompido, proteção de quota e conflito entre abas.
- Uma identidade com múltiplas funções, função ativa, guards, central da busca, denúncias, moderação e auditoria.
- Delegação global de eventos, design responsivo, acessibilidade, impressão e todos os 30 testes originais.

### SIMPLIFICAR

- `script.js` concentrava rotas, telas, imagens e eventos em mais de 1.500 linhas.
- `auth.js` misturava persistência, normalização e regras de papéis.
- O `store` repetia verificações de função e algumas operações confiavam em validação feita apenas pela tela.
- CSS mantinha tokens repetidos, dois blocos de impressão e nomes herdados do protótipo de telefone.

### CONSOLIDAR

- Papéis, rótulos, estados, versões e chaves em `constants.js`.
- Validações de cadastro e domínio em `validation.js`.
- Acesso ao armazenamento em `storage.js`.
- Autenticação, função ativa, autorização e guard em módulos distintos.
- Escape e componentes repetidos em `views.js`; fotos em `images.js`; listeners em `events.js`.
- Ações de clique em uma tabela de despacho, substituindo a sequência extensa de condições.

### REMOVER

| Código removido | Evidência de desuso |
|---|---|
| telas/allowlist `clinic` e `splash` | só eram criadas e liberadas no roteador; não havia link, teste ou documentação que as alcançasse |
| aliases `#entrar`, `#signup`, `#recovery` | apareciam apenas nas condições do roteador; nenhuma referência, link ou teste usava os aliases |
| ação `service-demo` | havia handlers, mas nenhum elemento com `data-action="service-demo"` |
| submit de `profile-form` | nenhum formulário com esse ID era gerado |
| CSS `.mode-options` e `.no-print` | busca em HTML/JS/testes não encontrou correspondência |
| classe HTML `phone` | não possuía regra CSS; `.app-shell` já era a classe efetiva |
| segundo `@media print` | continha apenas `.poster-actions`; a regra foi incorporada ao bloco de impressão existente |

As buscas foram feitas em todo o projeto e confirmadas contra a cópia 0.4 antes da remoção.

## Reorganização

Os cinco arquivos JavaScript da raiz viraram 12 módulos em `src/`: `constants`, `storage`, `validation`, `store`, `auth`, `permissions`, `router`, `legal`, `images`, `views`, `app` e `events`. A ordem explícita em `index.html` documenta as dependências globais temporárias.

O `index.html` ficou limitado a metadados, CSS, scripts, skip link, fallback de JavaScript e o contêiner principal. Nenhum framework ou pacote de runtime foi adicionado.

## Regras e segurança preservadas

- Senhas, confirmações e tokens continuam fora do armazenamento.
- Mutações ocorrem sobre cópia e só substituem o estado após persistência bem-sucedida ou aviso explícito de modo somente em memória.
- Permissão de interface não substitui propriedade/participação/atribuição no domínio.
- Denúncia, moderação, contestação, tarefa e encerramento passaram a usar validações reutilizáveis fora da interface.
- A migração passou a rejeitar referências entre entidades quebradas e mantém o original exportável.
- Conteúdo de usuário continua escapado; IDs de URL continuam codificados; imagens continuam restritas ao formato local esperado.

## Comparação

Contagem de linhas físicas, sem minificação:

| Métrica | Antes (0.4) | Depois (0.5) |
|---|---:|---:|
| Arquivos JavaScript da aplicação | 5 | 12 |
| Linhas de JavaScript | 3.064 | 3.482 |
| Linhas de CSS | 2.140 | 2.127 |
| Arquivos de teste | 3 | 4 |
| Testes Node | 30 | 38 |
| Rotas exercitadas no navegador | 19 | 19 |

O aumento de JavaScript decorre de limites de módulo explícitos, validações de domínio e contratos testáveis; não é apresentado como melhoria isolada. `app.js` ficou com 1.344 linhas, enquanto armazenamento, permissões, roteamento, imagens, views e eventos deixaram de estar embutidos nele.

Funcionalidades preservadas: autenticação demonstrativa, conta multifunção, função ativa, painéis, alertas, favoritos, pistas, revisão, participantes, tarefas, encerramento/reabertura, denúncias, moderação, auditoria, exportação/exclusão, migração, impressão e acessibilidade.

## Resultados

- Linha de base: 30/30 testes; sintaxe e navegador aprovados.
- Depois: 38/38 testes; sintaxe dos 12 módulos aprovada.
- Navegador: 18 fluxos, 19 rotas, cinco larguras, sem erros, IDs duplicados ou overflow.
- Inspeção visual: desktop 1440×900 e celular 390×844 aprovados.

## Limitações restantes

O controlador de telas ainda é o maior arquivo porque a aplicação usa templates literais sem framework; dividi-lo por rota agora criaria módulos pequenos e acoplados sem ganho proporcional. A autenticação e autorização continuam demonstrativas e locais. Não há backend, Supabase, RLS, e-mail, sincronização entre dispositivos, mapa real, parceiros verificados ou proteção de dados contra quem controla o navegador.
