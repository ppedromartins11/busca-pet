# Roteiro de demonstração — versão 0.5

Use apenas dados fictícios. Execute por servidor estático e comece sem sessão.

Os passos funcionais permanecem os mesmos da versão 0.4; a versão 0.5 altera a organização interna, não o roteiro do produto.

1. Tente abrir `#post`. Mostre o redirecionamento para Entrar e explique que a rota pretendida foi preservada.
2. Entre como Tutor (`tutor@demo.buscapet` / `BuscaPetDemo!`). Confirme o retorno à publicação e destaque que a conta possui uma única função, por isso não exibe alternador.
3. Saia e abra Criar conta. Selecione Tutor e Colaborador; mostre a escolha obrigatória da área inicial. Observe que Moderador e Administrador não aparecem.
4. Crie a conta com senha fictícia. Na verificação, destaque que nenhum e-mail foi enviado; use “Simular e-mail verificado”.
5. Alterne de Tutor para Colaborador pelo cabeçalho. Mostre que a sessão e a identidade permanecem, enquanto menu, atalhos e painel mudam.
6. Tente abrir uma central sem participação. Mostre Acesso limitado e explique que trocar o hash não concede permissão.
7. Em Minha conta, mostre dados pessoais, funções, função ativa, segurança, privacidade, dados locais e logout. Explique as dependências para remover uma função.
8. Entre novamente como Tutor demonstrativo. Publique um alerta, inclua o Colaborador e registre/revise uma pista.
9. Crie uma tarefa para o Colaborador. Saia e entre como `colaborador@demo.buscapet`; conclua a tarefa com método e resultado.
10. Volte como Tutor, encerre como “Localizado, ainda sem reencontro”, reabra com justificativa e confira o histórico.
11. Registre uma denúncia. Entre como `moderador@demo.buscapet`, decida com justificativa e mostre que essa função veio do seed, não do cadastro público.
12. Abra Esqueci minha senha. Mostre a resposta neutra e, em seguida, os estados `#redefinir-senha/expired`, `/invalid` e `/error`.
13. Mostre o armazenamento do navegador ou os testes para evidenciar que senha, confirmação e token não foram persistidos.
14. Exporte os registros e explique que o arquivo inclui dados operacionais locais, não credenciais. Não publique a exportação.

Na conclusão, separe claramente:

- funcional: fluxo de interface, sessão demonstrativa, funções, guards e operações locais;
- simulado: credenciais, confirmação, recuperação, parceiro em análise e autorização;
- próxima etapa: Supabase Auth, tabelas relacionais, RLS, auditoria administrativa, storage privado e testes entre dispositivos.
