-- Devolutiva completa da avaliação que o time faz do gestor (Meu resultado):
-- por pergunta, quantas respostas em cada opção e os comentários, sem identificar quem respondeu.
-- Só aparece com 3 respostas ou mais.
create or replace function public.resultado_como_lider_detalhe(p_rodada uuid, p_gestor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  alvo uuid := coalesce(p_gestor, public.eu());
  n int;
begin
  if not (public.eh_admin() or (alvo = public.eu() and exists (
      select 1 from public.rodadas where id = p_rodada and resultado_liberado_em is not null))) then
    raise exception 'Resultado ainda não liberado';
  end if;
  select count(*) into n from public.avaliacoes a
   where a.rodada_id = p_rodada and a.grupo = 'lider' and a.avaliado_id = alvo and a.status = 'concluida';
  if n < 3 then
    return jsonb_build_object('respondentes', n, 'perguntas', '[]'::jsonb);
  end if;

  return jsonb_build_object('respondentes', n, 'perguntas', coalesce((
    select jsonb_agg(q order by q_ordem)
      from (
        select p.ordem as q_ordem, jsonb_build_object(
          'texto', p.texto, 'tipo', p.tipo,
          'opcoes', (select coalesce(jsonb_agg(jsonb_build_object('rotulo', eo.rotulo, 'valor', eo.valor,
                        'n', (select count(*) from public.respostas r join public.avaliacoes a on a.id = r.avaliacao_id
                               where r.pergunta_id = p.id and r.valor = eo.valor and a.rodada_id = p_rodada
                                 and a.grupo = 'lider' and a.avaliado_id = alvo and a.status = 'concluida')) order by eo.ordem desc), '[]'::jsonb)
                       from public.escala_opcoes eo where eo.escala_id = p.escala_id),
          'textos', (select coalesce(jsonb_agg(t order by md5(t)), '[]'::jsonb) from (   -- ordem embaralhada, não a de envio
                       select btrim(coalesce(r.texto, r.opcao)) as t
                         from public.respostas r join public.avaliacoes a on a.id = r.avaliacao_id
                        where r.pergunta_id = p.id and a.rodada_id = p_rodada and a.grupo = 'lider'
                          and a.avaliado_id = alvo and a.status = 'concluida'
                          and p.tipo <> 'escala' and coalesce(btrim(coalesce(r.texto, r.opcao)), '') <> '') x)
        ) as q
          from public.perguntas p
         where p.ativa and p.id in (
           select r.pergunta_id from public.respostas r join public.avaliacoes a on a.id = r.avaliacao_id
            where a.rodada_id = p_rodada and a.grupo = 'lider' and a.avaliado_id = alvo and a.status = 'concluida')
      ) s), '[]'::jsonb));
end $$;

grant execute on function public.resultado_como_lider_detalhe(uuid, uuid) to authenticated;
