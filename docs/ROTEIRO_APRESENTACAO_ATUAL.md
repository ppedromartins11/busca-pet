# BuscaPet — roteiro de apresentação e checklist

**Data de referência:** 19/11/2026. **Branch de apresentação:** `apresentacao-contas-2026-11-19`. **URL:** https://busca-pet-delta.vercel.app/

## Visão geral

O BuscaPet reúne divulgação e busca por animais perdidos, avistamentos, acompanhamento de pets e visibilidade de serviços comerciais do setor. A apresentação roda em JavaScript/Vite com persistência **local no navegador**. Não depende de banco de dados, Supabase, SMTP ou conta profissional externa.

Os registros iniciais (animais Hex, Bold e Gargamel, alertas e avistamentos) servem para demonstrar as telas e não representam ocorrências reais. Estabelecimentos externos listados na Rede de Apoio não são declarados parceiros oficiais. A localização, quando solicitada, depende de autorização do usuário e serviços públicos de mapas.

## Acessos para a apresentação

| Tipo | Credencial | O que pode demonstrar |
| --- | --- | --- |
| Tutor | `tutor@buscapet.test` / `BuscaPet@2026` | Pets, alertas, mapa, cartaz, carteirinha, agenda, pistas |
| Administrador | `admin@buscapet.test` / `BuscaPet@2026` | Todas as ações do tutor + painel administrativo, decisões e empresas |
| Empresa | Criar conta em `#cadastro-empresa` | Perfil comercial, alteração, espera de aprovação + ações de tutor |
| Visitante | Sem login | Feed, mapa e informações de alertas públicos, serviços externos |

Não use senha pessoal no cadastro local. Os dados cadastrados não ficam disponíveis em outros aparelhos.

## Sequência sugerida — 7 a 9 minutos

1. **Página inicial (1 min):** mostre alertas, filtro por desaparecido/encontrado, pesquisa e cards com fotos. Explique a indicação de registros de apresentação.
2. **Alerta (1 min):** abra um dos anúncios, mostre mapa aproximado, relatos e botões **Criar cartaz** e **Possíveis correspondências**. Explique que a comparação usa dados declarados, não reconhecimento facial.
3. **Tutor (2 min):** entre com o tutor, abra **Minha área**, confira os números, as fotos dos alertas, as pistas pendentes e os próximos compromissos. Em **Meus animais**, abra a carteirinha de Hex, edite e salve um campo.
4. **Agenda (1 min):** acrescente um cuidado com data, marque como concluído e reabra. Mostre que permanece após recarregar a página.
5. **Empresa (1 min):** mostre `#cadastro-empresa`, os campos e a página de perfil empresarial. Se já houver uma empresa cadastrada neste mesmo navegador, entre com ela.
6. **Administrador (1–2 min):** entre como administrador. Mostre **Administração → Empresas** (aprovar/recusar), denúncias e moderação. Abra também **Meus animais** ou **Publicar** para mostrar que o administrador pode ser tutor.
7. **Encerramento:** explique que a versão apresentada é uma SPA local, com autenticação e persistência de demonstração. Integração entre aparelhos, mensagens em tempo real e proteção real contra spam são evoluções posteriores.

## Checklist de homologação

- [ ] GitHub Actions: sintaxe, testes de unidade e build aprovados no mesmo SHA
- [ ] Browser Chromium: rotas e ausência de overflow em 320, 390, 768 e 1440 px
- [ ] Navegador: cadastro, login e recuperação com código no modo local
- [ ] Tutor: criar/editar pet, foto de capa, alertas e avistamentos
- [ ] Cartaz: PNG renderizado, foto, contato oculto até consentimento e impressão
- [ ] Carteirinha: dados salvos e isolados por conta
- [ ] Agenda: criação, conclusão, reabertura, remoção e persistência
- [ ] Empresas: cadastro, perfil pendente, aprovação, vitrine, telefone e mapa
- [ ] Admin: gerir empresas, denunciar/moderar e acessar funções comuns de tutor
- [ ] Safari no iPhone: conferência manual de toque, rolagem, formulários e salvar cartaz
- [ ] Produção publicada: confirmar domínio, SHA e estado READY

Não marque como validado um item não testado. Os arquivos da pipeline fornecem evidência para Chromium; a verificação no Safari precisa ser feita separadamente em um iPhone.

## Precauções

- **Nunca** confunda anúncios de demonstração com ocorrências reais. A Home avisa que são registros de teste.
- Ao redefinir os dados, o modo local esvazia animais, alertas, empresas, denúncias e fotos deste navegador. A operação não é reversível.
- WhatsApp pode ser incluído no cartaz apenas se o tutor cadastrou e autorizou o telefone, e depois habilitou explicitamente sua exibição na imagem.
- Não existem chat persistente entre usuários, notificação push, integração centralizada de empresas, confirmação jurídica dos estabelecimentos ou e-mail transacional.
- Não há garantia de funcionamento offline dos mapas externos. O mapa tem alternativa textual.
