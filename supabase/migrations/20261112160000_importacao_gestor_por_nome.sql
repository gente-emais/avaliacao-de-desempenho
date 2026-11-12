-- Importação de pessoas: o gestor (e o gestor secundário) pode vir pelo NOME, além do CPF.
-- O nome é procurado na própria planilha e entre as pessoas ativas, sem diferenciar acentos e maiúsculas.
-- Nome não encontrado ou repetido: a pessoa entra sem aquele gestor, com aviso.
alter table public.importacao_staging add column if not exists aviso_gestor text;

create or replace function public.normaliza_nome(t text)
returns text language sql immutable set search_path = '' as $f$
  select lower(regexp_replace(translate(btrim(coalesce(t, '')),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'), '\s+', ' ', 'g'))
$f$;

create or replace function public.resolver_pessoa_por_nome(p_nome text, p_linhas jsonb)
returns table (cpf text, qtd int) language sql stable security definer set search_path = '' as $f$
  with c as (
    select lpad(regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g'), 11, '0') as cpf
      from jsonb_array_elements(p_linhas) l
     where public.normaliza_nome(l ->> 'nome') = public.normaliza_nome(p_nome)
    union
    select p.cpf from public.pessoas p where p.ativo and public.normaliza_nome(p.nome) = public.normaliza_nome(p_nome)
  )
  select case when count(distinct c.cpf) = 1 then min(c.cpf) end, count(distinct c.cpf)::int
    from c where coalesce(btrim(p_nome), '') <> ''
$f$;

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
     cpf_gestor, cpf_gestor2, cpf_bp, acesso_assistido, papel, situacao, mensagem, aviso_gestor)
  select imp, n::int, x.cpf, x.nome, x.email,
         x.email is null or x.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
           or x.email ~ '(ficticio|fictício|teste|sememail|naotem|nao_tem|semmail|example\.)',
         x.cargo, x.area, pf.id, coalesce(x.cpf_gestor, g1.cpf), coalesce(x.cpf_gestor2, g2.cpf), x.cpf_bp,
         x.assistido or coalesce(pf.acesso_assistido, false),
         x.papel, null,
         nullif(concat_ws('; ',
           case when not public.cpf_valido(x.cpf) then 'CPF inválido' end,
           case when coalesce(x.nome, '') = '' then 'Nome em branco' end,
           case when pf.id is null then 'Perfil não encontrado: ' || coalesce(nullif(x.perfil, ''), '(vazio)') end,
           case when coalesce(x.cpf_gestor, g1.cpf) = x.cpf then 'Gestor igual à própria pessoa' end), ''),
         nullif(concat_ws('; ',
           case when x.cpf_gestor is null and x.gestor_nome is not null and g1.qtd = 0 then 'Gestor "' || x.gestor_nome || '" não encontrado pelo nome: entra sem gestor' end,
           case when x.cpf_gestor is null and x.gestor_nome is not null and g1.qtd > 1 then 'Há mais de uma pessoa chamada "' || x.gestor_nome || '": informe o CPF do gestor' end,
           case when x.cpf_gestor2 is null and x.gestor2_nome is not null and g2.qtd = 0 then 'Gestor secundário "' || x.gestor2_nome || '" não encontrado pelo nome' end,
           case when x.cpf_gestor2 is null and x.gestor2_nome is not null and g2.qtd > 1 then 'Há mais de uma pessoa chamada "' || x.gestor2_nome || '": informe o CPF do gestor secundário' end), '')
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
             nullif(l ->> 'papel', '')::public.papel_acesso as papel,
             nullif(btrim(coalesce(l ->> 'gestor_nome', '')), '') as gestor_nome,
             nullif(btrim(coalesce(l ->> 'gestor2_nome', '')), '') as gestor2_nome
    ) x
    cross join lateral public.resolver_pessoa_por_nome(x.gestor_nome, p_linhas) g1
    cross join lateral public.resolver_pessoa_por_nome(x.gestor2_nome, p_linhas) g2
    left join public.perfis pf on lower(pf.codigo) = lower(x.perfil) or lower(pf.nome) = lower(x.perfil);
  get diagnostics lidas = row_count;

  update public.importacao_staging set situacao = 'erro' where importacao_id = imp and mensagem is not null;

  -- 2. CPF repetido e gestor inexistente
  update public.importacao_staging s
     set situacao = 'erro', mensagem = concat_ws('; ', s.mensagem, 'CPF repetido na planilha')
   where s.importacao_id = imp
     and s.cpf in (select cpf from public.importacao_staging where importacao_id = imp group by cpf having count(*) > 1);

  -- Gestor que não está na base nem na planilha não barra a linha: a pessoa entra sem gestor (aviso)
  update public.importacao_staging s
     set mensagem = 'Gestor não encontrado (CPF ***.' || substr(s.cpf_gestor, 4, 3) || '.' || substr(s.cpf_gestor, 7, 3) || '-**): entra sem gestor; inclua o gestor na base e suba de novo'
   where s.importacao_id = imp and s.cpf_gestor is not null and s.situacao is null
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
     set situacao = 'aviso'
   where importacao_id = imp and situacao in ('novo', 'alterado', 'sem_alteracao') and mensagem like 'Gestor não encontrado%';

  update public.importacao_staging
     set situacao = 'aviso', mensagem = concat_ws('; ', mensagem, aviso_gestor)
   where importacao_id = imp and situacao in ('novo', 'alterado', 'sem_alteracao', 'aviso') and aviso_gestor is not null;

  update public.importacao_staging
     set situacao = 'aviso', mensagem = concat_ws('; ', mensagem, 'E-mail fictício ou vazio: não receberá avisos nem login')
   where importacao_id = imp and situacao in ('novo', 'alterado', 'sem_alteracao', 'aviso')
     and email_ficticio and not acesso_assistido;

  -- 4. Relatório
  insert into public.importacao_linhas (importacao_id, linha, dados, situacao, mensagem)
  select imp, s.linha,
         to_jsonb(s) - 'importacao_id' - 'situacao' - 'mensagem' - 'linha' - 'aviso_gestor',
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
