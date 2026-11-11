-- Importação padronizada: toda classificação vira uma faixa do sistema.
-- Sem de/para para um nome da planilha (ou sem coluna de classificação), a faixa sai pela nota, na régua padrão.
create or replace function public.importar_resultados_historicos(
  p_nome text, p_ano int, p_linhas jsonb, p_faixas jsonb default '[]'::jsonb, p_confirmar boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rodada uuid;
  v_resumo jsonb;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador importa resultados'; end if;
  if coalesce(btrim(p_nome), '') = '' then raise exception 'Informe o nome da rodada'; end if;

  with brutas as (
    select n::int as linha,
           lpad(regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g'), 11, '0') as cpf,
           nullif(btrim(coalesce(l ->> 'nome', '')), '') as nome,
           nullif(btrim(coalesce(l ->> 'cargo', '')), '') as cargo,
           nullif(btrim(coalesce(l ->> 'area', '')), '') as area,
           nullif(btrim(coalesce(l ->> 'faixa', '')), '') as faixa_original,
           case when btrim(coalesce(l ->> 'nota_final', '')) ~ '^-?[0-9]+([.,][0-9]+)?$'
                then round(replace(btrim(l ->> 'nota_final'), ',', '.')::numeric, 2) end as nota,
           case when btrim(coalesce(l ->> 'nota_auto', '')) ~ '^-?[0-9]+([.,][0-9]+)?$'
                then round(replace(btrim(l ->> 'nota_auto'), ',', '.')::numeric, 2) end as nota_auto,
           btrim(coalesce(l ->> 'nota_final', '')) as nota_texto
      from jsonb_array_elements(p_linhas) with ordinality t(l, n)
  ), mapa as (
    select btrim(m ->> 'original') as original, nullif(btrim(m ->> 'faixa'), '') as faixa
      from jsonb_array_elements(p_faixas) m
  ), linhas as (
    select b.*,
           coalesce(mp.faixa, (select fp.nome from public.faixas_classificacao fp where fp.rodada_id is null and b.nota between fp.minimo and fp.maximo limit 1), b.faixa_original) as faixa,
           p.id as pessoa_id,
           count(*) over (partition by b.cpf) as repeticoes,
           nullif(concat_ws('; ',
             case when not public.cpf_valido(b.cpf) then 'CPF inválido' end,
             case when b.nota is null and b.nota_texto <> '' then 'Nota não é um número: ' || b.nota_texto end,
             case when b.nota is null and b.faixa_original is null then 'Sem nota e sem classificação' end), '') as erro
      from brutas b
      left join mapa mp on mp.original = b.faixa_original
      left join public.pessoas p on p.cpf = b.cpf
  ), finais as (
    select l.*, coalesce(l.erro, case when l.repeticoes > 1 then 'CPF repetido no arquivo' end) as erro_final,
           (select fp.nome from public.faixas_classificacao fp
             where fp.rodada_id is null and l.nota between fp.minimo and fp.maximo limit 1) as faixa_pela_nota
      from linhas l
  )
  select jsonb_build_object(
    'lidas', count(*),
    'validas', count(*) filter (where erro_final is null),
    'encontradas', count(*) filter (where erro_final is null and pessoa_id is not null),
    'novas', count(*) filter (where erro_final is null and pessoa_id is null),
    'erros', coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'nome', nome, 'erro', erro_final) order by linha)
                      filter (where erro_final is not null), '[]'::jsonb),
    'faixas', (select coalesce(jsonb_agg(jsonb_build_object('faixa', faixa, 'pessoas', qtd, 'menor', menor, 'maior', maior) order by menor nulls last), '[]'::jsonb)
                 from (select faixa, count(*) qtd, min(nota) menor, max(nota) maior from finais where erro_final is null group by faixa) f),
    'divergentes', coalesce(jsonb_agg(jsonb_build_object('linha', linha, 'nome', nome, 'nota', nota, 'faixa', faixa, 'pela_nota', faixa_pela_nota) order by linha)
                      filter (where erro_final is null and faixa_pela_nota is not null
                                and faixa in (select nome from public.faixas_classificacao where rodada_id is null)
                                and faixa <> faixa_pela_nota), '[]'::jsonb),
    'rodada_existente', exists (select 1 from public.rodadas where lower(nome) = lower(btrim(p_nome)))
  ) into v_resumo
  from finais;

  if not p_confirmar then
    return v_resumo || jsonb_build_object('gravado', false);
  end if;
  if (v_resumo ->> 'validas')::int = 0 then raise exception 'Nenhuma linha válida para importar'; end if;
  if (v_resumo ->> 'rodada_existente')::boolean then raise exception 'Já existe uma rodada com esse nome'; end if;

  insert into public.rodadas (nome, tipo, ano, status, somente_leitura, foto_em, resultado_liberado_em, criada_por)
  values (btrim(p_nome), 'avaliativo', p_ano, 'historica', true, now(), now(), public.eu())
  returning id into v_rodada;

  -- Mesmo cálculo da prévia, agora gravando
  with brutas as (
    select n::int as linha,
           lpad(regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g'), 11, '0') as cpf,
           nullif(btrim(coalesce(l ->> 'nome', '')), '') as nome,
           nullif(btrim(coalesce(l ->> 'cargo', '')), '') as cargo,
           nullif(btrim(coalesce(l ->> 'area', '')), '') as area,
           nullif(btrim(coalesce(l ->> 'faixa', '')), '') as faixa_original,
           case when btrim(coalesce(l ->> 'nota_final', '')) ~ '^-?[0-9]+([.,][0-9]+)?$'
                then round(replace(btrim(l ->> 'nota_final'), ',', '.')::numeric, 2) end as nota,
           case when btrim(coalesce(l ->> 'nota_auto', '')) ~ '^-?[0-9]+([.,][0-9]+)?$'
                then round(replace(btrim(l ->> 'nota_auto'), ',', '.')::numeric, 2) end as nota_auto
      from jsonb_array_elements(p_linhas) with ordinality t(l, n)
  ), mapa as (
    select btrim(m ->> 'original') as original, nullif(btrim(m ->> 'faixa'), '') as faixa
      from jsonb_array_elements(p_faixas) m
  ), validas as (
    select b.*, coalesce(mp.faixa, (select fp.nome from public.faixas_classificacao fp where fp.rodada_id is null and b.nota between fp.minimo and fp.maximo limit 1), b.faixa_original, 'Sem classificação') as faixa
      from brutas b
      left join mapa mp on mp.original = b.faixa_original
     where public.cpf_valido(b.cpf)
       and (b.nota is not null or b.faixa_original is not null)
       and b.cpf in (select cpf from brutas group by cpf having count(*) = 1)
       and not (b.nota is null and btrim(coalesce((p_linhas -> (b.linha - 1)) ->> 'nota_final', '')) <> '')
  ), faixas_rodada as (
    select fp.nome, fp.minimo, fp.maximo from public.faixas_classificacao fp where fp.rodada_id is null
    union all
    select v.faixa, coalesce(min(v.nota), 0), coalesce(max(v.nota), 0)
      from validas v
     where v.faixa not in (select nome from public.faixas_classificacao where rodada_id is null)
     group by v.faixa
  ), ins_faixas as (
    insert into public.faixas_classificacao (rodada_id, nome, minimo, maximo, ordem)
    select v_rodada, nome, minimo, maximo, row_number() over (order by minimo, nome)
      from faixas_rodada
    returning id, nome
  ), ins_pessoas as (
    insert into public.pessoas (cpf, nome, cargo, area, ativo)
    select cpf, coalesce(nome, 'Sem nome (CPF ' || substr(cpf, 1, 3) || '...)'), cargo, area, false
      from validas
    on conflict (cpf) do nothing
    returning id, cpf
  ), pessoas_rodada as (
    select v.*, coalesce(ip.id, p.id) as pessoa_id
      from validas v
      left join ins_pessoas ip on ip.cpf = v.cpf
      left join public.pessoas p on p.cpf = v.cpf
  ), ins_part as (
    insert into public.rodada_participantes (rodada_id, pessoa_id, nome, cargo, area, perfil_id, gestor_id)
    select v_rodada, pr.pessoa_id, coalesce(pr.nome, p.nome, 'Sem nome'), coalesce(pr.cargo, p.cargo), coalesce(pr.area, p.area), p.perfil_id, p.gestor_id
      from pessoas_rodada pr left join public.pessoas p on p.id = pr.pessoa_id
    returning pessoa_id
  )
  insert into public.resultados (rodada_id, pessoa_id, nota_calculada, nota_final, faixa_id, faixa_nome, nota_autoavaliacao)
  select v_rodada, pr.pessoa_id, pr.nota, pr.nota, f.id, pr.faixa, pr.nota_auto
    from pessoas_rodada pr
    join ins_faixas f on f.nome = pr.faixa
   where pr.pessoa_id in (select pessoa_id from ins_part);

  return v_resumo || jsonb_build_object('gravado', true, 'rodada_id', v_rodada);
end $$;

grant execute on function public.importar_resultados_historicos(text, int, jsonb, jsonb, boolean) to authenticated;
