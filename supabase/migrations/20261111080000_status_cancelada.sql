-- EMAIS Desempenho · 04 · Formulário cancelado (perfil ou gestor mudou durante a rodada)
alter type public.status_avaliacao add value if not exists 'cancelada';
