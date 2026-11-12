-- Diário de bordo: o colaborador registra entregas e contribuições ao longo do ano.
-- Privado por padrão; compartilhado, o gestor (direto, secundário ou acima) vê e comenta.
-- O RH vê só números (função diario_indicadores), nunca o conteúdo.
create table public.diario_registros (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id) on delete cascade,
  data date not null default current_date,
  titulo text not null check (length(btrim(titulo)) >= 3),
  descricao text,
  tipo text not null check (tipo in ('entrega', 'melhoria', 'reconhecimento', 'aprendizado')),
  competencia_id smallint references public.competencias(id),
  link text,
  compartilhado boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index on public.diario_registros (pessoa_id, data desc);

create table public.diario_comentarios (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.diario_registros(id) on delete cascade,
  autor_id uuid not null references public.pessoas(id),
  texto text not null check (length(btrim(texto)) >= 2),
  criado_em timestamptz not null default now()
);

-- Registro levado para a evidência de uma pergunta de avaliação
create table public.diario_usos (
  registro_id uuid not null references public.diario_registros(id) on delete restrict,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  pergunta_id integer not null references public.perguntas(id),
  usado_por uuid not null references public.pessoas(id),
  criado_em timestamptz not null default now(),
  primary key (registro_id, avaliacao_id, pergunta_id)
);

create or replace function public.pode_ver_diario(p_registro uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diario_registros r
                  where r.id = p_registro
                    and (r.pessoa_id = public.eu() or (r.compartilhado and public.sou_gestor_de(r.pessoa_id))))
$$;

alter table public.diario_registros enable row level security;
alter table public.diario_comentarios enable row level security;
alter table public.diario_usos enable row level security;

create policy ver on public.diario_registros for select
  using (pessoa_id = public.eu() or (compartilhado and public.sou_gestor_de(pessoa_id)));
create policy criar on public.diario_registros for insert with check (pessoa_id = public.eu());
create policy editar on public.diario_registros for update using (pessoa_id = public.eu()) with check (pessoa_id = public.eu());
create policy apagar on public.diario_registros for delete
  using (pessoa_id = public.eu() and not exists (select 1 from public.diario_usos u where u.registro_id = diario_registros.id));

create policy ver on public.diario_comentarios for select using (public.pode_ver_diario(registro_id));
create policy criar on public.diario_comentarios for insert with check (autor_id = public.eu() and public.pode_ver_diario(registro_id));
create policy apagar on public.diario_comentarios for delete using (autor_id = public.eu());

create policy ver on public.diario_usos for select using (public.pode_ver_diario(registro_id));
create policy criar on public.diario_usos for insert
  with check (usado_por = public.eu() and public.pode_ver_diario(registro_id) and public.pode_editar_avaliacao(avaliacao_id));

grant select, insert, update, delete on public.diario_registros to authenticated;
grant select, insert, delete on public.diario_comentarios to authenticated;
grant select, insert on public.diario_usos to authenticated;

-- Números do diário para o RH (sem conteúdo)
create or replace function public.diario_indicadores(p_ano int)
returns table (pessoa_id uuid, registros int, compartilhados int, comentados int, usados int)
language sql stable security definer set search_path = '' as $$
  select r.pessoa_id, count(*)::int,
         count(*) filter (where r.compartilhado)::int,
         count(*) filter (where exists (select 1 from public.diario_comentarios c where c.registro_id = r.id))::int,
         count(*) filter (where exists (select 1 from public.diario_usos u where u.registro_id = r.id))::int
    from public.diario_registros r
   where extract(year from r.data) = p_ano and public.eh_rh()
   group by r.pessoa_id
$$;
grant execute on function public.diario_indicadores(int) to authenticated;
grant execute on function public.pode_ver_diario(uuid) to authenticated;
