# Sprints do BuscaPet

## Incremento 0.5 — refatoração estrutural

**Entregue nesta versão:** separação de constantes, armazenamento, validação, identidade, permissão, roteamento, imagens, views e eventos; validação de referências na migração; autorização por ação; consolidação de CSS; remoção de rotas e handlers sem uso; documentação e testes adicionais.

Nenhuma funcionalidade de produto foi adicionada. A chave `buscapet.v2`, o documento v3, os fluxos da versão 0.4 e o desenho visual foram preservados. A suíte passou de 30 para 38 testes e os mesmos 19 cenários de rota continuam aprovados nas cinco larguras.

## Incremento 0.4 — fluxo local de identidade e funções

**Entregue nesta versão:** cadastro, entrada, recuperação e redefinição simuladas, verificação de e-mail simulada, Minha conta, uma conta com múltiplas funções, função ativa, painéis separados, guards de rota, logout, expiração e migração dos perfis anteriores. Tutor, Colaborador e Parceiro aparecem no cadastro; Moderador vem apenas do seed; Administrador continua reservado.

O incremento valida a estrutura de navegação e as regras de interface, não autenticação segura. Senhas e tokens não são persistidos e nenhuma mensagem de e-mail é enviada. A central operacional da Sprint 1 foi preservada.

Critério técnico atendido no protótipo: uma conta Tutor + Colaborador alterna a função ativa na mesma sessão; rotas protegidas retornam ao destino original; ações locais repetem a autorização; as cinco larguras de referência não apresentam rolagem horizontal.

## Sprint 1 — entregue nesta versão

**Objetivo:** demonstrar se uma pista pode virar uma ação verificável, sem depender de mapas preditivos ou IA.

Entregue: redesenho, central por ocorrência, pistas com evidências e origem, revisão humana justificada, tarefas com responsável e resultado, colaboração local, histórico, encerramento honesto e reabertura. Correções de rascunho, validação, armazenamento, migração e processamento de fotos fazem parte da entrega.

Critérios técnicos: publicar, registrar e revisar pista, atribuir tarefa, concluir com método e resultado e encerrar corretamente; preservar as regras de denúncia e moderação; navegar no celular sem rolagem horizontal.

**Ainda não validado:** ganho na recuperação de animais, adesão de pessoas reais e disposição de parceiros para participar. Testes de software não comprovam valor de mercado.

## Sprint 2 — colaboração real e persistência

**Não implementada nesta entrega.**

1. Definir operação piloto e responsáveis pelo atendimento e pelos dados.
2. Conectar o contrato `BPAuth` ao Supabase Auth, PostgreSQL e armazenamento privado de imagens.
3. Levar a validação para o servidor; definir autorização por usuário e ocorrência.
4. Implementar convite e aceite de colaboradores, revogação e vínculo de tarefas.
5. Separar informações públicas aproximadas de evidências detalhadas restritas.
6. Implementar exclusão, retenção, auditoria protegida, cópias de segurança e restauração.
7. Criar `usuarios`, `funcoes`, `usuario_funcoes`, `perfis_parceiros` e `auditoria_funcoes`, com RLS e concessão administrativa de Moderador.
8. Testar tentativa de acesso de outro usuário, autoatribuição de função privilegiada, upload indevido e operações concorrentes.

Critério de saída: dois dispositivos com usuários diferentes cooperam na mesma ocorrência, sem conseguir ler ou alterar ocorrências restritas de terceiros. Sem esse critério, não apresentar como serviço público.

## Sprint 3 — localização e divulgação utilizáveis

**Não implementada nesta entrega.**

- PostGIS e coordenadas opcionais, com precisão informada e alternativa manual.
- Mapa real de último local e avistamentos; acesso diferenciado ao local exato.
- Página pública e cartaz com QR Code funcional; foto e informações mínimas.
- Avisos de novas pistas com consentimento, limites de frequência e confirmação de entrega.
- Matching inicial por características, região e tempo, com revisão humana.

Critério de saída: registrar uma pista em um celular e o responsável receber um aviso verificável; nenhum trajeto pessoal é publicado.

## Sprint 4 — piloto de discovery

**Não implementada nesta entrega.**

Operar inicialmente com um pequeno grupo de parceiros e uma região de Campo Grande. Priorizar entrevistas comportamentais e operações assistidas. Registrar tempo entre pista e revisão, tarefas com resultado, relatos duplicados, esforço de coordenação e reencontros confirmados. Distinguir contribuição da plataforma de recuperação ocorrida por outros meios.

Critério de decisão proposto, ainda a validar com a equipe: continuar quando houver uso repetido da central durante buscas reais e evidência qualitativa de uma decisão melhor; corrigir o fluxo se ele aumentar a carga de trabalho. Um número pequeno de ocorrências não permite afirmar ganho causal na recuperação.

## Adiados por falta de evidência

SightScore percentual, mapas vermelhos de probabilidade, previsão de deslocamento, rastreamento de voluntários, compra automática de mídia, reconhecimento individual por foto, assinaturas e white-label. Cada item precisa demonstrar benefício adicional sobre o fluxo simples antes de ser desenvolvido.
