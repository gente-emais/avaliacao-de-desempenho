# EMAIS Desempenho

Sistema próprio de gestão de desempenho da EMAIS Urbanismo, que substitui o módulo de Desempenho da Mindsight.
Cobre Contratação de Desempenho, Ciclo Avaliativo, Ciclo de Feedback, PDI e One a One.

| Pasta | O que tem |
| --- | --- |
| `app/` | Site (React + Vite) com as telas de RH, gestor e colaborador |
| `supabase/migrations/` | Banco: tabelas, regras de acesso (RLS), funções e os 10 formulários |
| `supabase/functions/` | Funções de servidor: primeiro administrador, criação de logins, envio de link de acesso |
| `supabase/manual/` | Script de permissões para rodar uma vez no SQL Editor |
| `supabase/seed/` | Gerador da biblioteca de perguntas (edite aqui, não no SQL) |
| `supabase/tests/` | Teste de ponta a ponta com dados fictícios (Postgres local) |
| `n8n/` | Como configurar os e-mails |
| `docs/` | Regras e decisões |

## Como colocar no ar

1. **Permissões:** rode `supabase/manual/01_permissoes.sql` no SQL Editor do Supabase.
2. **E-mail de acesso:** configure o webhook do n8n e o segredo `N8N_WEBHOOK_ACESSO` (ver `n8n/README.md`).
3. **Site:** publique a pasta `app/` (ex.: Vercel ou Netlify ligados a este repositório)
   - Diretório raiz: `app` · Comando: `npm run build` · Saída: `dist`
   - Variáveis: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase > Project Settings > API)
   - Configure o redirecionamento de rotas para `index.html` (SPA)
4. **Supabase > Authentication > URL Configuration:** coloque o endereço do site em *Site URL* e
   `https://SEU-SITE/definir-senha` em *Redirect URLs*.
5. **Primeiro administrador:** abra `https://SEU-SITE/configurar` e crie o seu login de RH (só funciona uma vez).
6. **Pessoas:** em *Base de colaboradores*, baixe a planilha modelo, suba a base, confira e grave.
   Depois clique em *Criar logins pendentes* e *Enviar link de acesso a todos*.
7. **Rodada:** em *Rodadas*, escolha o tipo, informe as datas e clique em *Abrir rodada*.

## Rodar no computador

```bash
cd app
cp .env.example .env   # preencha URL e chave publicável
npm install
npm run dev
```

## Como funciona o login

O colaborador entra com **CPF e senha**. No Supabase Auth o login técnico é `<cpf>@login.emais.app`
(esse endereço nunca recebe mensagens). O link para criar ou trocar a senha vai para o **e-mail do cadastro**,
enviado pelo n8n. O Operacional Obras não tem login: o gestor preenche por ele.

## Testes

Com um Postgres local: `psql -f supabase/tests/stub_supabase.sql`, depois as migrações em ordem e
`supabase/tests/teste_fluxo.sql`. O teste usa só dados fictícios e cobre importação, abertura de rodada,
autoavaliação, trava de texto, revisão do gestor acima, cálculo de faixa, liberação, aceite e privacidade do One a One.
