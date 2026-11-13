-- 1) One a One: o colaborador atualiza os combinados do encontro dele (situação e andamento).
alter table public.encontro_combinados add column if not exists atualizacao text;
alter table public.encontro_combinados add column if not exists atualizado_em timestamptz;
create policy liderado_atualiza on public.encontro_combinados for update
  using (exists (select 1 from public.encontros e where e.id = encontro_combinados.encontro_id and e.liderado_id = public.eu()))
  with check (exists (select 1 from public.encontros e where e.id = encontro_combinados.encontro_id and e.liderado_id = public.eu()));
grant select, update on public.encontro_combinados to authenticated;

-- 2) Diário de bordo do colaborador é só dele: o gestor não vê os registros do colaborador.
--    O gestor continua podendo fazer registros no diário do liderado (o liderado vê) e vê só os que ele mesmo fez.
create or replace function public.pode_ver_diario(p_registro uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diario_registros r
                  where r.id = p_registro and (r.pessoa_id = public.eu() or r.autor_id = public.eu()))
$$;
alter policy ver on public.diario_registros
  using (pessoa_id = public.eu() or autor_id = public.eu());
alter policy criar on public.diario_registros
  with check (autor_id = public.eu() and (pessoa_id = public.eu() or public.sou_gestor_de(pessoa_id)));
alter policy editar on public.diario_registros
  using (autor_id = public.eu())
  with check (autor_id = public.eu() and (pessoa_id = public.eu() or public.sou_gestor_de(pessoa_id)));
update public.diario_registros set compartilhado = false where autor_id = pessoa_id;
