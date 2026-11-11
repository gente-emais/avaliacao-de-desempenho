-- Abrir rodada: gestor (ou gestor secundário) inativo não entra como avaliador.
create or replace function public.abrir_rodada(p_rodada uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.rodadas;
  qtd_part int; qtd_av int;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador abre rodadas'; end if;
  select * into r from public.rodadas where id = p_rodada for update;
  if r.status <> 'rascunho' then raise exception 'A rodada já foi aberta'; end if;
  if not exists (select 1 from public.rodada_etapas where rodada_id = p_rodada) then
    raise exception 'Informe as datas das etapas antes de abrir';
  end if;

  -- Faixas: copia o modelo padrão se a rodada não tiver as próprias.
  if r.tipo = 'avaliativo' and not exists (select 1 from public.faixas_classificacao where rodada_id = p_rodada) then
    insert into public.faixas_classificacao (rodada_id, nome, minimo, maximo, ordem)
    select p_rodada, nome, minimo, maximo, ordem from public.faixas_classificacao where rodada_id is null;
  end if;

  -- 1. Foto das pessoas
  insert into public.rodada_participantes
    (rodada_id, pessoa_id, nome, cargo, area, perfil_id, gestor_id, gestor_secundario_id, bp_id, acesso_assistido)
  select p_rodada, p.id, p.nome, p.cargo, p.area, p.perfil_id,
         (select g.id from public.pessoas g where g.id = p.gestor_id and g.ativo),          -- gestor inativo não avalia
         (select g.id from public.pessoas g where g.id = p.gestor_secundario_id and g.ativo), p.bp_id,
         p.acesso_assistido or coalesce(pf.acesso_assistido, false)
    from public.pessoas p
    left join public.perfis pf on pf.id = p.perfil_id
   where p.ativo and p.perfil_id is not null
  on conflict (rodada_id, pessoa_id) do nothing;
  get diagnostics qtd_part = row_count;

  -- 2. Formulário de cada participante (função participantes_da_rodada)
  if exists (select 1 from public.participantes_da_rodada(p_rodada) where formulario_id is null) then
    raise exception 'Há perfis sem formulário nesta rodada: %',
      (select string_agg(distinct coalesce(pf.nome, 'sem perfil'), ', ')
         from public.participantes_da_rodada(p_rodada) x left join public.perfis pf on pf.id = x.perfil_id where x.formulario_id is null);
  end if;

  -- 3. Gestor avalia / registra (todas as rodadas)
  insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
  select p_rodada, x.formulario_id, 'gestor', x.pessoa_id, x.gestor_id
    from public.participantes_da_rodada(p_rodada) x
   where x.gestor_id is not null
     and exists (select 1 from public.formulario_blocos fb where fb.formulario_id = x.formulario_id and fb.grupo = 'gestor')
  on conflict do nothing;

  -- 4. Autoavaliação / resposta do colaborador (só quem tem login)
  insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
  select p_rodada, x.formulario_id, 'auto', x.pessoa_id, x.pessoa_id
    from public.participantes_da_rodada(p_rodada) x
   where not x.acesso_assistido
     and exists (select 1 from public.formulario_blocos fb where fb.formulario_id = x.formulario_id and fb.grupo = 'auto')
  on conflict do nothing;

  -- 5. Colaborador avalia o gestor
  insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
  select p_rodada, x.formulario_id, 'lider', x.gestor_id, x.pessoa_id
    from public.participantes_da_rodada(p_rodada) x
   where not x.acesso_assistido and x.gestor_id is not null
     and exists (select 1 from public.formulario_blocos fb where fb.formulario_id = x.formulario_id and fb.grupo = 'lider')
  on conflict do nothing;

  -- 6. Pares: todos do mesmo perfil se avaliam (ex.: Diretoria)
  insert into public.indicacoes (rodada_id, avaliado_id, avaliador_id, grupo, indicado_por)
  select p_rodada, x.pessoa_id, y.pessoa_id, 'par', public.eu()
    from public.participantes_da_rodada(p_rodada) x
    join public.participantes_da_rodada(p_rodada) y on y.perfil_id = x.perfil_id and y.pessoa_id <> x.pessoa_id and not y.acesso_assistido
   where exists (select 1 from public.formulario_blocos fb where fb.formulario_id = x.formulario_id and fb.grupo = 'par')
  on conflict do nothing;

  insert into public.avaliacoes (rodada_id, formulario_id, grupo, avaliado_id, avaliador_id)
  select p_rodada, x.formulario_id, 'par', i.avaliado_id, i.avaliador_id
    from public.indicacoes i
    join public.participantes_da_rodada(p_rodada) x on x.pessoa_id = i.avaliado_id
   where i.rodada_id = p_rodada and i.grupo = 'par' and i.aprovada
  on conflict do nothing;

  select count(*) into qtd_av from public.avaliacoes where rodada_id = p_rodada;

  update public.rodadas set status = 'aberta', foto_em = now() where id = p_rodada;
  update public.rodada_etapas set status = 'aberta'
   where rodada_id = p_rodada and ordem = (select min(ordem) from public.rodada_etapas where rodada_id = p_rodada);

  return jsonb_build_object('ok', true, 'participantes', qtd_part, 'avaliacoes', qtd_av);
end $$;
