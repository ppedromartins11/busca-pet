# Aspectos jurídicos do BuscaPet

Material acadêmico, consultado em 25/09/2026. Não equivale a parecer jurídico nem a declaração de conformidade integral. Os textos em `BPLegal`, definidos em `src/legal.js`, descrevem esta demonstração local.

## Responsabilidade e termos

Os termos delimitam a finalidade do serviço e as obrigações de uso. Uma cláusula de isenção total não elimina responsabilidades impostas por lei. Quando houver relação de consumo, os artigos 25 e 51 do CDC limitam cláusulas de exoneração e renúncia a direitos.

No projeto, isso resulta em texto sem promessa de reencontro, sem garantia sobre recompensas e sem exclusão geral de responsabilidade. A operação não recebe nem processa pagamentos.

## Conteúdo de terceiros

A interpretação do artigo 19 do Marco Civil foi alterada pelo STF no julgamento dos Temas 533 e 987, concluído em 26/06/2025. Não é correto apresentar a ordem judicial como requisito universal para atuação ou responsabilidade. O Decreto 12.975/2026 também disciplina procedimentos relativos à moderação e notificações. O conteúdo, o serviço e a situação concreta influenciam o enquadramento.

A solução proposta é um canal identificável de denúncia, análise documentada, medidas justificadas e contestação. O protótipo apenas registra isso localmente. Não recebe notificações externas nem se comunica com autoridades. A aplicação pública deverá possuir operação humana, canais efetivos e procedimentos compatíveis com a legislação aplicável.

## Privacidade

A LGPD trata dados de pessoas naturais identificadas ou identificáveis. Informações ligadas ao tutor, como nome, contato e localização, podem ser dados pessoais, ainda que o assunto principal seja um animal. O projeto propõe coleta mínima, divulgação opcional de contato e local aproximado.

Cada finalidade da operação pública exigirá avaliação de base legal. Aceite dos termos não é consentimento genérico. A proposta também inclui direitos dos titulares, retenção definida e segurança desde o planejamento.

## O que ainda precisa de decisão antes do lançamento

| Pendência | Resultado esperado |
|---|---|
| Responsável pela operação | Identificação do controlador e canal de contato |
| Público e idade | Regras de acesso e avaliação específica se houver menores |
| Inventário de dados | Finalidade, base legal, acesso, retenção e exclusão |
| Hospedagem e fotos | Fornecedores, contratos, localização e eventual transferência internacional |
| Moderação | Critérios, atendimento, revisão, registros e tratamento de urgências |
| Incidentes | Plano de resposta e avaliação das comunicações exigíveis |
| Recompensas e serviços | Revisão do escopo caso passe a existir cobrança ou intermediação |

O caráter acadêmico, isoladamente, não deve ser apresentado como dispensa universal de cuidados. Na demonstração, a escolha é trabalhar apenas com dados fictícios.

## Fontes oficiais

- [LGPD, Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm), especialmente arts. 5º, 6º, 7º, 18 e 46.
- [Marco Civil, Lei 12.965/2014](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm).
- [STF, parâmetros para responsabilidade das plataformas, 26/06/2025](https://noticias.stf.jus.br/postsnoticias/stf-define-parametros-para-responsabilizacao-de-plataformas-por-conteudos-de-terceiros/).
- [Decreto 12.975/2026](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12975.htm).
- [CDC, Lei 8.078/1990](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm), arts. 25 e 51.

Antes da operação pública, confirmar a legislação e a jurisprudência atualizadas e solicitar revisão jurídica das minutas e da operação efetiva.

## Atualização da Sprint 1 — 26/09/2026

A minuta exibida na aplicação passou para a versão 0.3 acadêmica para descrever pistas com foto, revisões, tarefas, colaboradores locais, encerramentos e rascunhos por aba. Esse ajuste documenta o comportamento do protótipo; não constitui parecer jurídico ou validação de conformidade.

Não há mapa real nem diretório de estabelecimentos nesta entrega. A central limita a exibição pela interface, mas dados locais não são protegidos contra a pessoa que controla o navegador. Antes de uso público, implementar os controles de servidor e revisar as bases legais, responsáveis, retenção, comunicação e atendimento aos titulares.

## Atualização do protótipo 0.4 — conta e funções

As telas agora solicitam nome, e-mail e senha para demonstrar cadastro, entrada, verificação e recuperação. Não há provedor de identidade: senha, confirmação e token não são persistidos nem transmitidos, e a interface informa que nenhum e-mail foi enviado. A demonstração não deve receber credenciais ou dados reais.

Os metadados locais distinguem uma identidade de suas funções autorizadas. Tutor e Colaborador podem coexistir; Parceiro permanece em análise; Moderador só existe no seed; Administrador não é concedido. Essa separação não equivale a autorização jurídica ou técnica de servidor. Uma versão pública deverá definir controlador, bases legais, transparência, retenção, atendimento aos titulares, segurança, gestão administrativa de funções e auditoria protegida.

## Refatoração 0.5 — tratamento inalterado

A refatoração não acrescenta coleta, compartilhamento, fornecedor ou finalidade. Chaves e conteúdo persistido permanecem compatíveis. O acesso ao armazenamento e as validações foram centralizados, mas continuam sendo controles locais de um protótipo, sem alterar as limitações jurídicas e técnicas já descritas.
