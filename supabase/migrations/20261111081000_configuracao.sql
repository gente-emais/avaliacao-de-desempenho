-- =====================================================================
-- EMAIS Desempenho · 05 · Configuração: movimentação de pessoas e resultados históricos
-- =====================================================================

-- ---------- Movimentação durante a rodada ----------
-- Depois que o RH muda perfil, gestor ou acesso de alguém, atualiza as rodadas abertas:
-- refaz a foto da pessoa, cancela formulários pendentes que não valem mais e cria os novos.
-- Formulários já concluídos não são mexidos.
create or replace function public.atualizar_participante(p_pessoa uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rp record;
  v_form integer;
  v_canceladas int := 0; v_criadas int := 0; n int; v_rodadas int := 0;
  p public.pessoas;
  v_assist boolean;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador atualiza participantes'; end if;
  select * into p from public.pessoas where id = p_pessoa;
  if p.id is null then raise exception 'Pessoa não encontrada'; end if;
  v_assist := p.acesso_assistido or coalesce((select acesso_assistido from public.perfis where id = p.perfil_id), false);

  for rp in
    select x.id, x.rodada_id
      from public.rodada_participantes x
      join public.rodadas r on r.id = x.rodada_id
     where x.pessoa_id = p_pessoa and r.status = 'aberta' and not r.somente_leitura
  loop
    v_rodadas := v_rodadas + 1;

    -- 1. Nova foto da pessoa nesta rodada
    update public.rodada_participantes
       set nome = p.nome, cargo = p.cargo, area = p.area, perfil_id = p.perfil_id, gestor_id = p.gestor_id,
           gestor_secundario_id = p.gestor_secundario_id, bp_id = p.bp_id, acesso_assistido = v_assist
     where id = rp.id;

    v_form := coalesce(
      (select formulario_id from public.rodada_formularios where rodada_id = rp.rodada_id and perfil_id = p.perfil_id),
      (select formulario_id from public.rodada_formularios where rodada_id = rp.rodada_id and perfil_id is null));

    -- 2. Cancela o que não vale mais (só pendentes e em andamento)
    update public.avaliacoes a
       set status = 'cancelada'
     where a.rodada_id = rp.rodada_id
       and a.status in ('pendente', 'em_andamento')
       and (
            (a.avaliado_id = p_pessoa and a.grupo = 'gestor'
               and (a.formulario_id is distinct from v_form or a.avaliador_id is distinct from p.gestor_id))
         or (a.avaliado_id = p_pessoa and a.grupo = 'auto'
               and (a.formulario_id is distinct from v_form or v_assist
                    or not exists (select 1 from public.formulario_blocos fb where fb.formulario_id = v_form and fb.grupo = 'auto')))
         or (a.avaliador_id = p_pessoa and a.grupo = 'lider'
               and (a.formulario_id is distinct from v_form or a.avaliado_id is distinct from p.gestor_id or v_assist
                    or not exists (select 1 from public.formulario_blocos fb where fb.formulario_id = v_form and fb.grupo = 'lider')))
       );
    get diagnostics n = row_count; v_canceladas := v_canceladas + n;

    if v_form is null then continue; end if;

    -- 3. Cria (ou reativa) o que passou a valer
    -- (se o gestor anterior já concluiu, mantém a avaliação dele e não cria outra)
    if p.gestor_id is not null and exists (select 1 from public.formulario_blocos where formulario_id = v_form and grupo = 'gestor')
       and not exists (select 1 from public.avaliacoes where rodada_id = rp.rodada_id and avaliado_id = p_pessoa
                        and grupo = 'gestor' and status in ('enviada', 'concluida')) then
      insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
      values (rp.rodada_id, v_form, 'gestor', p_pessoa, p.gestor_id)
      on conflict (rodada_id, grupo, avaliado_id, avaliador_id) do update
         set formulario_id = excluded.formulario_id, status = 'pendente'
       where public.avaliacoes.status = 'cancelada';
      get diagnostics n = row_count; v_criadas := v_criadas + n;
    end if;
    if not v_assist and exists (select 1 from public.formulario_blocos where formulario_id = v_form and grupo = 'auto') then
      insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
      values (rp.rodada_id, v_form, 'auto', p_pessoa, p_pessoa)
      on conflict (rodada_id, grupo, avaliado_id, avaliador_id) do update
         set formulario_id = excluded.formulario_id, status = 'pendente'
       where public.avaliacoes.status = 'cancelada';
      get diagnostics n = row_count; v_criadas := v_criadas + n;
    end if;
    if not v_assist and p.gestor_id is not null and exists (select 1 from public.formulario_blocos where formulario_id = v_form and grupo = 'lider') then
      insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
      values (rp.rodada_id, v_form, 'lider', p.gestor_id, p_pessoa)
      on conflict (rodada_id, grupo, avaliado_id, avaliador_id) do update
         set formulario_id = excluded.formulario_id, status = 'pendente'
       where public.avaliacoes.status = 'cancelada';
      get diagnostics n = row_count; v_criadas := v_criadas + n;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'rodadas', v_rodadas, 'canceladas', v_canceladas, 'criadas', v_criadas);
end $$;

-- Acompanhamento ignora formulários cancelados
create or replace function public.acompanhamento_rodada(p_rodada uuid)
returns table (
  pessoa_id uuid, nome text, cargo text, area text, perfil text, gestor text, acesso_assistido boolean,
  gestor_status public.status_avaliacao, auto_status public.status_avaliacao,
  lider_status public.status_avaliacao, pares_pendentes int, pendencias int
)
language sql stable security definer set search_path = '' as $$
  select rp.pessoa_id, rp.nome, rp.cargo, rp.area, pf.nome, g.nome, rp.acesso_assistido,
         ag.status, aa.status, al.status,
         (select count(*)::int from public.avaliacoes ap where ap.rodada_id = rp.rodada_id and ap.grupo = 'par'
             and ap.avaliador_id = rp.pessoa_id and ap.status in ('pendente','em_andamento')),
         (select count(*)::int from public.avaliacoes ax where ax.rodada_id = rp.rodada_id
             and ax.status in ('pendente','em_andamento')
             and ((ax.avaliado_id = rp.pessoa_id and ax.grupo in ('gestor','auto')) or (ax.avaliador_id = rp.pessoa_id and ax.grupo in ('lider','par'))))
    from public.rodada_participantes rp
    left join public.perfis pf on pf.id = rp.perfil_id
    left join public.pessoas g on g.id = rp.gestor_id
    left join lateral (select status from public.avaliacoes where rodada_id = rp.rodada_id and avaliado_id = rp.pessoa_id
                        and grupo = 'gestor' and status <> 'cancelada' limit 1) ag on true
    left join lateral (select status from public.avaliacoes where rodada_id = rp.rodada_id and avaliado_id = rp.pessoa_id
                        and grupo = 'auto' and status <> 'cancelada' limit 1) aa on true
    left join lateral (select status from public.avaliacoes where rodada_id = rp.rodada_id and avaliador_id = rp.pessoa_id
                        and grupo = 'lider' and status <> 'cancelada' limit 1) al on true
   where rp.rodada_id = p_rodada
     and (public.eh_admin() or (public.eh_rh() and rp.bp_id = public.eu()))
   order by rp.nome
$$;

-- ---------- Resultados históricos (Mindsight) ----------
-- p_linhas: linhas já com o de/para de COLUNAS aplicado no site:
--   [{cpf, nome, nota_final, faixa, nota_auto, cargo, area}]  (valores como texto)
-- p_faixas: de/para de CLASSIFICAÇÕES: [{"original": "Supera", "faixa": "Consolidado"}]
-- Rodada histórica: somente leitura, resultado já liberado, faixas com os nomes do de/para.
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
           coalesce(mp.faixa, b.faixa_original) as faixa,
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
    select l.*, coalesce(l.erro, case when l.repeticoes > 1 then 'CPF repetido no arquivo' end) as erro_final from linhas l
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
    select b.*, coalesce(mp.faixa, b.faixa_original, 'Sem classificação') as faixa
      from brutas b
      left join mapa mp on mp.original = b.faixa_original
     where public.cpf_valido(b.cpf)
       and (b.nota is not null or b.faixa_original is not null)
       and b.cpf in (select cpf from brutas group by cpf having count(*) = 1)
       and not (b.nota is null and btrim(coalesce((p_linhas -> (b.linha - 1)) ->> 'nota_final', '')) <> '')
  ), ins_faixas as (
    insert into public.faixas_classificacao (rodada_id, nome, minimo, maximo, ordem)
    select v_rodada, faixa, coalesce(min(nota), 0), coalesce(max(nota), 0),
           row_number() over (order by min(nota) nulls last, faixa)
      from validas group by faixa
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

grant execute on function public.atualizar_participante(uuid) to authenticated;
grant execute on function public.importar_resultados_historicos(text, int, jsonb, jsonb, boolean) to authenticated;
