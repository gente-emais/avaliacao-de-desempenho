-- Painel estratégico da AVD (Visão RH).
-- Devolve os dados de base do ano; o site calcula os indicadores e o detalhamento de cada cartão.
-- Só RH (admin ou BP). A avaliação do gestor pelo time sai agregada (mínimo de 3 respostas).
create or replace function public.painel_estrategico(p_ano int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.eh_rh() then raise exception 'Apenas o RH acessa o painel estratégico'; end if;

  with rod as (   -- a rodada mais recente de cada tipo no ano (não histórica)
    select distinct on (r.tipo) r.id, r.tipo, r.nome, r.status, r.resultado_liberado_em
      from public.rodadas r
     where r.ano = p_ano and r.status in ('aberta', 'encerrada')
     order by r.tipo, r.criado_em desc
  ), av as (
    select a.id, rod.tipo, a.grupo, a.status, a.avaliado_id, a.avaliador_id,
           exists (select 1 from public.aceites ac where ac.avaliacao_id = a.id) as aceite
      from public.avaliacoes a join rod on rod.id = a.rodada_id
     where a.status <> 'cancelada'
  ), fb as (      -- respostas do colaborador no Ciclo de Feedback
    select a.avaliado_id,
           max(re.opcao) filter (where p.opcoes ? 'Recebi o feedback dentro do prazo') as prazo,
           max(re.opcao) filter (where p.opcoes ? 'Concordo totalmente') as concorda
      from av a
      join public.respostas re on re.avaliacao_id = a.id
      join public.perguntas p on p.id = re.pergunta_id
     where a.tipo = 'feedback' and a.grupo = 'auto' and a.status = 'concluida'
     group by a.avaliado_id
  ), lid as (     -- índice de liderança: média das respostas do time sobre o gestor
    select a.avaliado_id as gestor_id, count(distinct a.id) as respondentes, round(avg(re.valor), 2) as media
      from av a join public.respostas re on re.avaliacao_id = a.id
     where a.tipo = 'avaliativo' and a.grupo = 'lider' and a.status = 'concluida' and re.valor is not null
     group by a.avaliado_id
  ), res as (     -- resultados de todos os anos (inclui históricos), a rodada mais recente de cada ano
    select distinct on (r.ano, x.pessoa_id) r.ano, x.pessoa_id, x.faixa_nome as faixa, x.nota_final as nota, x.nota_autoavaliacao as auto,
           (r.resultado_liberado_em is not null) as liberado
      from public.resultados x join public.rodadas r on r.id = x.rodada_id
     where r.tipo = 'avaliativo'
     order by r.ano, x.pessoa_id, r.criado_em desc
  )
  select jsonb_build_object(
    'ano', p_ano,
    'rodadas', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'tipo', tipo, 'nome', nome, 'status', status, 'liberado', resultado_liberado_em is not null)) from rod), '[]'),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'area', p.area, 'cargo', p.cargo, 'gestor_id', p.gestor_id, 'perfil', pf.nome))
        from public.pessoas p left join public.perfis pf on pf.id = p.perfil_id
       where p.ativo and p.perfil_id is not null), '[]'),
    'avaliacoes', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'grupo', grupo, 'status', status,
        'avaliado', avaliado_id, 'avaliador', avaliador_id, 'aceite', aceite)) from av), '[]'),
    'feedback', coalesce((select jsonb_agg(jsonb_build_object('pessoa', avaliado_id, 'prazo', prazo, 'concorda', concorda)) from fb), '[]'),
    'lideranca', coalesce((select jsonb_agg(jsonb_build_object('gestor', gestor_id, 'respondentes', respondentes,
        'media', case when respondentes >= 3 then media end)) from lid), '[]'),
    'resultados', coalesce((select jsonb_agg(jsonb_build_object('ano', ano, 'pessoa', pessoa_id, 'faixa', faixa, 'nota', nota, 'auto', auto, 'liberado', liberado)) from res), '[]'),
    'faixas', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'minimo', minimo, 'maximo', maximo) order by ordem)
        from public.faixas_classificacao where rodada_id is null), '[]'),
    'encontros', coalesce((select jsonb_agg(jsonb_build_object('gestor', gestor_id, 'liderado', liderado_id, 'data', data))
        from public.encontros where data >= current_date - 365), '[]'),
    'combinados', coalesce((select jsonb_agg(jsonb_build_object('responsavel', c.responsavel_id, 'prazo', c.prazo, 'status', c.status))
        from public.encontro_combinados c where c.status = 'aberto'), '[]'),
    'pdi', coalesce((select jsonb_agg(jsonb_build_object('pessoa', pessoa_id, 'status', status, 'horas', carga_horaria, 'fim', fim))
        from public.pdi_objetivos where ano = p_ano), '[]'),
    'anos', coalesce((select jsonb_agg(distinct ano order by ano desc) from public.rodadas where status <> 'rascunho'), '[]')
  ) into v;
  return v;
end $$;

grant execute on function public.painel_estrategico(int) to authenticated;
