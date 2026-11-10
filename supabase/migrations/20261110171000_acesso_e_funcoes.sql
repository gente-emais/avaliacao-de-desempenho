-- =====================================================================
-- EMAIS Desempenho · 02 · Regras de acesso (RLS) e funções
-- =====================================================================

-- ---------- CPF ----------
alter table public.pessoas
  add column cpf_mascarado text generated always as
    ('***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**') stored;

create or replace function public.cpf_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- "Resposta desenvolvida": não basta um ponto ou uma letra.
create or replace function public.texto_desenvolvido(p text, min_caracteres int default 30, min_palavras int default 5)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(coalesce(p, ''));
  palavras int;
  letras text;
begin
  if length(t) < min_caracteres then return false; end if;
  select count(*) into palavras
    from regexp_split_to_table(t, '\s+') w
   where w ~ '[[:alpha:]]{2,}';
  if palavras < min_palavras then return false; end if;
  letras := lower(regexp_replace(t, '[^[:alpha:]]', '', 'g'));
  -- recusa "aaaaaaa", "kkkkkk", "asasasas"
  if (select count(distinct c) from regexp_split_to_table(letras, '') c) < 5 then return false; end if;
  return true;
end $$;

-- ---------- Quem sou eu ----------
create or replace function public.eu()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.pessoas where user_id = auth.uid() and ativo
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select papel = 'admin_rh' from public.pessoas where user_id = auth.uid() and ativo), false)
$$;

create or replace function public.eh_rh()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select papel in ('admin_rh', 'bp_rh') from public.pessoas where user_id = auth.uid() and ativo), false)
$$;

-- gestor direto, gestor secundário ou gestor acima (2 níveis)
create or replace function public.sou_gestor_de(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pessoas x
    left join public.pessoas g on g.id = x.gestor_id
    where x.id = p
      and (x.gestor_id = public.eu() or x.gestor_secundario_id = public.eu() or g.gestor_id = public.eu())
  )
$$;

create or replace function public.sou_bp_de(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_rh() and exists (select 1 from public.pessoas where id = p and bp_id = public.eu())
$$;

create or replace function public.pode_ver_pessoa(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.eh_admin()
      or p = public.eu()
      or public.sou_gestor_de(p)
      or public.sou_bp_de(p)
      or exists (select 1 from public.pessoas where id = public.eu() and (gestor_id = p or gestor_secundario_id = p))
      or exists (select 1 from public.avaliacoes a
                  where (a.avaliador_id = public.eu() and a.avaliado_id = p)
                     or (a.avaliado_id = public.eu() and a.avaliador_id = p and a.grupo in ('gestor')))
$$;

create or replace function public.cpf_completo(p uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador vê o CPF completo'; end if;
  return (select cpf from public.pessoas where id = p);
end $$;

-- ---------- Visibilidade das avaliações ----------
create or replace function public.pode_ver_avaliacao(a_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.avaliacoes a
      join public.rodadas r on r.id = a.rodada_id
      left join public.rodada_participantes rp on rp.rodada_id = a.rodada_id and rp.pessoa_id = a.avaliado_id
      left join public.pessoas g on g.id = rp.gestor_id
     where a.id = a_id
       and (
            public.eh_admin()
         or (public.eh_rh() and rp.bp_id = public.eu())
         or a.avaliador_id = public.eu()
         -- gestor vê a autoavaliação e a resposta de feedback do liderado
         or (a.grupo = 'auto' and (rp.gestor_id = public.eu() or rp.gestor_secundario_id = public.eu()))
         -- gestor acima revisa a avaliação do gestor
         or (a.grupo = 'gestor' and g.gestor_id = public.eu())
         -- gestor secundário acompanha
         or (a.grupo = 'gestor' and rp.gestor_secundario_id = public.eu())
         -- colaborador vê o que o gestor registrou: na hora em Contratação e Feedback,
         -- e no Ciclo Avaliativo só depois de liberado o resultado
         or (a.grupo = 'gestor' and a.avaliado_id = public.eu()
             and a.status in ('enviada', 'concluida')
             and (r.tipo <> 'avaliativo' or r.resultado_liberado_em is not null))
       )
  )
$$;

create or replace function public.pode_editar_avaliacao(a_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.avaliacoes a
      join public.rodadas r on r.id = a.rodada_id
     where a.id = a_id
       and a.avaliador_id = public.eu()
       and a.status in ('pendente', 'em_andamento')
       and r.status = 'aberta'
       and not r.somente_leitura
  )
$$;

-- ---------- Auditoria ----------
create or replace function public.tg_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  reg jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.auditoria (tabela, registro_id, acao, dados, feito_por)
  values (tg_table_name,
          coalesce(reg ->> 'id', reg ->> 'avaliacao_id', '?'),
          lower(tg_op),
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new)) else reg end,
          public.eu());
  return null;
end $$;

create trigger aud_pessoas after insert or update or delete on public.pessoas
  for each row execute function public.tg_auditoria();
create trigger aud_rodada_participantes after insert or update or delete on public.rodada_participantes
  for each row execute function public.tg_auditoria();
create trigger aud_avaliacoes after update of status, avaliador_id on public.avaliacoes
  for each row execute function public.tg_auditoria();
create trigger aud_aceites after insert or delete on public.aceites
  for each row execute function public.tg_auditoria();
create trigger aud_revisoes after insert on public.revisoes
  for each row execute function public.tg_auditoria();
create trigger aud_rodadas after insert or update on public.rodadas
  for each row execute function public.tg_auditoria();

-- Quem salvou cada resposta, e a avaliação passa a "em andamento".
create or replace function public.tg_resposta_autor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_por := public.eu();
  update public.avaliacoes
     set status = 'em_andamento',
         iniciada_em = coalesce(iniciada_em, now()),
         preenchido_por = public.eu()
   where id = new.avaliacao_id and status = 'pendente';
  return new;
end $$;
create trigger respostas_autor before insert or update on public.respostas
  for each row execute function public.tg_resposta_autor();

-- =====================================================================
-- RLS
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'perfis','pessoas','competencias','escalas','escala_opcoes','blocos','perguntas',
    'formularios','formulario_blocos','rodadas','rodada_etapas','rodada_formularios',
    'rodada_participantes','faixas_classificacao','indicacoes','avaliacoes','respostas',
    'aceites','revisoes','resultados','pdi_objetivos','pdi_tarefas','pdi_comentarios',
    'encontros','encontro_notas_privadas','encontro_combinados','auditoria',
    'notificacoes','importacoes','importacao_linhas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Biblioteca e configuração: todos leem, só o RH administrador altera.
do $$
declare t text;
begin
  foreach t in array array[
    'perfis','competencias','escalas','escala_opcoes','blocos','perguntas',
    'formularios','formulario_blocos','rodadas','rodada_etapas','rodada_formularios','faixas_classificacao']
  loop
    execute format('create policy leitura on public.%I for select to authenticated using (true)', t);
    execute format('create policy admin_altera on public.%I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t);
  end loop;
end $$;

-- Pessoas: CPF completo nunca sai pela API (só cpf_mascarado).
revoke select on public.pessoas from authenticated;
grant select (id, cpf_mascarado, nome, email, email_ficticio, cargo, area, perfil_id, gestor_id,
              gestor_secundario_id, bp_id, papel, acesso_assistido, ativo, user_id, criado_em, atualizado_em)
  on public.pessoas to authenticated;
create policy ver on public.pessoas for select to authenticated using (public.pode_ver_pessoa(id));
create policy admin_altera on public.pessoas for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy ver on public.rodada_participantes for select to authenticated using (
  public.eh_admin() or pessoa_id = public.eu() or bp_id = public.eu()
  or gestor_id = public.eu() or gestor_secundario_id = public.eu() or public.sou_gestor_de(pessoa_id)
);
create policy admin_altera on public.rodada_participantes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());
create policy bp_altera on public.rodada_participantes for update to authenticated
  using (public.eh_rh() and bp_id = public.eu()) with check (public.eh_rh() and bp_id = public.eu());

create policy ver on public.indicacoes for select to authenticated using (
  public.eh_admin() or avaliador_id = public.eu() or avaliado_id = public.eu()
  or public.sou_gestor_de(avaliado_id) or public.sou_bp_de(avaliado_id)
);
create policy admin_altera on public.indicacoes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy ver on public.avaliacoes for select to authenticated using (public.pode_ver_avaliacao(id));
create policy admin_altera on public.avaliacoes for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

create policy ver on public.respostas for select to authenticated using (public.pode_ver_avaliacao(avaliacao_id));
create policy grava on public.respostas for insert to authenticated with check (public.pode_editar_avaliacao(avaliacao_id));
create policy altera on public.respostas for update to authenticated
  using (public.pode_editar_avaliacao(avaliacao_id)) with check (public.pode_editar_avaliacao(avaliacao_id));
create policy apaga on public.respostas for delete to authenticated using (public.pode_editar_avaliacao(avaliacao_id));

create policy ver on public.aceites for select to authenticated using (public.pode_ver_avaliacao(avaliacao_id));
create policy ver on public.revisoes for select to authenticated using (
  public.eh_admin() or revisor_id = public.eu()
  or exists (select 1 from public.avaliacoes a where a.id = avaliacao_id and a.avaliador_id = public.eu())
);

create policy ver on public.resultados for select to authenticated using (
  public.eh_admin() or public.sou_bp_de(pessoa_id) or public.sou_gestor_de(pessoa_id)
  or (pessoa_id = public.eu() and exists (select 1 from public.rodadas r where r.id = rodada_id and r.resultado_liberado_em is not null))
);

-- PDI: colaborador, gestores e RH; o gestor pode incluir em nome do liderado.
create policy ver on public.pdi_objetivos for select to authenticated using (
  pessoa_id = public.eu() or public.sou_gestor_de(pessoa_id) or public.eh_admin() or public.sou_bp_de(pessoa_id)
);
create policy altera on public.pdi_objetivos for all to authenticated
  using (pessoa_id = public.eu() or public.sou_gestor_de(pessoa_id))
  with check ((pessoa_id = public.eu() or public.sou_gestor_de(pessoa_id)) and criado_por = public.eu());
create policy ver on public.pdi_tarefas for select to authenticated using (
  exists (select 1 from public.pdi_objetivos o where o.id = objetivo_id)
);
create policy altera on public.pdi_tarefas for all to authenticated using (
  exists (select 1 from public.pdi_objetivos o where o.id = objetivo_id and (o.pessoa_id = public.eu() or public.sou_gestor_de(o.pessoa_id)))
) with check (
  exists (select 1 from public.pdi_objetivos o where o.id = objetivo_id and (o.pessoa_id = public.eu() or public.sou_gestor_de(o.pessoa_id)))
);
create policy ver on public.pdi_comentarios for select to authenticated using (
  exists (select 1 from public.pdi_objetivos o where o.id = objetivo_id)
);
create policy grava on public.pdi_comentarios for insert to authenticated with check (
  autor_id = public.eu() and exists (select 1 from public.pdi_objetivos o where o.id = objetivo_id)
);

-- One a One: RH não vê conteúdo, só indicadores (função própria).
create policy ver on public.encontros for select to authenticated using (gestor_id = public.eu() or liderado_id = public.eu());
create policy altera on public.encontros for all to authenticated
  using (gestor_id = public.eu()) with check (gestor_id = public.eu() and public.sou_gestor_de(liderado_id));
create policy so_autor on public.encontro_notas_privadas for all to authenticated
  using (autor_id = public.eu()) with check (autor_id = public.eu());
create policy ver on public.encontro_combinados for select to authenticated using (
  exists (select 1 from public.encontros e where e.id = encontro_id)
);
create policy gestor_altera on public.encontro_combinados for all to authenticated using (
  exists (select 1 from public.encontros e where e.id = encontro_id and e.gestor_id = public.eu())
) with check (
  exists (select 1 from public.encontros e where e.id = encontro_id and e.gestor_id = public.eu())
);
create policy responsavel_conclui on public.encontro_combinados for update to authenticated
  using (responsavel_id = public.eu()) with check (responsavel_id = public.eu());

create policy admin_ve on public.auditoria for select to authenticated using (public.eh_admin());
create policy admin on public.notificacoes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy admin on public.importacoes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy admin on public.importacao_linhas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- =====================================================================
-- FUNÇÕES DE NEGÓCIO
-- =====================================================================

-- Média das respostas de escala nos blocos de competência de uma avaliação.
-- p_so_nota = true usa só os blocos marcados "entra na nota".
create or replace function public.nota_da_avaliacao(p_avaliacao uuid, p_so_nota boolean default true)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when public.pode_ver_avaliacao(p_avaliacao) or public.pode_editar_avaliacao(p_avaliacao) then (
  select round(avg(r.valor), 2)
    from public.avaliacoes a
    join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
    join public.blocos b on b.id = fb.bloco_id
    join public.perguntas p on p.bloco_id = b.id and p.tipo = 'escala' and p.ativa
    join public.respostas r on r.avaliacao_id = a.id and r.pergunta_id = p.id and r.valor is not null
   where a.id = p_avaliacao
     and (fb.entra_na_nota or (not p_so_nota and b.tipo = 'competencia'))
  ) end
$$;

-- O que falta para enviar (lista vazia = pode enviar).
create or replace function public.pendencias_da_avaliacao(p_avaliacao uuid)
returns table (pergunta_id integer, bloco text, pergunta text, motivo text)
language sql stable security definer set search_path = '' as $$
  with base as (
    select p.*, b.nome as bloco_nome, fb.ordem as bloco_ordem, r.valor, r.opcao, r.texto as resp_texto, r.evidencia,
           mae.opcao as mae_opcao
      from public.avaliacoes a
      join public.formulario_blocos fb on fb.formulario_id = a.formulario_id and fb.grupo = a.grupo
      join public.blocos b on b.id = fb.bloco_id
      join public.perguntas p on p.bloco_id = b.id and p.ativa
      left join public.respostas r on r.avaliacao_id = a.id and r.pergunta_id = p.id
      left join public.respostas mae on mae.avaliacao_id = a.id and mae.pergunta_id = p.pergunta_mae_id
     where a.id = p_avaliacao and public.pode_ver_avaliacao(p_avaliacao)
  ), visiveis as (
    select * from base
     where pergunta_mae_id is null or mae_opcao = condicao_valor
  )
  select id, bloco_nome, texto, motivo from (
    select id, bloco_nome, texto, bloco_ordem, ordem, 'Escolha uma opção' as motivo
      from visiveis where obrigatoria and tipo = 'escala' and valor is null
    union all
    select id, bloco_nome, texto, bloco_ordem, ordem, 'Escolha uma opção'
      from visiveis where obrigatoria and tipo in ('sim_nao', 'escolha') and coalesce(opcao, '') = ''
    union all
    select id, bloco_nome, texto, bloco_ordem, ordem,
           'Escreva uma resposta desenvolvida (mínimo ' || min_caracteres || ' caracteres e ' || min_palavras || ' palavras)'
      from visiveis where obrigatoria and tipo = 'aberta' and not public.texto_desenvolvido(resp_texto, min_caracteres, min_palavras)
    union all
    select id, bloco_nome, texto, bloco_ordem, ordem,
           'Descreva as evidências (mínimo ' || min_caracteres || ' caracteres e ' || min_palavras || ' palavras)'
      from visiveis where pede_evidencia and obrigatoria and not public.texto_desenvolvido(evidencia, min_caracteres, min_palavras)
  ) x
  order by bloco_ordem, ordem
$$;

create or replace function public.enviar_avaliacao(p_avaliacao uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.avaliacoes;
  r public.rodadas;
  faltando jsonb;
  tem_revisor boolean;
  novo_status public.status_avaliacao;
begin
  if not public.pode_editar_avaliacao(p_avaliacao) then
    raise exception 'Você não pode enviar esta avaliação';
  end if;
  select * into a from public.avaliacoes where id = p_avaliacao;
  select * into r from public.rodadas where id = a.rodada_id;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into faltando
    from public.pendencias_da_avaliacao(p_avaliacao) x;
  if jsonb_array_length(faltando) > 0 then
    return jsonb_build_object('ok', false, 'faltando', faltando);
  end if;

  -- No Ciclo Avaliativo, a avaliação do gestor vai para revisão do gestor acima.
  select exists (
    select 1 from public.rodada_participantes rp
      join public.pessoas g on g.id = rp.gestor_id
     where rp.rodada_id = a.rodada_id and rp.pessoa_id = a.avaliado_id and g.gestor_id is not null
  ) into tem_revisor;

  novo_status := case when r.tipo = 'avaliativo' and a.grupo = 'gestor' and tem_revisor
                      then 'enviada' else 'concluida' end;

  update public.avaliacoes
     set status = novo_status,
         enviada_em = now(),
         concluida_em = case when novo_status = 'concluida' then now() end,
         preenchido_por = public.eu()
   where id = p_avaliacao;

  return jsonb_build_object('ok', true, 'status', novo_status);
end $$;

-- Gestor acima confirma ou ajusta a nota. A original fica registrada.
create or replace function public.revisar_avaliacao(p_avaliacao uuid, p_nota_ajustada numeric default null, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.avaliacoes;
  original numeric;
begin
  select * into a from public.avaliacoes where id = p_avaliacao;
  if a.id is null or a.grupo <> 'gestor' or a.status <> 'enviada' then
    raise exception 'Avaliação não está aguardando revisão';
  end if;
  if not exists (select 1 from public.pessoas g where g.id = a.avaliador_id and g.gestor_id = public.eu()) then
    raise exception 'Só o gestor acima pode revisar';
  end if;
  original := public.nota_da_avaliacao(p_avaliacao);
  if p_nota_ajustada is not null and (p_nota_ajustada < 0 or p_nota_ajustada > 4) then
    raise exception 'Nota fora da escala (0 a 4)';
  end if;
  insert into public.revisoes (avaliacao_id, revisor_id, nota_original, nota_ajustada, comentario)
  values (p_avaliacao, public.eu(), original, coalesce(round(p_nota_ajustada, 2), original), p_comentario);
  update public.avaliacoes set status = 'concluida', concluida_em = now() where id = p_avaliacao;
  return jsonb_build_object('ok', true, 'nota_original', original, 'nota_final', coalesce(round(p_nota_ajustada, 2), original));
end $$;

-- Aceite da Contratação. No Operacional Obras o gestor marca pelo liderado.
create or replace function public.dar_aceite(p_avaliacao uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.avaliacoes;
  r public.rodadas;
  rp public.rodada_participantes;
  pelo_gestor boolean := false;
begin
  select * into a from public.avaliacoes where id = p_avaliacao;
  select * into r from public.rodadas where id = a.rodada_id;
  select * into rp from public.rodada_participantes where rodada_id = a.rodada_id and pessoa_id = a.avaliado_id;
  if r.tipo <> 'contratacao' or a.grupo <> 'gestor' then raise exception 'Aceite só existe na Contratação'; end if;
  if a.status <> 'concluida' then raise exception 'O gestor ainda não enviou a contratação'; end if;
  if a.avaliado_id = public.eu() then
    pelo_gestor := false;
  elsif rp.acesso_assistido and rp.gestor_id = public.eu() then
    pelo_gestor := true;
  else
    raise exception 'Você não pode dar aceite nesta contratação';
  end if;
  insert into public.aceites (avaliacao_id, marcado_por, em_nome_de)
  values (p_avaliacao, public.eu(), pelo_gestor)
  on conflict (avaliacao_id) do nothing;
  return jsonb_build_object('ok', true, 'em_nome_de', pelo_gestor);
end $$;

-- Participantes aprovados da rodada e o formulário de cada um.
create or replace function public.participantes_da_rodada(p_rodada uuid)
returns table (pessoa_id uuid, perfil_id smallint, gestor_id uuid, acesso_assistido boolean, formulario_id integer)
language sql stable security definer set search_path = '' as $$
  select rp.pessoa_id, rp.perfil_id, rp.gestor_id, rp.acesso_assistido,
         coalesce(
           (select rf.formulario_id from public.rodada_formularios rf where rf.rodada_id = p_rodada and rf.perfil_id = rp.perfil_id),
           (select rf.formulario_id from public.rodada_formularios rf where rf.rodada_id = p_rodada and rf.perfil_id is null))
    from public.rodada_participantes rp
   where rp.rodada_id = p_rodada and rp.aprovado and public.eh_admin()
$$;

-- Abre a rodada: tira a foto das pessoas e gera quem avalia quem.
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
  select p_rodada, p.id, p.nome, p.cargo, p.area, p.perfil_id, p.gestor_id, p.gestor_secundario_id, p.bp_id,
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

-- Calcula nota final e faixa de cada participante (Ciclo Avaliativo).
create or replace function public.calcular_resultados(p_rodada uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare qtd int;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador calcula resultados'; end if;

  with notas as (
    select rp.pessoa_id,
           public.nota_da_avaliacao(ag.id) as calculada,
           (select rv.nota_ajustada from public.revisoes rv where rv.avaliacao_id = ag.id order by rv.criado_em desc limit 1) as revisada,
           public.nota_da_avaliacao(aa.id, false) as auto
      from public.rodada_participantes rp
      join public.avaliacoes ag on ag.rodada_id = rp.rodada_id and ag.avaliado_id = rp.pessoa_id
                                and ag.grupo = 'gestor' and ag.status = 'concluida'
      left join public.avaliacoes aa on aa.rodada_id = rp.rodada_id and aa.avaliado_id = rp.pessoa_id and aa.grupo = 'auto'
     where rp.rodada_id = p_rodada
  ), finais as (
    select n.*, coalesce(n.revisada, n.calculada) as final from notas n
  )
  insert into public.resultados (rodada_id, pessoa_id, nota_calculada, nota_final, faixa_id, faixa_nome, nota_autoavaliacao, calculado_em)
  select p_rodada, f.pessoa_id, f.calculada, f.final, fx.id, fx.nome, f.auto, now()
    from finais f
    left join public.faixas_classificacao fx
      on fx.rodada_id = p_rodada and f.final between fx.minimo and fx.maximo
  on conflict (rodada_id, pessoa_id) do update
     set nota_calculada = excluded.nota_calculada,
         nota_final = excluded.nota_final,
         faixa_id = excluded.faixa_id,
         faixa_nome = excluded.faixa_nome,
         nota_autoavaliacao = excluded.nota_autoavaliacao,
         calculado_em = now();
  get diagnostics qtd = row_count;
  return jsonb_build_object('ok', true, 'calculados', qtd);
end $$;

create or replace function public.liberar_resultados(p_rodada uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador libera resultados'; end if;
  perform public.calcular_resultados(p_rodada);
  update public.rodadas set resultado_liberado_em = now() where id = p_rodada;
  return jsonb_build_object('ok', true);
end $$;

-- Painel de acompanhamento: situação de cada participante por grupo.
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
    left join public.avaliacoes ag on ag.rodada_id = rp.rodada_id and ag.avaliado_id = rp.pessoa_id and ag.grupo = 'gestor'
    left join public.avaliacoes aa on aa.rodada_id = rp.rodada_id and aa.avaliado_id = rp.pessoa_id and aa.grupo = 'auto'
    left join public.avaliacoes al on al.rodada_id = rp.rodada_id and al.avaliador_id = rp.pessoa_id and al.grupo = 'lider'
   where rp.rodada_id = p_rodada
     and (public.eh_admin() or (public.eh_rh() and rp.bp_id = public.eu()))
   order by rp.nome
$$;

-- Avaliação do líder: só médias agregadas, nunca quem respondeu.
create or replace function public.resultado_como_lider(p_rodada uuid, p_gestor uuid default null)
returns table (pergunta text, ordem smallint, media numeric, respondentes int)
language plpgsql stable security definer set search_path = '' as $$
declare alvo uuid := coalesce(p_gestor, public.eu());
begin
  if not (public.eh_admin() or (alvo = public.eu() and exists (
      select 1 from public.rodadas where id = p_rodada and resultado_liberado_em is not null))) then
    raise exception 'Resultado ainda não liberado';
  end if;
  return query
  select p.texto, p.ordem, round(avg(r.valor), 2), count(distinct a.id)::int
    from public.avaliacoes a
    join public.respostas r on r.avaliacao_id = a.id
    join public.perguntas p on p.id = r.pergunta_id and p.tipo = 'escala'
   where a.rodada_id = p_rodada and a.grupo = 'lider' and a.avaliado_id = alvo and a.status = 'concluida'
   group by p.texto, p.ordem
  having count(distinct a.id) >= 3   -- mínimo de 3 respostas para preservar o anonimato
   order by p.ordem;
end $$;

-- Indicadores de One a One para o RH (sem conteúdo dos encontros).
create or replace function public.indicadores_one_a_one(p_inicio date, p_fim date)
returns table (gestor_id uuid, gestor text, mes date, encontros int, liderados_atendidos int)
language sql stable security definer set search_path = '' as $$
  select e.gestor_id, g.nome, date_trunc('month', e.data)::date, count(*)::int, count(distinct e.liderado_id)::int
    from public.encontros e
    join public.pessoas g on g.id = e.gestor_id
   where e.data between p_inicio and p_fim
     and (public.eh_admin() or public.sou_bp_de(e.gestor_id))
   group by 1, 2, 3
   order by 3, 2
$$;

-- ---------- Importação da planilha de pessoas ----------
-- Área de trabalho da importação (uma linha por linha da planilha).
create table public.importacao_staging (
  importacao_id uuid not null references public.importacoes(id) on delete cascade,
  linha int not null,
  cpf text, nome text, email text, email_ficticio boolean, cargo text, area text,
  perfil_id smallint, cpf_gestor text, cpf_gestor2 text, cpf_bp text, acesso_assistido boolean,
  papel public.papel_acesso, situacao text, mensagem text,
  primary key (importacao_id, linha)
);
alter table public.importacao_staging enable row level security;
create policy admin on public.importacao_staging for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- p_linhas: [{cpf, nome, email, cargo, area, cpf_gestor, cpf_gestor_secundario, cpf_bp, perfil, acesso_assistido, papel}]
create or replace function public.importar_pessoas(
  p_linhas jsonb,
  p_arquivo text default null,
  p_confirmar boolean default false,
  p_inativar_ausentes boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  imp uuid;
  lidas int := 0; ok int := 0; rejeitadas int := 0;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador importa pessoas'; end if;

  insert into public.importacoes (arquivo_nome, criado_por) values (p_arquivo, public.eu()) returning id into imp;

  -- 1. Normaliza cada linha
  insert into public.importacao_staging
    (importacao_id, linha, cpf, nome, email, email_ficticio, cargo, area, perfil_id,
     cpf_gestor, cpf_gestor2, cpf_bp, acesso_assistido, papel, situacao, mensagem)
  select imp, n::int, x.cpf, x.nome, x.email,
         x.email is null or x.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
           or x.email ~ '(ficticio|fictício|teste|sememail|naotem|nao_tem|semmail|example\.)',
         x.cargo, x.area, pf.id, x.cpf_gestor, x.cpf_gestor2, x.cpf_bp,
         x.assistido or coalesce(pf.acesso_assistido, false),
         x.papel, null,
         nullif(concat_ws('; ',
           case when not public.cpf_valido(x.cpf) then 'CPF inválido' end,
           case when coalesce(x.nome, '') = '' then 'Nome em branco' end,
           case when pf.id is null then 'Perfil não encontrado: ' || coalesce(nullif(x.perfil, ''), '(vazio)') end,
           case when x.cpf_gestor = x.cpf then 'Gestor igual à própria pessoa' end), '')
    from jsonb_array_elements(p_linhas) with ordinality t(l, n)
    cross join lateral (
      select lpad(regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g'), 11, '0') as cpf,
             nullif(btrim(coalesce(l ->> 'nome', '')), '') as nome,
             nullif(lower(btrim(coalesce(l ->> 'email', ''))), '') as email,
             nullif(btrim(coalesce(l ->> 'cargo', '')), '') as cargo,
             nullif(btrim(coalesce(l ->> 'area', '')), '') as area,
             btrim(coalesce(l ->> 'perfil', '')) as perfil,
             nullif(lpad(regexp_replace(coalesce(l ->> 'cpf_gestor', ''), '\D', '', 'g'), 11, '0'), '00000000000') as cpf_gestor,
             nullif(lpad(regexp_replace(coalesce(l ->> 'cpf_gestor_secundario', ''), '\D', '', 'g'), 11, '0'), '00000000000') as cpf_gestor2,
             nullif(lpad(regexp_replace(coalesce(l ->> 'cpf_bp', ''), '\D', '', 'g'), 11, '0'), '00000000000') as cpf_bp,
             upper(left(btrim(coalesce(l ->> 'acesso_assistido', '')), 1)) = 'S' as assistido,
             nullif(l ->> 'papel', '')::public.papel_acesso as papel
    ) x
    left join public.perfis pf on lower(pf.codigo) = lower(x.perfil) or lower(pf.nome) = lower(x.perfil);
  get diagnostics lidas = row_count;

  update public.importacao_staging set situacao = 'erro' where importacao_id = imp and mensagem is not null;

  -- 2. CPF repetido e gestor inexistente
  update public.importacao_staging s
     set situacao = 'erro', mensagem = concat_ws('; ', s.mensagem, 'CPF repetido na planilha')
   where s.importacao_id = imp
     and s.cpf in (select cpf from public.importacao_staging where importacao_id = imp group by cpf having count(*) > 1);

  update public.importacao_staging s
     set situacao = 'erro', mensagem = concat_ws('; ', s.mensagem, 'CPF do gestor não existe na base nem na planilha')
   where s.importacao_id = imp and s.cpf_gestor is not null
     and not exists (select 1 from public.importacao_staging y where y.importacao_id = imp and y.cpf = s.cpf_gestor)
     and not exists (select 1 from public.pessoas p where p.cpf = s.cpf_gestor and p.ativo);

  -- 3. Novo, alterado ou sem alteração
  update public.importacao_staging s
     set situacao = case
           when p.id is null then 'novo'
           when p.nome is distinct from s.nome or p.email is distinct from s.email or p.cargo is distinct from s.cargo
             or p.area is distinct from s.area or p.perfil_id is distinct from s.perfil_id
             or p.acesso_assistido is distinct from s.acesso_assistido or not p.ativo
             or g.cpf is distinct from s.cpf_gestor then 'alterado'
           else 'sem_alteracao' end
    from public.importacao_staging s2
    left join public.pessoas p on p.cpf = s2.cpf
    left join public.pessoas g on g.id = p.gestor_id
   where s.importacao_id = imp and s2.importacao_id = imp and s2.linha = s.linha and s.situacao is null;

  update public.importacao_staging
     set situacao = 'aviso', mensagem = 'E-mail fictício ou vazio: não receberá avisos nem login'
   where importacao_id = imp and situacao in ('novo', 'alterado', 'sem_alteracao')
     and email_ficticio and not acesso_assistido;

  -- 4. Relatório
  insert into public.importacao_linhas (importacao_id, linha, dados, situacao, mensagem)
  select imp, s.linha,
         to_jsonb(s) - 'importacao_id' - 'situacao' - 'mensagem' - 'linha',
         s.situacao, s.mensagem
    from public.importacao_staging s where s.importacao_id = imp;

  insert into public.importacao_linhas (importacao_id, linha, dados, situacao, mensagem)
  select imp, 0, jsonb_build_object('cpf', p.cpf, 'nome', p.nome), 'inativar', 'Não veio na planilha'
    from public.pessoas p
   where p.ativo and p.papel = 'participante'
     and not exists (select 1 from public.importacao_staging s where s.importacao_id = imp and s.cpf = p.cpf);

  select count(*) into rejeitadas from public.importacao_staging where importacao_id = imp and situacao = 'erro';

  -- 5. Grava
  if p_confirmar then
    insert into public.pessoas (cpf, nome, email, email_ficticio, cargo, area, perfil_id, acesso_assistido, papel, ativo)
    select cpf, nome, email, email_ficticio, cargo, area, perfil_id, acesso_assistido, coalesce(papel, 'participante'), true
      from public.importacao_staging where importacao_id = imp and situacao <> 'erro'
    on conflict (cpf) do update
       set nome = excluded.nome, email = excluded.email, email_ficticio = excluded.email_ficticio,
           cargo = excluded.cargo, area = excluded.area, perfil_id = excluded.perfil_id,
           acesso_assistido = excluded.acesso_assistido, ativo = true,
           papel = case when excluded.papel = 'participante' then public.pessoas.papel else excluded.papel end;
    get diagnostics ok = row_count;

    update public.pessoas p
       set gestor_id = (select id from public.pessoas where cpf = s.cpf_gestor),
           gestor_secundario_id = (select id from public.pessoas where cpf = s.cpf_gestor2),
           bp_id = coalesce((select id from public.pessoas where cpf = s.cpf_bp), p.bp_id)
      from public.importacao_staging s
     where s.importacao_id = imp and s.cpf = p.cpf and s.situacao <> 'erro';

    if p_inativar_ausentes then
      update public.pessoas p set ativo = false
       where p.ativo and p.papel = 'participante'
         and not exists (select 1 from public.importacao_staging s where s.importacao_id = imp and s.cpf = p.cpf);
    end if;

    update public.importacoes set status = 'gravada' where id = imp;
  end if;

  update public.importacoes
     set linhas_lidas = lidas, linhas_gravadas = case when p_confirmar then ok else 0 end, linhas_rejeitadas = rejeitadas
   where id = imp;

  return jsonb_build_object(
    'importacao_id', imp,
    'gravado', p_confirmar,
    'lidas', lidas,
    'rejeitadas', rejeitadas,
    'resumo', (select jsonb_object_agg(situacao, n) from (
                 select situacao, count(*) n from public.importacao_linhas where importacao_id = imp group by situacao) s),
    'linhas', (select coalesce(jsonb_agg(jsonb_build_object(
                 'linha', linha, 'situacao', situacao, 'mensagem', mensagem,
                 'nome', dados ->> 'nome', 'cpf', '***.' || substr(dados ->> 'cpf', 4, 3) || '.' || substr(dados ->> 'cpf', 7, 3) || '-**')
                 order by case situacao when 'erro' then 0 when 'aviso' then 1 when 'inativar' then 2
                                        when 'novo' then 3 when 'alterado' then 4 else 5 end, linha), '[]'::jsonb)
                 from public.importacao_linhas where importacao_id = imp and situacao <> 'sem_alteracao')
  );
end $$;

-- Funções expostas só a quem está logado.
do $$
declare f text;
begin
  foreach f in array array[
    'eu()', 'eh_admin()', 'eh_rh()', 'sou_gestor_de(uuid)', 'sou_bp_de(uuid)', 'pode_ver_pessoa(uuid)',
    'cpf_completo(uuid)', 'pode_ver_avaliacao(uuid)', 'pode_editar_avaliacao(uuid)',
    'nota_da_avaliacao(uuid, boolean)', 'pendencias_da_avaliacao(uuid)', 'enviar_avaliacao(uuid)',
    'revisar_avaliacao(uuid, numeric, text)', 'dar_aceite(uuid)', 'abrir_rodada(uuid)',
    'calcular_resultados(uuid)', 'liberar_resultados(uuid)', 'acompanhamento_rodada(uuid)',
    'resultado_como_lider(uuid, uuid)', 'indicadores_one_a_one(date, date)',
    'importar_pessoas(jsonb, text, boolean, boolean)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
