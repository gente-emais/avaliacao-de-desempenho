-- Teste de ponta a ponta com dados FICTÍCIOS. Roda só no Postgres local (nunca em produção).
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/teste_fluxo.sql
\set QUIET on
\pset format unaligned
\pset tuples_only on

-- Usuários de login fictícios
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-000000000001', 'ana@teste.local'),
 ('00000000-0000-0000-0000-000000000002', 'roberto@teste.local'),
 ('00000000-0000-0000-0000-000000000003', 'carla@teste.local'),
 ('00000000-0000-0000-0000-000000000004', 'rafael@teste.local'),
 ('00000000-0000-0000-0000-000000000005', 'mariana@teste.local'),
 ('00000000-0000-0000-0000-000000000006', 'beatriz@teste.local'),
 ('00000000-0000-0000-0000-000000000007', 'patricia@teste.local');

-- Primeiro administrador (feito pelo dono do banco)
insert into public.pessoas (cpf, nome, email, papel, user_id)
values ('52601815906', 'Ana RH', 'ana@teste.local', 'admin_rh', '00000000-0000-0000-0000-000000000001');

create or replace function pg_temp.como(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

-- ===== 1. Importação da planilha =====
select pg_temp.como('00000000-0000-0000-0000-000000000001');
select '1a previa: ' || (r ->> 'lidas') || ' lidas, ' || (r ->> 'rejeitadas') || ' rejeitadas, resumo ' || (r -> 'resumo')::text
from public.importar_pessoas($$[
 {"cpf":"083.016.613-05","nome":"Roberto Diretor","email":"roberto@teste.local","cargo":"Diretor","area":"Diretoria","perfil":"estrategico_diretoria"},
 {"cpf":"99603082430","nome":"Beatriz Diretora","email":"beatriz@teste.local","cargo":"Diretora","area":"Diretoria","perfil":"Estratégico Diretoria"},
 {"cpf":"18609139034","nome":"Carla Gerente","email":"carla@teste.local","cargo":"Gerente","area":"Engenharia","perfil":"estrategico_gerencia","cpf_gestor":"08301661305"},
 {"cpf":"62819482112","nome":"Rafael Coordenador","email":"rafael@teste.local","cargo":"Coordenador","area":"Obras","perfil":"lideranca","cpf_gestor":"18609139034"},
 {"cpf":"99351819019","nome":"Mariana Analista","email":"mariana@teste.local","cargo":"Analista","area":"Engenharia","perfil":"tatico","cpf_gestor":"62819482112"},
 {"cpf":"93786579741","nome":"João Encarregado","email":"sememail@emais.com","cargo":"Encarregado","area":"Obras","perfil":"operacional_obras","cpf_gestor":"62819482112"},
 {"cpf":"54323194897","nome":"Patrícia Corretora","email":"patricia@teste.local","cargo":"Corretora","area":"Comercial","perfil":"vendas","cpf_gestor":"18609139034"},
 {"cpf":"12345678900","nome":"CPF Errado","perfil":"tatico"},
 {"cpf":"75749118606","nome":"Gestor Inexistente","perfil":"tatico","cpf_gestor":"25276018987"}
]$$::jsonb, 'teste.xlsx', false) r;

select '1b nada gravado na previa: ' || count(*) from public.pessoas;

select '1c gravado: ' || (r ->> 'rejeitadas') || ' rejeitadas'
from public.importar_pessoas($$[
 {"cpf":"083.016.613-05","nome":"Roberto Diretor","email":"roberto@teste.local","cargo":"Diretor","area":"Diretoria","perfil":"estrategico_diretoria"},
 {"cpf":"99603082430","nome":"Beatriz Diretora","email":"beatriz@teste.local","cargo":"Diretora","area":"Diretoria","perfil":"Estratégico Diretoria"},
 {"cpf":"18609139034","nome":"Carla Gerente","email":"carla@teste.local","cargo":"Gerente","area":"Engenharia","perfil":"estrategico_gerencia","cpf_gestor":"08301661305"},
 {"cpf":"62819482112","nome":"Rafael Coordenador","email":"rafael@teste.local","cargo":"Coordenador","area":"Obras","perfil":"lideranca","cpf_gestor":"18609139034"},
 {"cpf":"99351819019","nome":"Mariana Analista","email":"mariana@teste.local","cargo":"Analista","area":"Engenharia","perfil":"tatico","cpf_gestor":"62819482112"},
 {"cpf":"93786579741","nome":"João Encarregado","email":"sememail@emais.com","cargo":"Encarregado","area":"Obras","perfil":"operacional_obras","cpf_gestor":"62819482112"},
 {"cpf":"54323194897","nome":"Patrícia Corretora","email":"patricia@teste.local","cargo":"Corretora","area":"Comercial","perfil":"vendas","cpf_gestor":"18609139034"}
]$$::jsonb, 'teste.xlsx', true) r;
reset role;

-- vincula logins (no sistema real isso é feito pela função de criar acessos)
update public.pessoas p set user_id = u.id from auth.users u where u.email = p.email and p.user_id is null;
select '1d pessoas: ' || count(*) || ', assistidos: ' || count(*) filter (where acesso_assistido) from public.pessoas;

-- ===== 2. Abrir Ciclo Avaliativo =====
select pg_temp.como('00000000-0000-0000-0000-000000000001');
insert into public.rodadas (id, nome, tipo, ano) values ('11111111-1111-1111-1111-111111111111', 'Ciclo Avaliativo 2026', 'avaliativo', 2026);
insert into public.rodada_etapas (rodada_id, ordem, codigo, nome, inicio, fim) values
 ('11111111-1111-1111-1111-111111111111', 1, 'avaliacao', 'Avaliação', '2026-12-01', '2026-12-19'),
 ('11111111-1111-1111-1111-111111111111', 2, 'resultados', 'Resultados', '2027-01-12', '2027-01-30');
insert into public.rodada_formularios (rodada_id, perfil_id, formulario_id)
select '11111111-1111-1111-1111-111111111111', f.perfil_id, f.id from public.formularios f where f.tipo_rodada = 'avaliativo';
select '2a abrir: ' || public.abrir_rodada('11111111-1111-1111-1111-111111111111')::text;
reset role;
select '2b ' || grupo || ': ' || count(*) from public.avaliacoes group by grupo order by grupo;
select '2c par: ' || string_agg(a.nome || ' avalia ' || b.nome, ' | ')
  from public.avaliacoes v join public.pessoas a on a.id = v.avaliador_id join public.pessoas b on b.id = v.avaliado_id where grupo = 'par';
select '2d lider (não pode ter Obras nem Diretoria): ' || string_agg(a.nome, ', ')
  from public.avaliacoes v join public.pessoas a on a.id = v.avaliador_id where grupo = 'lider';

-- ===== 3. Mariana faz autoavaliação; Rafael avalia a Mariana =====
select pg_temp.como('00000000-0000-0000-0000-000000000005'); -- Mariana
select '3a mariana vê ' || count(*) || ' avaliações (auto + lider)' from public.avaliacoes;
insert into public.respostas (avaliacao_id, pergunta_id, valor, evidencia)
select a.id, p.id, 4, 'Organizei o cronograma das três obras toda semana sem atraso.'
  from public.avaliacoes a
  join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
  join public.perguntas p on p.bloco_id = fb.bloco_id and p.tipo = 'escala'
 where a.grupo = 'auto' and a.avaliado_id = public.eu();
select '3b mariana tenta enviar incompleta: ' || (public.enviar_avaliacao(id) ->> 'ok') || ', faltam ' ||
       jsonb_array_length(public.enviar_avaliacao(id) -> 'faltando')
  from public.avaliacoes where grupo = 'auto' and avaliado_id = public.eu();
-- tentativa de burlar com "."
insert into public.respostas (avaliacao_id, pergunta_id, texto)
select a.id, p.id, '.'
  from public.avaliacoes a join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
  join public.perguntas p on p.bloco_id = fb.bloco_id and p.tipo = 'aberta'
 where a.grupo = 'auto' and a.avaliado_id = public.eu();
insert into public.respostas (avaliacao_id, pergunta_id, opcao)
select a.id, p.id, case when p.tipo = 'sim_nao' then 'Não' else p.opcoes ->> 0 end
  from public.avaliacoes a join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
  join public.perguntas p on p.bloco_id = fb.bloco_id and p.tipo in ('sim_nao','escolha')
 where a.grupo = 'auto' and a.avaliado_id = public.eu();
select '3c com "." nas abertas: ' || (public.enviar_avaliacao(id) -> 'faltando' -> 0 ->> 'motivo')
  from public.avaliacoes where grupo = 'auto' and avaliado_id = public.eu();
update public.respostas set texto = 'Tenho facilidade com planejamento e controle de cronogramas de obra.'
 where avaliacao_id in (select id from public.avaliacoes where grupo = 'auto' and avaliado_id = public.eu());
select '3d envio ok: ' || public.enviar_avaliacao(id)::text
  from public.avaliacoes where grupo = 'auto' and avaliado_id = public.eu();
select '3e mariana NÃO vê a avaliação do gestor antes da liberação: ' || count(*)
  from public.avaliacoes where grupo = 'gestor' and avaliado_id = public.eu();
reset role;

select pg_temp.como('00000000-0000-0000-0000-000000000004'); -- Rafael (gestor)
select '3f rafael vê a autoavaliação da mariana: ' || count(*)
  from public.avaliacoes a join public.pessoas p on p.id = a.avaliado_id where a.grupo = 'auto' and p.nome like 'Mariana%';
select '3g rafael vê respostas da auto: ' || count(*) from public.respostas r join public.avaliacoes a on a.id = r.avaliacao_id where a.grupo = 'auto';
insert into public.respostas (avaliacao_id, pergunta_id, valor, texto, opcao, evidencia)
select a.id, p.id,
       case when p.tipo = 'escala' then case when p.ordem = 1 then 3 else 4 end end,
       case when p.tipo = 'aberta' then 'Cronograma das obras sempre atualizado e confiável para a equipe.' end,
       case when p.tipo = 'sim_nao' then 'Não' when p.tipo = 'escolha' then p.opcoes ->> 0 end,
       case when p.pede_evidencia then 'Atualizou o cronograma das três obras em 46 de 52 semanas.' end
  from public.avaliacoes a
  join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
  join public.perguntas p on p.bloco_id = fb.bloco_id
 where a.grupo = 'gestor' and a.avaliador_id = public.eu() and a.avaliado_id = (select id from public.pessoas where nome like 'Mariana%');
select '3h rafael envia: ' || public.enviar_avaliacao(a.id)::text
  from public.avaliacoes a where a.grupo = 'gestor' and a.avaliador_id = public.eu() and a.avaliado_id = (select id from public.pessoas where nome like 'Mariana%');
select '3i rafael não edita depois de enviar: ' || public.pode_editar_avaliacao(a.id)
  from public.avaliacoes a where a.grupo = 'gestor' and a.avaliador_id = public.eu() and a.avaliado_id = (select id from public.pessoas where nome like 'Mariana%');
-- Obras: Rafael avalia o João (assistido)
insert into public.respostas (avaliacao_id, pergunta_id, valor, evidencia)
select a.id, p.id, 2, 'Precisa reportar os problemas da frente de serviço mais rápido.'
  from public.avaliacoes a join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
  join public.perguntas p on p.bloco_id = fb.bloco_id
 where a.grupo = 'gestor' and a.avaliado_id = (select id from public.pessoas where nome like 'João%');
select '3j joão enviado: ' || public.enviar_avaliacao(a.id)::text
  from public.avaliacoes a where a.grupo = 'gestor' and a.avaliado_id = (select id from public.pessoas where nome like 'João%');
reset role;

-- ===== 4. Carla (gestora acima) revisa a nota da Mariana =====
select pg_temp.como('00000000-0000-0000-0000-000000000003');
select '4a carla revisa: ' || public.revisar_avaliacao(a.id, 3.85, 'Ajuste pela entrega da curva S')::text
  from public.avaliacoes a where a.grupo = 'gestor' and a.avaliado_id = (select id from public.pessoas where nome like 'Mariana%');
select '4b carla revisa joão: ' || public.revisar_avaliacao(a.id)::text
  from public.avaliacoes a where a.grupo = 'gestor' and a.avaliado_id = (select id from public.pessoas where nome like 'João%');
reset role;

-- ===== 5. Resultados =====
select pg_temp.como('00000000-0000-0000-0000-000000000005');
do $$ begin
  perform public.calcular_resultados('11111111-1111-1111-1111-111111111111');
  raise notice '5a FALHA: mariana conseguiu calcular';
exception when others then raise notice '5a ok, mariana bloqueada: %', sqlerrm;
end $$;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000001');
select '5b calcular: ' || public.calcular_resultados('11111111-1111-1111-1111-111111111111')::text;
select '5c ' || p.nome || ' calculada ' || r.nota_calculada || ' final ' || r.nota_final || ' faixa ' || coalesce(r.faixa_nome, '-') || ' auto ' || coalesce(r.nota_autoavaliacao::text, '-')
  from public.resultados r join public.pessoas p on p.id = r.pessoa_id order by p.nome;
select '5d acompanhamento linhas: ' || count(*) from public.acompanhamento_rodada('11111111-1111-1111-1111-111111111111');
reset role;

select pg_temp.como('00000000-0000-0000-0000-000000000005');
select '5e mariana antes de liberar vê resultados: ' || count(*) from public.resultados;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000001');
select '5f liberar: ' || public.liberar_resultados('11111111-1111-1111-1111-111111111111')::text;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000005');
select '5g mariana depois de liberar: ' || count(*) || ' resultado, vê avaliação do gestor: ' ||
       (select count(*) from public.avaliacoes where grupo = 'gestor' and avaliado_id = public.eu()) from public.resultados;
select '5h mariana não vê CPF completo: ' || coalesce((select cpf_mascarado from public.pessoas where id = public.eu()), '?');
reset role;

-- ===== 6. Contratação: aceite do colaborador e do gestor pelo assistido =====
select pg_temp.como('00000000-0000-0000-0000-000000000001');
insert into public.rodadas (id, nome, tipo, ano) values ('22222222-2222-2222-2222-222222222222', 'Contratação 2027', 'contratacao', 2027);
insert into public.rodada_etapas (rodada_id, ordem, codigo, nome, inicio, fim) values
 ('22222222-2222-2222-2222-222222222222', 1, 'preenchimento', 'Preenchimento e aceite', '2027-04-06', '2027-04-30');
insert into public.rodada_formularios (rodada_id, perfil_id, formulario_id)
select '22222222-2222-2222-2222-222222222222', null, id from public.formularios where codigo = 'contratacao';
select '6a abrir contratação: ' || public.abrir_rodada('22222222-2222-2222-2222-222222222222')::text;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000004');
insert into public.respostas (avaliacao_id, pergunta_id, texto)
select a.id, p.id, 'Entregar o cronograma integrado das obras de dois mil e vinte e sete.'
  from public.avaliacoes a join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
  join public.perguntas p on p.bloco_id = fb.bloco_id
 where a.rodada_id = '22222222-2222-2222-2222-222222222222' and a.avaliador_id = public.eu();
select '6b rafael envia contratações: ' || string_agg(public.enviar_avaliacao(a.id) ->> 'status', ',')
  from public.avaliacoes a where a.rodada_id = '22222222-2222-2222-2222-222222222222' and a.avaliador_id = public.eu();
select '6c rafael dá aceite pelo joão: ' || public.dar_aceite(a.id)::text
  from public.avaliacoes a where a.rodada_id = '22222222-2222-2222-2222-222222222222' and a.avaliado_id = (select id from public.pessoas where nome like 'João%');
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000005');
select '6d mariana vê a contratação na hora: ' || count(*) from public.avaliacoes where rodada_id = '22222222-2222-2222-2222-222222222222';
select '6e mariana dá aceite: ' || public.dar_aceite(a.id)::text
  from public.avaliacoes a where a.rodada_id = '22222222-2222-2222-2222-222222222222' and a.avaliado_id = public.eu();
reset role;
select '6f auditoria registrou: ' || count(*) from public.auditoria;

-- ===== 7. One a One: anotação privada só do autor =====
select pg_temp.como('00000000-0000-0000-0000-000000000004');
insert into public.encontros (id, gestor_id, liderado_id, data, pauta)
values ('33333333-3333-3333-3333-333333333333', public.eu(), (select id from public.pessoas where nome like 'Mariana%'), '2026-10-28', 'Cronograma');
insert into public.encontro_notas_privadas (encontro_id, autor_id, texto) values ('33333333-3333-3333-3333-333333333333', public.eu(), 'privado');
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000005');
select '7a mariana vê encontro: ' || count(*) || ', vê nota privada: ' || (select count(*) from public.encontro_notas_privadas) from public.encontros;
reset role;
select pg_temp.como('00000000-0000-0000-0000-000000000001');
select '7b admin RH vê encontro: ' || count(*) || ', indicadores: ' || (select count(*) from public.indicadores_one_a_one('2026-01-01','2026-12-31')) from public.encontros;
reset role;
