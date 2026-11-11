-- Status das avaliações (Visão RH): trocar quem preenche e reabrir uma avaliação.

-- Troca o avaliador de uma avaliação ainda não concluída (ex.: o gestor saiu ou mudou).
-- O que já foi respondido fica no formulário para o novo avaliador revisar.
create or replace function public.trocar_avaliador(p_avaliacao uuid, p_novo uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.avaliacoes;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador troca o avaliador'; end if;
  select * into a from public.avaliacoes where id = p_avaliacao;
  if a.id is null then raise exception 'Avaliação não encontrada'; end if;
  if a.status in ('concluida', 'cancelada') then raise exception 'Reabra a avaliação antes de trocar quem preenche'; end if;
  if not exists (select 1 from public.pessoas where id = p_novo and ativo) then raise exception 'Escolha uma pessoa ativa'; end if;
  if a.grupo in ('auto') then raise exception 'A autoavaliação é sempre da própria pessoa'; end if;
  if exists (select 1 from public.avaliacoes where rodada_id = a.rodada_id and grupo = a.grupo
               and avaliado_id = a.avaliado_id and avaliador_id = p_novo and id <> a.id) then
    raise exception 'Essa pessoa já tem essa avaliação na rodada';
  end if;
  update public.avaliacoes
     set avaliador_id = p_novo,
         status = case when status = 'enviada' then 'em_andamento' else status end,
         enviada_em = null
   where id = p_avaliacao;
  return jsonb_build_object('ok', true);
end $$;

-- Reabre uma avaliação enviada ou concluída para correção.
create or replace function public.reabrir_avaliacao(p_avaliacao uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.avaliacoes; r public.rodadas;
begin
  if not public.eh_admin() then raise exception 'Apenas o RH administrador reabre avaliações'; end if;
  select * into a from public.avaliacoes where id = p_avaliacao;
  if a.id is null then raise exception 'Avaliação não encontrada'; end if;
  select * into r from public.rodadas where id = a.rodada_id;
  if r.somente_leitura or r.status <> 'aberta' then raise exception 'Só dá para reabrir em rodada aberta'; end if;
  if a.status not in ('enviada', 'concluida') then raise exception 'A avaliação já está aberta'; end if;
  update public.avaliacoes
     set status = 'em_andamento', enviada_em = null, concluida_em = null
   where id = p_avaliacao;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.trocar_avaliador(uuid, uuid) to authenticated;
grant execute on function public.reabrir_avaliacao(uuid) to authenticated;
