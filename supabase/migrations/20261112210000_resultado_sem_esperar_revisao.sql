-- A nota entra no resultado assim que o gestor envia a avaliação.
-- A revisão do gestor acima continua possível, mas não trava mais o resultado:
-- se ele ajustar depois, basta recalcular (ou encerrar a rodada de novo).
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
                                and ag.grupo = 'gestor' and ag.status in ('enviada', 'concluida')
      left join public.avaliacoes aa on aa.rodada_id = rp.rodada_id and aa.avaliado_id = rp.pessoa_id and aa.grupo = 'auto'
     where rp.rodada_id = p_rodada
  ), finais as (
    select n.*, coalesce(n.revisada, n.calculada) as final from notas n
  )
  insert into public.resultados (rodada_id, pessoa_id, nota_calculada, nota_final, faixa_id, faixa_nome, nota_autoavaliacao, calculado_em)
  select p_rodada, f.pessoa_id, f.calculada, f.final, fx.id, fx.nome, f.auto, now()
    from finais f
    left join public.faixas_classificacao fx
      on fx.rodada_id = p_rodada and round(f.final, 2) between fx.minimo and fx.maximo
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
