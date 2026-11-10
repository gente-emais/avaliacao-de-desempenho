-- =====================================================================
-- EMAIS Desempenho · Remove os DADOS FICTÍCIOS de teste (rodar antes de usar com pessoas reais)
-- Supabase > SQL Editor > colar tudo > Run.
-- Remove: as 3 rodadas de teste, as 26 pessoas @emais-ficticio.com.br, PDI e One a One de teste.
-- O login de teste (gente2@emais.com) é mantido; apague-o em Authentication > Users se quiser.
-- =====================================================================
begin;

create temp table _ficticias as
  select id from public.pessoas where email like '%@emais-ficticio.com.br' or email = 'gente2@emais.com';

delete from public.encontros where gestor_id in (select id from _ficticias) or liderado_id in (select id from _ficticias);
delete from public.pdi_objetivos where pessoa_id in (select id from _ficticias);
delete from public.rodadas where id in ('a0000000-0000-0000-0000-000000002025',
                                        'a0000000-0000-0000-0000-000000012026',
                                        'a0000000-0000-0000-0000-000000022026');
delete from public.notificacoes where destinatario_id in (select id from _ficticias);
update public.pessoas set gestor_id = null, gestor_secundario_id = null, bp_id = null
 where id in (select id from _ficticias) or gestor_id in (select id from _ficticias);
update public.pessoas set perfil_id = null, cargo = 'Login de teste' where email = 'gente2@emais.com';
delete from public.pessoas where email like '%@emais-ficticio.com.br';
drop table if exists public._sim;

commit;
