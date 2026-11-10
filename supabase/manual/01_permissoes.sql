-- =====================================================================
-- EMAIS Desempenho · Ajuste de permissões (rodar UMA vez no SQL Editor do Supabase)
-- Supabase > SQL Editor > New query > colar tudo > Run.
-- O Supabase pede confirmação manual para estes comandos, por isso não foram aplicados
-- automaticamente. Sem este passo o sistema funciona, mas fica menos protegido.
-- =====================================================================

-- 1. Visitantes sem login (anon) não acessam nenhuma tabela nem função.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke execute on functions from anon, public;

-- 2. Quem está logado chama as funções do sistema (cada uma confere o papel por dentro).
grant execute on all functions in schema public to authenticated;

-- 3. CPF completo nunca sai pela API: só o cpf_mascarado (***.456.789-**).
revoke select on public.pessoas from authenticated;
grant select (id, cpf_mascarado, nome, email, email_ficticio, cargo, area, perfil_id, gestor_id,
              gestor_secundario_id, bp_id, papel, acesso_assistido, ativo, user_id, criado_em, atualizado_em)
  on public.pessoas to authenticated;

-- 4. Funções internas que não devem ser chamadas pelo site.
revoke execute on function public.tg_auditoria() from authenticated;
revoke execute on function public.tg_resposta_autor() from authenticated;
revoke execute on function public.tg_atualizado_em() from authenticated;

-- 5. Remove funções de teste criadas durante a instalação.
drop function if exists public._teste_detector();
drop function if exists public._teste_detector7();
