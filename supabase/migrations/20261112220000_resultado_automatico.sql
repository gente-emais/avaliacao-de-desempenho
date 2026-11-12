-- Resultado do Ciclo Avaliativo atualizado sozinho: quando o gestor envia (ou a autoavaliação é enviada,
-- ou o gestor acima revisa), a nota e a faixa daquela pessoa são recalculadas na hora.
-- Assim o RH vê o resultado em Resultados sem precisar clicar em "Recalcular notas".
create or replace function public.recalcular_resultado_pessoa(p_rodada uuid, p_pessoa uuid)
returns void language sql security definer set search_path = '' as $$
  with notas as (
    select rp.pessoa_id,
           public.nota_da_avaliacao(ag.id) as calculada,
           (select rv.nota_ajustada from public.revisoes rv where rv.avaliacao_id = ag.id order by rv.criado_em desc limit 1) as revisada,
           public.nota_da_avaliacao(aa.id, false) as auto
      from public.rodada_participantes rp
      join public.rodadas r on r.id = rp.rodada_id and r.tipo = 'avaliativo'
      join public.avaliacoes ag on ag.rodada_id = rp.rodada_id and ag.avaliado_id = rp.pessoa_id
                                and ag.grupo = 'gestor' and ag.status in ('enviada', 'concluida')
      left join public.avaliacoes aa on aa.rodada_id = rp.rodada_id and aa.avaliado_id = rp.pessoa_id and aa.grupo = 'auto'
     where rp.rodada_id = p_rodada and rp.pessoa_id = p_pessoa
  ), finais as (
    select n.*, coalesce(n.revisada, n.calculada) as final from notas n
  )
  insert into public.resultados (rodada_id, pessoa_id, nota_calculada, nota_final, faixa_id, faixa_nome, nota_autoavaliacao, calculado_em)
  select p_rodada, f.pessoa_id, f.calculada, f.final, fx.id, fx.nome, f.auto, now()
    from finais f
    left join public.faixas_classificacao fx
      on fx.rodada_id = p_rodada and round(f.final, 2) between fx.minimo and fx.maximo
  on conflict (rodada_id, pessoa_id) do update
     set nota_calculada = excluded.nota_calculada, nota_final = excluded.nota_final,
         faixa_id = excluded.faixa_id, faixa_nome = excluded.faixa_nome,
         nota_autoavaliacao = excluded.nota_autoavaliacao, calculado_em = now();
$$;

create or replace function public.tg_resultado_automatico()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a public.avaliacoes;
begin
  if tg_table_name = 'revisoes' then
    select * into a from public.avaliacoes where id = new.avaliacao_id;
  else
    a := new;
    if new.status is not distinct from old.status or new.status not in ('enviada', 'concluida') then return new; end if;
  end if;
  if a.grupo in ('gestor', 'auto') then
    perform public.recalcular_resultado_pessoa(a.rodada_id, a.avaliado_id);
  end if;
  return new;
end $$;

create trigger resultado_automatico after update of status on public.avaliacoes
  for each row execute function public.tg_resultado_automatico();
create trigger resultado_automatico after insert on public.revisoes
  for each row execute function public.tg_resultado_automatico();
