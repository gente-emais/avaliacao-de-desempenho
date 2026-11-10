-- =====================================================================
-- EMAIS Desempenho · 01 · Estrutura do banco
-- Cadastro, biblioteca de formulários, rodadas, preenchimento,
-- resultados, PDI, One a One e apoio (auditoria, avisos, importações).
-- =====================================================================

-- ---------- Tipos ----------
create type public.papel_acesso as enum ('admin_rh', 'bp_rh', 'participante');
create type public.tipo_rodada as enum ('contratacao', 'avaliativo', 'feedback');
create type public.status_rodada as enum ('rascunho', 'aberta', 'encerrada', 'historica');
create type public.status_etapa as enum ('aguardando', 'aberta', 'fechada');
-- auto = colaborador sobre si · gestor = gestor sobre o colaborador
-- lider = colaborador sobre o próprio gestor · par = par sobre o colaborador
create type public.grupo_avaliativo as enum ('auto', 'gestor', 'lider', 'par');
create type public.tipo_bloco as enum (
  'competencia', 'prework_colaborador', 'prework_gestor', 'potencial',
  'avaliacao_lider', 'avaliacao_pares', 'contratacao',
  'feedback_gestor', 'feedback_colaborador'
);
create type public.tipo_pergunta as enum ('escala', 'aberta', 'sim_nao', 'escolha');
create type public.status_avaliacao as enum ('pendente', 'em_andamento', 'enviada', 'concluida');
create type public.status_pdi as enum ('nao_iniciado', 'em_andamento', 'concluido');
create type public.tipo_objetivo as enum ('carreira', 'desenvolvimento');
create type public.status_combinado as enum ('aberto', 'concluido', 'cancelado');

-- ---------- Atualização automática de "atualizado_em" ----------
create or replace function public.tg_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- =====================================================================
-- CADASTRO
-- =====================================================================
create table public.perfis (
  id smallint generated always as identity primary key,
  codigo text not null unique,
  nome text not null,
  nivel_complexidade smallint not null check (nivel_complexidade between 1 and 5),
  acesso_assistido boolean not null default false, -- true = não tem login, gestor preenche
  ordem smallint not null default 0
);
comment on table public.perfis is 'Perfil de avaliação (define formulário e quem avalia quem).';

create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  cpf text not null unique check (cpf ~ '^[0-9]{11}$'),
  nome text not null,
  email text,
  email_ficticio boolean not null default false,
  cargo text,
  area text,
  perfil_id smallint references public.perfis(id),
  gestor_id uuid references public.pessoas(id),
  gestor_secundario_id uuid references public.pessoas(id),
  bp_id uuid references public.pessoas(id),            -- BP do RH responsável
  papel public.papel_acesso not null default 'participante',
  acesso_assistido boolean not null default false,
  ativo boolean not null default true,
  user_id uuid unique references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (gestor_id is distinct from id)
);
create index on public.pessoas (gestor_id);
create index on public.pessoas (bp_id);
create index on public.pessoas (perfil_id);
create trigger pessoas_atualizado before update on public.pessoas
  for each row execute function public.tg_atualizado_em();
comment on column public.pessoas.cpf is 'Somente dígitos. Nunca exibir completo fora do RH.';

-- =====================================================================
-- BIBLIOTECA DE FORMULÁRIOS
-- =====================================================================
create table public.competencias (
  id smallint generated always as identity primary key,
  codigo text not null unique,
  nome text not null,
  ordem smallint not null default 0
);

create table public.escalas (
  id smallint generated always as identity primary key,
  codigo text not null unique,
  nome text not null
);

create table public.escala_opcoes (
  id integer generated always as identity primary key,
  escala_id smallint not null references public.escalas(id) on delete cascade,
  valor numeric(4,2) not null,
  rotulo text not null,
  ordem smallint not null,
  unique (escala_id, ordem),
  unique (escala_id, valor)
);

create table public.blocos (
  id integer generated always as identity primary key,
  codigo text not null unique,
  nome text not null,
  tipo public.tipo_bloco not null,
  competencia_id smallint references public.competencias(id),
  perfil_id smallint references public.perfis(id),   -- nível do bloco (null = comum)
  descricao text,
  ativo boolean not null default true
);

create table public.perguntas (
  id integer generated always as identity primary key,
  bloco_id integer not null references public.blocos(id) on delete cascade,
  ordem smallint not null,
  texto text not null,
  tipo public.tipo_pergunta not null,
  escala_id smallint references public.escalas(id),
  opcoes jsonb,                       -- para tipo 'escolha': ["A","B",...]
  obrigatoria boolean not null default true,
  pede_evidencia boolean not null default false,
  evidencia_rotulo text default 'Descreva as evidências de sua avaliação',
  pergunta_mae_id integer references public.perguntas(id),
  condicao_valor text,                -- mostra só quando a mãe tiver esta resposta (ex.: 'Sim')
  min_caracteres smallint not null default 30,
  min_palavras smallint not null default 5,
  ativa boolean not null default true,
  unique (bloco_id, ordem),
  check ((tipo = 'escala') = (escala_id is not null)),
  check (tipo <> 'escolha' or opcoes is not null)
);

create table public.formularios (
  id integer generated always as identity primary key,
  codigo text not null unique,
  nome text not null,
  tipo_rodada public.tipo_rodada not null,
  perfil_id smallint references public.perfis(id),   -- null = vale para todos os perfis
  versao smallint not null default 1,
  ativo boolean not null default true
);

-- Coração do modelo: quais blocos, quem responde cada um e se entra na nota.
create table public.formulario_blocos (
  id integer generated always as identity primary key,
  formulario_id integer not null references public.formularios(id) on delete cascade,
  bloco_id integer not null references public.blocos(id),
  grupo public.grupo_avaliativo not null,
  ordem smallint not null,
  entra_na_nota boolean not null default false,
  unique (formulario_id, bloco_id, grupo)
);

-- =====================================================================
-- RODADAS
-- =====================================================================
create table public.rodadas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.tipo_rodada not null,
  ano smallint not null,
  status public.status_rodada not null default 'rascunho',
  escala_nota_id smallint references public.escalas(id),
  prazo_feedback date,                 -- usado no cruzamento "recebi no prazo"
  foto_em timestamptz,                 -- quando a foto das pessoas foi tirada
  resultado_liberado_em timestamptz,
  somente_leitura boolean not null default false, -- rodadas históricas migradas
  criada_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);

create table public.rodada_etapas (
  id integer generated always as identity primary key,
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  ordem smallint not null,
  codigo text not null,        -- indicacao, validacao, avaliacao, resultados, preenchimento, aceite, registro, resposta
  nome text not null,
  inicio date not null,
  fim date not null,
  status public.status_etapa not null default 'aguardando',
  unique (rodada_id, ordem),
  check (fim >= inicio)
);

create table public.rodada_formularios (
  id integer generated always as identity primary key,
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  perfil_id smallint references public.perfis(id),   -- null = todos
  formulario_id integer not null references public.formularios(id),
  unique nulls not distinct (rodada_id, perfil_id)
);

-- Foto das pessoas na abertura: mudanças no cadastro não mexem na rodada.
create table public.rodada_participantes (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id),
  nome text not null,
  cargo text,
  area text,
  perfil_id smallint references public.perfis(id),
  gestor_id uuid references public.pessoas(id),
  gestor_secundario_id uuid references public.pessoas(id),
  bp_id uuid references public.pessoas(id),
  acesso_assistido boolean not null default false,
  aprovado boolean not null default true,
  unique (rodada_id, pessoa_id)
);
create index on public.rodada_participantes (rodada_id, gestor_id);
create index on public.rodada_participantes (rodada_id, bp_id);

create table public.faixas_classificacao (
  id integer generated always as identity primary key,
  rodada_id uuid references public.rodadas(id) on delete cascade, -- null = modelo padrão
  nome text not null,
  minimo numeric(4,2) not null,
  maximo numeric(4,2) not null,
  ordem smallint not null,
  check (maximo >= minimo)
);

-- =====================================================================
-- PREENCHIMENTO
-- =====================================================================
create table public.indicacoes (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  avaliado_id uuid not null references public.pessoas(id),
  avaliador_id uuid not null references public.pessoas(id),
  grupo public.grupo_avaliativo not null,
  aprovada boolean not null default true,
  indicado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now(),
  unique (rodada_id, grupo, avaliado_id, avaliador_id),
  check (avaliado_id <> avaliador_id)
);

create table public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  formulario_id integer not null references public.formularios(id),
  grupo public.grupo_avaliativo not null,
  avaliado_id uuid not null references public.pessoas(id),
  avaliador_id uuid not null references public.pessoas(id),
  status public.status_avaliacao not null default 'pendente',
  preenchido_por uuid references public.pessoas(id),   -- quem de fato preencheu
  em_nome_de boolean not null default false,           -- gestor preencheu pelo liderado
  iniciada_em timestamptz,
  enviada_em timestamptz,
  concluida_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (rodada_id, grupo, avaliado_id, avaliador_id)
);
create index on public.avaliacoes (avaliador_id, status);
create index on public.avaliacoes (avaliado_id);
create index on public.avaliacoes (rodada_id, status);
create trigger avaliacoes_atualizado before update on public.avaliacoes
  for each row execute function public.tg_atualizado_em();

create table public.respostas (
  id bigint generated always as identity primary key,
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  pergunta_id integer not null references public.perguntas(id),
  valor numeric(4,2),       -- escala
  opcao text,               -- sim_nao / escolha
  texto text,               -- aberta
  evidencia text,
  atualizado_por uuid references public.pessoas(id),
  atualizado_em timestamptz not null default now(),
  unique (avaliacao_id, pergunta_id)
);
create trigger respostas_atualizado before update on public.respostas
  for each row execute function public.tg_atualizado_em();

create table public.aceites (
  avaliacao_id uuid primary key references public.avaliacoes(id) on delete cascade,
  aceito_em timestamptz not null default now(),
  marcado_por uuid not null references public.pessoas(id),
  em_nome_de boolean not null default false
);

create table public.revisoes (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.avaliacoes(id) on delete cascade,
  revisor_id uuid not null references public.pessoas(id),
  nota_original numeric(4,2) not null,
  nota_ajustada numeric(4,2) not null,
  comentario text,
  criado_em timestamptz not null default now()
);

create table public.resultados (
  id uuid primary key default gen_random_uuid(),
  rodada_id uuid not null references public.rodadas(id) on delete cascade,
  pessoa_id uuid not null references public.pessoas(id),
  nota_calculada numeric(4,2),
  nota_final numeric(4,2),
  faixa_id integer references public.faixas_classificacao(id),
  faixa_nome text,
  nota_autoavaliacao numeric(4,2),
  calculado_em timestamptz not null default now(),
  unique (rodada_id, pessoa_id)
);

-- =====================================================================
-- PDI
-- =====================================================================
create table public.pdi_objetivos (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas(id),
  ano smallint not null,
  tipo public.tipo_objetivo not null,
  nome text not null,
  descricao text,
  inicio date not null,
  fim date not null,
  carga_horaria numeric(6,1),
  status public.status_pdi not null default 'nao_iniciado',
  competencia_id smallint references public.competencias(id),
  avaliacao_contratacao_id uuid references public.avaliacoes(id),
  criado_por uuid not null references public.pessoas(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim >= inicio)
);
create trigger pdi_atualizado before update on public.pdi_objetivos
  for each row execute function public.tg_atualizado_em();

create table public.pdi_tarefas (
  id uuid primary key default gen_random_uuid(),
  objetivo_id uuid not null references public.pdi_objetivos(id) on delete cascade,
  ordem smallint not null default 0,
  nome text not null,
  concluida boolean not null default false,
  concluida_em timestamptz
);

create table public.pdi_comentarios (
  id uuid primary key default gen_random_uuid(),
  objetivo_id uuid not null references public.pdi_objetivos(id) on delete cascade,
  autor_id uuid not null references public.pessoas(id),
  texto text not null,
  criado_em timestamptz not null default now()
);

-- =====================================================================
-- ONE A ONE
-- =====================================================================
create table public.encontros (
  id uuid primary key default gen_random_uuid(),
  gestor_id uuid not null references public.pessoas(id),
  liderado_id uuid not null references public.pessoas(id),
  data date not null,
  pauta text,
  anotacoes_compartilhadas text,
  proximo_encontro date,
  criado_em timestamptz not null default now(),
  check (gestor_id <> liderado_id)
);
create index on public.encontros (gestor_id, data desc);

-- Anotações privadas ficam separadas: só o autor lê (nem o RH).
create table public.encontro_notas_privadas (
  encontro_id uuid primary key references public.encontros(id) on delete cascade,
  autor_id uuid not null references public.pessoas(id),
  texto text not null default ''
);

create table public.encontro_combinados (
  id uuid primary key default gen_random_uuid(),
  encontro_id uuid not null references public.encontros(id) on delete cascade,
  acao text not null,
  responsavel_id uuid not null references public.pessoas(id),
  prazo date not null,
  status public.status_combinado not null default 'aberto',
  pdi_objetivo_id uuid references public.pdi_objetivos(id),
  avaliacao_contratacao_id uuid references public.avaliacoes(id)
);

-- =====================================================================
-- APOIO
-- =====================================================================
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text not null,
  acao text not null,
  dados jsonb,
  feito_por uuid references public.pessoas(id),
  em_nome_de uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);
create index on public.auditoria (tabela, registro_id);

create table public.notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null,
  destinatario_id uuid not null references public.pessoas(id),
  rodada_id uuid references public.rodadas(id) on delete cascade,
  chave text not null,                       -- evita duplicidade (tipo+rodada+pessoa+data)
  payload jsonb,
  status text not null default 'pendente' check (status in ('pendente','enviado','erro','ignorado')),
  enviado_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  unique (chave)
);

create table public.importacoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'pessoas',
  arquivo_nome text,
  linhas_lidas integer not null default 0,
  linhas_gravadas integer not null default 0,
  linhas_rejeitadas integer not null default 0,
  status text not null default 'previa' check (status in ('previa','gravada','cancelada')),
  criado_por uuid references public.pessoas(id),
  criado_em timestamptz not null default now()
);

create table public.importacao_linhas (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.importacoes(id) on delete cascade,
  linha integer not null,
  dados jsonb not null,
  situacao text not null check (situacao in ('novo','alterado','sem_alteracao','aviso','erro','inativar')),
  mensagem text
);
