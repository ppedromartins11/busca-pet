# Perguntas e respostas — Engenharia de Software aplicada ao BuscaPet

**Uso:** preparação para a apresentação do **Projeto Integrador II**, avaliado pelo professor **Odirley Franco de Oliveira** (nome informado pelo aluno).  
**Base técnica:** código da branch `apresentacao-contas-2026-11-19`, publicado com baseline funcional `2507a68`, analisado em 24/11/2026.  
**Nível das respostas:** linguagem de estudante de ADS, com precisão técnica e exemplos concretos do projeto.

## A. Problema, requisitos e escopo

### 1. Qual problema o BuscaPet procura resolver?

A divulgação de animais perdidos costuma ficar espalhada em grupos de mensagens e redes sociais. O BuscaPet reúne alertas, características, regiões e avistamentos, facilitando a organização da busca. Também oferece uma área de cuidados do tutor e um diretório de serviços pet.

### 2. Qual é o principal objetivo da versão apresentada?

Demonstrar um **MVP funcional**: navegação, publicação e consulta de alertas, cadastro de animais, registro de pistas, administração e ferramentas auxiliares. A entrega é um sistema web **local ao navegador**, e não uma rede pública multiusuário.

### 3. O que é MVP?

Produto mínimo viável: uma versão com as funções essenciais para validar um fluxo de uso e colher feedback sem implementar todas as possibilidades futuras. No BuscaPet, o fluxo principal é cadastrar animal → publicar alerta → consultar alerta → registrar avistamento → acompanhar.

### 4. Cite requisitos funcionais implementados.

Cadastrar animais, editar perfis, publicar alertas de desaparecimento/encontro, consultar alertas, registrar avistamentos, gerar cartaz, comparar possíveis correspondências, manter carteirinha, criar cuidados, cadastrar empresas e moderar registros. São comportamentos observáveis do sistema.

### 5. Cite requisitos não funcionais e a evidência correspondente.

Responsividade (Chromium em 320/390/768/1440 px), usabilidade (rótulos/fluxos de navegação), manutenibilidade (módulos, GitHub e testes), privacidade de localização (área pública aproximada) e portabilidade (SPA acessível pelo navegador). **Não** afirmar conformidade WCAG, segurança de produção ou performance sob carga sem testes específicos.

### 6. Qual a diferença entre requisito funcional e não funcional?

Funcional descreve **o que o software faz** — ex.: criar um alerta. Não funcional descreve **como ele deve funcionar** — ex.: evitar rolagem horizontal no celular ou não revelar localização exata sem consentimento.

### 7. Quais atores existem no sistema?

Visitante, Tutor, Empresa e Administrador. Tutor e empresa podem cadastrar seus próprios pets; administrador tem ações comuns de tutor mais moderação. A relação de proprietário continua sendo considerada nas operações locais.

### 8. Quais regras de negócio merecem destaque?

Um tutor só deve modificar seus próprios dados; uma empresa só aparece publicamente após aprovação; um avistamento pode requerer revisão; o cartaz não inclui telefone sem consentimento; a correspondência só compara alertas públicos ativos de tipos opostos.

## B. Processo e arquitetura

### 9. Qual modelo de processo de software foi usado?

Uma abordagem **iterativa e incremental**: começar com alertas e navegação, acrescentar módulos, corrigir bugs, testar e atualizar o sistema. Não afirmar que Scrum foi aplicado integralmente se não houver evidência de seus papéis, cerimônias e artefatos.

### 10. Quais são as quatro atividades fundamentais da Engenharia de Software?

**Especificação**, **desenvolvimento**, **validação** e **evolução**. No BuscaPet: definir requisitos, programar funcionalidades, executar testes e corrigir/expandir por versões.

### 11. Qual arquitetura foi escolhida?

Uma **SPA** (aplicação de página única) em JavaScript com Vite, CSS responsivo e rotas no navegador. A interface `BPRealApp` chama contratos de identidade e dados; na versão de apresentação esses contratos são implementados localmente, usando armazenamento do dispositivo. Há código de integração remota no repositório, mas ele **não** é usado na publicação atual.

### 12. Por que Vite e JavaScript?

Vite empacota os arquivos estáticos e acelera o fluxo de desenvolvimento; JavaScript permite formulários, rotas e interação com armazenamento local sem exigir instalação de aplicativo nativo. É uma escolha adequada para demonstrar uma SPA acessível pelo navegador.

### 13. Onde está a modularização?

Exemplos: `pet-poster.js` desenha cartazes; `pet-matching.js` faz a comparação; `nearby-services.js` organiza a consulta de serviços; `local-preview.js` fornece persistência e regras locais; `permissions.js` auxilia nas regras de papéis. A interface `real-app.js` ainda é extensa e representa um ponto de melhoria.

### 14. O que são alta coesão e baixo acoplamento? O projeto cumpre?

**Coesão** significa agrupar funções da mesma responsabilidade; o módulo de cartaz é um bom exemplo. **Acoplamento** mede a dependência entre componentes; a interface usa um contrato de dados que permite trocar o provedor. Porém, há globais em `window` e controlador grande — por isso é correto dizer que **buscamos** esses princípios, sem alegar perfeição.

### 15. O BuscaPet utiliza MVC, SOLID ou padrões GoF integralmente?

Não há comprovação para essa afirmação. Existem separação de responsabilidades, interface/adaptador de dados e delegação de eventos, mas essas características não tornam automaticamente o projeto MVC ou um exemplo completo de SOLID.

### 16. Qual é a diferença entre coesão e acoplamento, na prática?

Na carteirinha, validação e gravação ficam próximas das operações específicas de cuidado, aumentando coesão. Se o módulo de interface conhecesse todas as tabelas e detalhes do armazenamento, o acoplamento seria maior. Ao depender de métodos de `BPRemoteStore`, reduzimos parte dessa dependência.

### 17. O que significa atomicidade e ela existe no projeto?

Atomicidade é uma operação ser concluída integralmente ou não ser aplicada. No protótipo, diversas funções validam e atualizam o estado de uma vez no armazenamento local; **não** há garantia ACID equivalente à de um banco de dados servidor, especialmente entre dispositivos ou abas concorrentes. O exemplo de banco relacional é uma evolução separada.

### 18. Como você definiria manutenção corretiva, adaptativa, perfectiva e preventiva?

**Corretiva:** consertar um bug, como acesso do administrador às telas de tutor. **Adaptativa:** compatibilizar uma tela com particularidades de navegadores. **Perfectiva:** melhorar a legibilidade do dashboard. **Preventiva:** acrescentar testes que evitem regressões futuras.

## C. Banco de dados, segurança e privacidade

### 19. Que banco de dados o projeto publicado utiliza?

Nenhum banco de dados compartilhado. Os registros locais são armazenados no navegador (principalmente `localStorage`, além de `IndexedDB` para fotos). O repositório contém scripts e integração com Supabase, mas a versão publicada não usa essa persistência.

### 20. Por que isso importa?

Porque anúncios cadastrados em um celular **não aparecem automaticamente em outro**. A plataforma demonstra o fluxo da aplicação, mas ainda não permite colaboração multiusuário real. Para uso público, são necessários backend compartilhado, autenticação real, autorização no servidor e testes de integração.

### 21. Como são controladas as permissões?

Por papel (Tutor, Empresa ou Administrador), sessão local e relação do usuário com cada recurso. O cliente e o adaptador de dados validam essas regras. **Limite:** como o código roda no navegador, esse controle não protege contra quem manipula diretamente o armazenamento; em produção, essas regras precisariam ser aplicadas no servidor.

### 22. O que é RLS no Supabase? Está funcionando nesta publicação?

RLS significa *Row Level Security*, autorização por linha no PostgreSQL. Há migrations e código preparado para uma versão conectada. **Não está em operação na versão apresentada**, portanto não podemos afirmar que os dados desta publicação estão protegidos por RLS.

### 23. O sistema guarda senhas?

As contas cadastradas no modo local usam derivação criptográfica por PBKDF2 e um `salt`, conforme `local-preview.js`. As contas demonstrativas padrão possuem uma senha pública de apresentação. Nada disso substitui um provedor de autenticação seguro com recuperação de conta e verificação remota.

### 24. Como evitam divulgar uma localização exata?

O formulário do mapa trabalha com região aproximada e autorização do usuário. Não se deve publicar endereço residencial ou coordenada precisa em um anúncio aberto. Isso representa uma decisão de privacidade, não auditoria formal completa de LGPD.

### 25. Como funciona a proteção contra spam no contato?

O formulário de contato exige informações da pista antes de preparar uma mensagem de WhatsApp e limita tentativas registradas **no navegador**. Isso reduz usos acidentais, mas é facilmente contornável; a solução real dependeria de contas, limites e moderação no backend.

### 26. O BuscaPet possui chat interno real?

Não. O sistema prepara contatos pelo WhatsApp e permite registrar avistamentos locais. Mensagens entre usuários em aparelhos distintos, caixa de entrada compartilhada e notificações em tempo real ainda não existem na versão apresentada.

## D. Algoritmos, qualidade e testes

### 27. Como funciona a busca de animais semelhantes?

O arquivo `pet-matching.js` compara alertas públicos ativos de tipos opostos (perdido e encontrado). Atribui pontos a coincidências como mesma cidade, bairro, espécie, porte, raça, pelagem e datas próximas. Mostra motivos da correspondência e ordena resultados. **Não há reconhecimento facial nem certeza de identidade.**

### 28. Como é feito o cartaz?

`pet-poster.js` usa a API Canvas do navegador e desenha imagem, nome, descrição e região. A pessoa salva PNG ou usa a impressão do navegador. O WhatsApp só entra no cartaz quando a própria conta autorizou o telefone e marcou sua inclusão.

### 29. Que tipos de teste foram aplicados?

**Unitários e regressão** com `node --test`; **sintaxe** com `npm run check`; **build** com Vite; **testes de navegação e responsividade** com Chromium/Playwright. A última revisão funcional registrou workflows aprovados. A ausência de testes de carga, Safari físico, leitor de tela e backend real deve ser declarada.

### 30. O que os testes não comprovam?

Não comprovam que duas pessoas colaboram de aparelhos diferentes, segurança real contra invasões, disponibilidade 24/7, conformidade integral com normas de acessibilidade ou que os algoritmos de correspondência identificam corretamente animais de verdade.

### 31. Como é feito o controle de versões?

Pelo Git e GitHub: branches de funcionalidade, pull requests, testes automatizados, revisão e publicação na Vercel a partir de um commit identificado. Isso permite rastrear problemas e evitar alterar diretamente a versão usada na avaliação.

### 32. Qual é a principal dívida técnica?

A centralização de muitas rotas e ações em `src/real-app.js` e o uso parcial de contratos globais em `window`. Outra limitação é a falta de backend compartilhado na versão apresentada. Para o MVP acadêmico, optamos por estabilizar as jornadas em vez de ampliar o escopo imediatamente.

### 33. O BuscaPet está pronto para uso comercial?

**Não na versão atual.** Ele está pronto para apresentar suas funções acadêmicas de forma local. Para usuários reais, faltam persistência multiusuário, autenticação de servidor, RLS, política operacional, moderação distribuída, proteção antispam e homologação de privacidade.

### 34. Qual seria a próxima etapa, caso continuássemos o projeto?

Transferir identidades, animais, alertas, avistamentos, carteirinhas e empresas para banco compartilhado; aplicar autorização no servidor; validar fluxos com duas contas e dispositivos; preparar políticas de dados; fazer piloto controlado. Isso é **planejamento**, não funcionalidade já entregue.

## E. Questões que podem pegar o grupo de surpresa

| Pergunta provável | Resposta curta que evita erro |
|---|---|
| “Se eu me cadastrar no meu celular, o colega vê?” | Não. Nesta versão os dados ficam no próprio navegador. |
| “O site tem banco de dados PostgreSQL?” | O repositório tem a preparação, mas a publicação atual usa armazenamento local. |
| “Vocês usam IA para achar cachorro parecido?” | Não; é comparação determinística por características e localização. |
| “Vocês implementaram Scrum?” | Trabalhamos de modo incremental, sem evidência de Scrum completo. |
| “Por que não usar MVC?” | Priorizamos a SPA modular com contratos de acesso a dados; não alegamos MVC formal. |
| “Qual parte representa alta coesão?” | Módulos de cartaz, matching e serviços possuem responsabilidades específicas. |
| “As funções de admin são seguras?” | São verificadas no protótipo local, mas a segurança efetiva exigirá servidor e RLS. |
| “Essa nota de testes é cobertura de código?” | Não; resultados de workflow não são métrica de cobertura. |
| “Como a empresa vira parceira?” | O cadastro precisa de aprovação local; não implica parceria contratual ou verificação jurídica. |
| “Qual é o maior risco?” | Apresentar o protótipo local como serviço multiusuário pronto para produção. |

## Como estudar

Use **uma explicação + um exemplo do BuscaPet + uma limitação** em cada resposta. Evite recitar definições sem demonstrar o código correspondente. Pratique sobretudo as questões 10, 14, 17, 19, 21, 27, 29 e 33, pois conectam diretamente Engenharia de Software à entrega.

Consulte [dossiê da entrega](ENTREGA_PROJETO_INTEGRADOR_II_2026-11-24.md), [matriz de requisitos](MATRIZ_RASTREABILIDADE.md) e [roteiro de apresentação](ROTEIRO_APRESENTACAO_ATUAL.md).
