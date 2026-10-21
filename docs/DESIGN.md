# Direção visual — Sprint 1

## Processo aplicado

O comando solicitado `npx skills use "https://github.com/anthropics/skills" --skill "frontend-design"` foi executado, com saída integral lida. As instruções orientaram planejamento, implementação e inspeção visual. O código final não depende dessa ferramenta para funcionar.

## Tokens e escolhas

| Papel | Cor |
|---|---|
| Superfície | Branco `#FFFFFF` |
| Fundo de apoio | Lavanda `#F3EFF9` |
| Ação principal | Roxo `#683BB4` |
| Texto principal | Ameixa `#30213F` |
| Encontrado / resultado | Verde `#276753` |
| Atenção | Âmbar `#986014` |

Títulos usam a família local Trebuchet MS, com fallback Segoe UI e sans-serif. Texto usa Segoe UI, Arial e sans-serif. Não há download de fontes. A aparência pode variar conforme as fontes instaladas.

O animal ocupa a imagem principal; ações urgentes ficam junto do título. No desktop, filtros ficam na lateral e fotos em colunas; no celular, filtros se recolhem e a navegação fica acessível no rodapé. A central usa duas colunas de trabalho no desktop e uma no celular.

## Revisão contra o objetivo

O plano inicial foi ajustado para evitar estatísticas decorativas, mapa fictício e cartões idênticos em todas as telas. O catálogo usa cartões porque cada animal é uma unidade comparável; pistas e tarefas usam divisórias e formulários ligados ao contexto. Cor acompanha rótulos textuais e não é o único indicador de estado.

A imagem de destaque concentra a expressão visual. A central permanece discreta para facilitar leitura de relatos. Foram preservadas as fotos fornecidas no projeto, sem inventar novos animais ou parceiros. O conteúdo distingue demonstração e operação real.

## Acessibilidade e revisão

Rótulos visíveis, foco de teclado, texto alternativo, botão de favorito com estado, mensagens de erro, suporte a movimento reduzido e controles com área de toque. A inspeção visual em Chromium não equivale a auditoria WCAG completa ou teste com leitor de tela.

## Extensão 0.4 — identidade e funções

As telas de acesso reutilizam roxo, lavanda, tipografia, campos e botões existentes. No desktop, o formulário ocupa uma coluna limitada e a fotografia local de Hex acompanha uma explicação direta; no celular, esse painel é removido para priorizar a ação. Não foram adicionados gradientes, imagens externas, animações decorativas ou uma coleção excessiva de cartões.

Funções públicas usam controles selecionáveis com nome cotidiano, explicação e nome técnico. A função ativa aparece em um `select` acessível no cabeçalho apenas quando há mais de uma opção. Painéis de Tutor, Colaborador e Parceiro são rotas separadas, evitando misturar ferramentas.

Cadastro, login e Minha conta foram inspecionados em 320, 390, 768, 1024 e 1440 px. Mensagens por campo, `aria-live`, foco do título, autocomplete, controle de senha com `aria-pressed` e alvos de toque de 44 px complementam as regras anteriores.
