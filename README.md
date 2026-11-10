# EMAIS Desempenho

Sistema próprio de gestão de desempenho da EMAIS Urbanismo (substitui o módulo de Desempenho da Mindsight).

- `app/` — aplicação web (React + Vite + Supabase)
- `supabase/migrations/` — estrutura do banco, regras de acesso (RLS) e carga dos formulários
- `supabase/functions/` — funções de servidor (login por CPF, criação de acessos)
- `n8n/` — fluxos de avisos e lembretes
- `docs/` — PRD e decisões
