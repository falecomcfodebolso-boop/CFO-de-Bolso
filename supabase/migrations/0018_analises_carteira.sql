-- =====================================================================
-- ANÁLISES DE RISCO E RECOMENDAÇÕES DA CARTEIRA (texto gerado sob demanda)
-- =====================================================================
-- Diferente dos índices numéricos (calculados ao vivo), a análise de
-- risco por dimensão e as recomendações de rebalanceamento envolvem
-- julgamento qualitativo — por isso não ficam fixas na tela, e sim são
-- geradas sob demanda (botão "Gerar análise") a partir dos números atuais
-- da carteira, e guardadas aqui como histórico.
create table analises_carteira (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conteudo text not null,
  contexto_resumo text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_analises_carteira_org on analises_carteira(org_id, created_at desc);

alter table analises_carteira enable row level security;

create policy analises_carteira_select on analises_carteira
  for select using (is_org_member(org_id));

create policy analises_carteira_write on analises_carteira
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));
