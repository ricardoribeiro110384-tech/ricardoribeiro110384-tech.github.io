# Velyo v0.10 — Ativação do primeiro acesso

Ambiente: https://velyo-homologacao.vercel.app
Supabase separado: projeto `lubzabolwkunzsucmwuu`.

## Estado verificado
- Quatro páginas independentes: /cliente/, /balcao/, /admin/ e /plataforma/.
- Sessões de login separadas por portal; perfis e acesso às empresas controlados por RLS.
- Recuperação de senha implementada nas áreas Admin, Balcão e Plataforma.
- **Ainda não existem usuários e Superadministradores autorizados no Supabase.**

## Ajuste de Auth no Supabase
Em Supabase > Authentication > URL Configuration:
- Site URL: `https://velyo-homologacao.vercel.app`
- Redirect URLs: `https://velyo-homologacao.vercel.app/admin/`,
  `https://velyo-homologacao.vercel.app/balcao/`,
  `https://velyo-homologacao.vercel.app/plataforma/`

Evite autorizar URLs com curingas amplos.

## Ativar o Superadministrador
1. Obter do proprietário **o e-mail escolhido por ele**, nunca inferir qual será.
2. Em Authentication > Users, convidar/criar usuário com confirmação por e-mail.
3. Após confirmação, executar no SQL Editor (apenas equipe autorizada):

```sql
insert into public.loyalty_platform_admins (user_id, active)
select id,true from auth.users
where lower(email)=lower('EMAIL_CONFIRMADO_AQUI')
  and email_confirmed_at is not null
on conflict (user_id) do update set active=true;
```

4. Confirmar o usuário vinculado e testar o login em /plataforma/.
5. Depois, cadastrar empresas, administradores e funcionários autorizados.

**Nunca** publicar credenciais secretas, service_role nem senhas no repositório.
A verificação de telefone do Cliente depende de habilitar um provedor de SMS/OTP.

## Escopo
Homologação. Nenhuma empresa real cadastrada, sem cobrança real e sem uso do banco da Drogaria Rocha.
