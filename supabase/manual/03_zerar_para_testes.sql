-- =====================================================================
-- EMAIS Desempenho · ZERA a base para começar os testes do zero.
-- Apaga: todas as rodadas e ciclos (avaliações, respostas, aceites, resultados, históricos importados),
-- PDI, One a One, importações, notificações, auditoria e todos os colaboradores (e seus logins),
-- MENOS o login do RH (gente2@emais.com), que fica como administrador sem perfil de avaliação.
-- Mantém: perfis, competências, escalas, blocos, perguntas, formulários e as faixas padrão.
-- =====================================================================
begin;

delete from public.respostas;
delete from public.aceites;
delete from public.revisoes;
delete from public.resultados;
delete from public.avaliacoes;
delete from public.indicacoes;
delete from public.rodada_participantes;
delete from public.rodada_formularios;
delete from public.rodada_etapas;
delete from public.faixas_classificacao where rodada_id is not null;
delete from public.notificacoes;
delete from public.rodadas;

delete from public.diario_usos;
delete from public.diario_comentarios;
delete from public.diario_registros;
delete from public.pdi_comentarios;
delete from public.pdi_tarefas;
delete from public.encontro_combinados;
delete from public.encontro_notas_privadas;
delete from public.encontros;
delete from public.pdi_objetivos;

delete from public.importacao_linhas;
delete from public.importacao_staging;
delete from public.importacoes;
delete from public.auditoria;

update public.pessoas set gestor_id = null, gestor_secundario_id = null, bp_id = null;
update public.pessoas set perfil_id = null, cargo = 'RH (login de teste)', area = 'Gente e Gestão', ativo = true
 where email = 'gente2@emais.com';

create temp table _logins as
  select user_id from public.pessoas where email is distinct from 'gente2@emais.com' and user_id is not null;
delete from public.pessoas where email is distinct from 'gente2@emais.com';
delete from auth.identities where user_id in (select user_id from _logins);
delete from auth.users where id in (select user_id from _logins);

commit;
