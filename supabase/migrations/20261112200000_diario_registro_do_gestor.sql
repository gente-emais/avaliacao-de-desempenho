-- Diário de bordo: o gestor também pode registrar no diário do colaborador
-- (reconhecimentos, pontos de melhoria...). Esses registros ficam sempre visíveis para o colaborador.
-- Só quem escreveu edita ou apaga o próprio registro.
alter table public.diario_registros add column if not exists autor_id uuid references public.pessoas(id);
update public.diario_registros set autor_id = pessoa_id where autor_id is null;
alter table public.diario_registros alter column autor_id set default public.eu();
alter table public.diario_registros alter column autor_id set not null;

create or replace function public.pode_ver_diario(p_registro uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diario_registros r
                  where r.id = p_registro
                    and (r.pessoa_id = public.eu() or r.autor_id = public.eu()
                         or (r.compartilhado and public.sou_gestor_de(r.pessoa_id))))
$$;

alter policy ver on public.diario_registros
  using (pessoa_id = public.eu() or autor_id = public.eu() or (compartilhado and public.sou_gestor_de(pessoa_id)));
alter policy criar on public.diario_registros
  with check (autor_id = public.eu() and (pessoa_id = public.eu() or (compartilhado and public.sou_gestor_de(pessoa_id))));
alter policy editar on public.diario_registros
  using (autor_id = public.eu())
  with check (autor_id = public.eu() and (pessoa_id = public.eu() or (compartilhado and public.sou_gestor_de(pessoa_id))));
alter policy apagar on public.diario_registros
  using (autor_id = public.eu() and not exists (select 1 from public.diario_usos u where u.registro_id = diario_registros.id));
