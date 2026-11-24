# BuscaPet — roteiro final de apresentação acadêmica

**Projeto Integrador II — ADS**  
**Professor avaliador informado:** Odirley Franco de Oliveira  
**Revisado em:** 24/11/2026  
**Versão funcional examinada:** `2507a68` · **site:** https://busca-pet-delta.vercel.app/

Este roteiro descreve apenas a versão atualmente publicada; não confundir com o protótipo v0.5 ou a versão futura com Supabase. Os registros iniciais da aplicação são dados preparados para demonstração, não desaparecimentos confirmados. O aviso de “Ambiente de apresentação” **foi retirado da Home**; informe o escopo local verbalmente e na documentação.

## Antes de entrar na sala

1. Abra o endereço do BuscaPet no navegador que já contém os dados preparados. Não dependa de outro celular para acessar esses cadastros.
2. Selecione a conta de tutor ou administrador a partir das credenciais informadas abaixo; as credenciais de avaliação **não aparecem mais na tela de login**.
3. Confira as fotos no feed, o alerta de Hex, o cartaz, o painel de tutor, a agenda, a área administrativa e a Rede de Apoio.
4. Não acione **Minha conta → Apagar dados deste dispositivo**: essa função esvazia os registros locais e não possui restauração automática.
5. Leve uma cópia dos dados de demonstração ou planeje recriá-los caso o navegador perca seu armazenamento. A versão publicada depende da internet para servir o site e pode precisar de rede para os mapas.

### Contas preparadas

| Perfil | E-mail | Senha |
|---|---|---|
| Tutor | `tutor@buscapet.test` | `BuscaPet@2026` |
| Administrador | `admin@buscapet.test` | `BuscaPet@2026` |
| Empresa | Conta criada em `#cadastro-empresa` | Senha definida na criação |

Esses acessos servem apenas para o modo local. Não são usuários do Supabase nem representam controle de acesso de servidor.

## Sequência recomendada (aproximadamente 8 minutos)

**1. Problema e solução (45 s).** Explique que alertas de animais perdidos ficam espalhados em diferentes canais e que o BuscaPet os organiza em uma aplicação web responsiva. Apresente a Home com fotos, busca, filtros e mapa.

**2. Fluxo do animal desaparecido (1 min 30 s).** Abra um alerta de desaparecimento. Mostre características, região aproximada e opção de registrar avistamento. Demonstre o cartaz PNG e as possíveis correspondências com anúncios de animais encontrados. Explique que a comparação usa regras e pontuações, não inteligência artificial.

**3. Área do tutor (1 min 30 s).** Entre como tutor. Em **Minha área**, mostre animais, alertas, avistamentos pendentes e próximos compromissos; em **Meus animais**, abra Hex e sua **Carteirinha digital**. Demonstre uma edição simples e salvamento.

**4. Agenda de cuidados (1 min).** Abra **Agenda**, crie um cuidado, marque como concluído e reabra. Recarregue a tela para mostrar a persistência no mesmo navegador.

**5. Rede de Apoio e empresas (1 min).** Mostre o diretório de estabelecimentos com contato público e busca por proximidade quando autorizada. Abra o cadastro de empresa; explique que um perfil cadastrado só aparece após aprovação administrativa, sem confundir aprovação local com validação jurídica ou parceria contratual.

**6. Administração (1 min 30 s).** Entre como administrador. Abra **Administração → Empresas** e mostre aprovação/recusa com justificativa; apresente também denúncias e moderação. Em seguida, abra **Meus animais** ou **Meu pet sumiu** para evidenciar que o administrador também atua como tutor.

**7. Engenharia de Software (45 s).** Mostre a separação em módulos (`pet-poster.js`, `pet-matching.js`, `local-preview.js`, `permissions.js`), GitHub e os workflows de verificação. Explique que testes não tornam a solução automaticamente apta para produção real.

## Resumo do que dizer sobre a arquitetura

> "O BuscaPet é uma SPA em JavaScript com Vite. Nesta entrega, os cadastros e as imagens ficam no navegador e demonstram os fluxos de tutor, empresa e administrador. O projeto também possui uma base de integração com Supabase para evolução, mas a versão publicada não compartilha informações entre dispositivos. Nossos testes automatizados verificaram sintaxe, funcionalidades e responsividade em Chromium."

Esta é uma explicação tecnicamente correta e não promete recursos inexistentes.

## Checklist antes da avaliação

- [x] Sintaxe, testes e build aprovados nos workflows de 19/11/2026.
- [x] Homologação em Chromium com larguras de 320, 390, 768 e 1440 px.
- [x] Verificação automatizada de perfis tutor/administrador/empresa e fluxos representativos.
- [x] Confirmação da publicação `READY` em 24/11/2026, SHA funcional `2507a68`.
- [ ] Teste manual de Safari/iPhone para foto, teclado e salvamento do cartaz; **não há evidência de teste físico concluído**.
- [ ] Ensaio da apresentação, sem reinicializar o armazenamento local.
- [ ] Confirmar o trabalho e a documentação finais enviados ao professor, incluindo a versão correta do repositório.

**Evidências de CI:** [sintaxe, testes e build](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445999) · [homologação visual](https://github.com/ppedromartins11/busca-pet/actions/runs/44581445883). Essas execuções verificaram o código anterior à revisão exclusivamente documental.

## Perguntas a preparar

Priorize: quatro atividades da Engenharia de Software; requisitos funcionais/não funcionais; coesão versus acoplamento; arquitetura SPA; permissões por papel; critério de correspondência; testes; distinção entre localStorage/IndexedDB e PostgreSQL; limites de segurança do frontend. Estude em [Perguntas de Engenharia de Software](PERGUNTAS_ENGENHARIA_PI2.md).

**Dossiê técnico:** [Entrega do Projeto Integrador II](ENTREGA_PROJETO_INTEGRADOR_II_2026-11-24.md).
