-- Roda depois de teste_fluxo.sql (dados fictícios)
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;

-- Mariana (Tático) vira Especialista e muda de gestor para a Carla durante a rodada aberta
select pg_temp.como('00000000-0000-0000-0000-000000000001');
insert into public.rodadas (id, nome, tipo, ano) values ('44444444-4444-4444-4444-444444444444', 'Ciclo Avaliativo 2027', 'avaliativo', 2027);
insert into public.rodada_etapas (rodada_id, ordem, codigo, nome, inicio, fim) values ('44444444-4444-4444-4444-444444444444', 1, 'avaliacao', 'Avaliação', current_date, current_date);
insert into public.rodada_formularios (rodada_id, perfil_id, formulario_id)
select '44444444-4444-4444-4444-444444444444', perfil_id, id from public.formularios where tipo_rodada = 'avaliativo';
select 'abrir: ' || public.abrir_rodada('44444444-4444-4444-4444-444444444444')::text;
update public.pessoas set perfil_id = (select id from public.perfis where codigo = 'especialista'),
       gestor_id = (select id from public.pessoas where nome like 'Carla%') where nome like 'Mariana%';
select 'movimentação: ' || public.atualizar_participante((select id from public.pessoas where nome like 'Mariana%'))::text;
reset role;
select 'mariana ' || a.grupo || ' ' || a.status || ' form ' || f.codigo || ' avaliador ' || av.nome
  from public.avaliacoes a join public.formularios f on f.id = a.formulario_id join public.pessoas av on av.id = a.avaliador_id
 where a.rodada_id = '44444444-4444-4444-4444-444444444444' and (a.avaliado_id = (select id from public.pessoas where nome like 'Mariana%')
   or (a.grupo = 'lider' and a.avaliador_id = (select id from public.pessoas where nome like 'Mariana%')))
 order by a.grupo, a.status;
select pg_temp.como('00000000-0000-0000-0000-000000000001');
select 'acompanhamento linhas: ' || count(*) || ' (sem duplicar)' from public.acompanhamento_rodada('44444444-4444-4444-4444-444444444444');

-- Histórico: de/para de faixas
select 'prévia: ' || public.importar_resultados_historicos('Ciclo Avaliativo 2024 (Mindsight)', 2024, $$[
  {"cpf":"993.518.190-19","nome":"Mariana Analista","nota_final":"4,1","faixa":"Acima do esperado"},
  {"cpf":"62819482112","nome":"Rafael Coordenador","nota_final":"3.2","faixa":"Dentro do esperado"},
  {"cpf":"75749118606","nome":"Ex-colaborador","nota_final":"2,1","faixa":"Abaixo do esperado","cargo":"Pedreiro"},
  {"cpf":"12345678900","nome":"CPF errado","nota_final":"3"},
  {"cpf":"93786579741","nome":"João","nota_final":"abc","faixa":"Dentro do esperado"}
]$$::jsonb, $$[{"original":"Acima do esperado","faixa":"Consolidado"},{"original":"Dentro do esperado","faixa":"Desenvolvido"},{"original":"Abaixo do esperado","faixa":"Em desenvolvimento"}]$$::jsonb, false)::text;
select 'gravar: ' || (public.importar_resultados_historicos('Ciclo Avaliativo 2024 (Mindsight)', 2024, $$[
  {"cpf":"993.518.190-19","nome":"Mariana Analista","nota_final":"4,1","faixa":"Acima do esperado"},
  {"cpf":"62819482112","nome":"Rafael Coordenador","nota_final":"3.2","faixa":"Dentro do esperado"},
  {"cpf":"75749118606","nome":"Ex-colaborador","nota_final":"2,1","faixa":"Abaixo do esperado","cargo":"Pedreiro"},
  {"cpf":"12345678900","nome":"CPF errado","nota_final":"3"},
  {"cpf":"93786579741","nome":"João","nota_final":"abc","faixa":"Dentro do esperado"}
]$$::jsonb, $$[{"original":"Acima do esperado","faixa":"Consolidado"},{"original":"Dentro do esperado","faixa":"Desenvolvido"},{"original":"Abaixo do esperado","faixa":"Em desenvolvimento"}]$$::jsonb, true) - 'erros' - 'faixas')::text;
reset role;
select 'hist ' || p.nome || ' ' || r.nota_final || ' ' || r.faixa_nome || ' ativo=' || p.ativo
  from public.resultados r join public.rodadas ro on ro.id = r.rodada_id join public.pessoas p on p.id = r.pessoa_id
 where ro.somente_leitura order by p.nome;
select pg_temp.como('00000000-0000-0000-0000-000000000005');
select 'mariana vê histórico: ' || count(*) from public.resultados r join public.rodadas ro on ro.id = r.rodada_id where ro.somente_leitura;
reset role;
