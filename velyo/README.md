# Velyo v0.9 — Banco independente conectado

**Banco Supabase de homologação:** `velyo-homologacao` — ref `lubzabolwkunzsucmwuu` — organização Ativa Digital ON — São Paulo. Projeto original Drogaria Rocha NÃO modificado.

## Os quatro endereços, separados
- `/admin/`: gestor do estabelecimento; e-mail/senha; relatórios, clientes, recompensas.
- `/balcao/`: operador; e-mail/senha; crédito, resgate, cadastro rápido.
- `/cliente/`: consumidor; celular/senha **após verificação do número via Auth**; saldo, histórico, recompensas. Vinculação opcional via link `?loja=slug`.
- `/plataforma/`: administração global Velyo; e-mail/senha e autorização em `loyalty_platform_admins`; empresas, assinaturas e MRR contratado.

## O que foi implantado
12 tabelas com RLS; autenticação baseada em `auth.users`; operação atômica de crédito, resgate e expiração; idempotência por `request_id`; custos de resgate históricos; isolamento entre empresas; dados financeiros ocultos do balcão; associação de cliente exclusivamente com telefone verificado.

## Atenção: antes de entrar
O projeto acaba de ser criado e não contém usuários ou empresas. A tela é real e conectada, mas **ainda não existem credenciais autorizadas**. O onboarding do primeiro administrador é uma tarefa de segurança, não um cadastro livre.

1. Configure Supabase Auth (verificação de e-mail, URL de recuperação, provedores e limite de cadastros).
2. Crie e confirme usuário do proprietário em Authentication > Users.
3. Cadastre o `user_id` autorizado em `loyalty_platform_admins` via ambiente administrativo (nunca direto do navegador).
4. Depois cadastre as primeiras empresas e vínculos de operador/gestor.
5. Para consumidor, habilite/verifique telefone pelo Supabase Auth antes de vincular ao cadastro; sem SMS, **não habilite primeiro acesso**.
6. Sirva esta pasta por HTTP em ambiente de homologação; os arquivos `previews/` continuam disponíveis para apresentação com dados fictícios.

## Valores e limites
A cotação do novo projeto foi US$0/mês, sujeita às condições do plano Supabase. Não foi configurado gateway, WhatsApp, primeira empresa, cliente real ou dado migrado. Relatórios podem apresentar 0/— até haver compras reais. Compra de farmácia bloqueada na função de crédito até avaliação regulatória.

## Segurança e testes
Consultas por RLS, `SECURITY DEFINER` apenas nas RPCs revisadas, e nenhum token `service_role` no navegador. A verificação SQL testou crédito, resgate, operação repetida, isolamento entre duas empresas, bloqueio do atendente nos custos e vínculo de cliente por telefone verificado, tudo em uma transação revertida.
