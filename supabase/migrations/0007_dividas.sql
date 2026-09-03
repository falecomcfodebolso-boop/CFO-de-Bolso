-- =====================================================================
-- DÍVIDAS — carteira de passivos (empréstimos, financiamentos, etc.)
-- =====================================================================
-- Espelha a tabela "ativos" (carteira de investimentos), só que para o
-- lado do passivo: permite cadastrar cada dívida (credor, saldo devedor,
-- taxa, indexador, vencimento) pra fazer análise de endividamento,
-- concentração por credor e agenda de vencimentos — sem precisar abrir
-- um lançamento pra cada consulta.
create table dividas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  credor text,
  conta_code text,               -- vínculo opcional com o Plano de Contas (a conta do passivo)
  tipo text not null default 'emprestimo', -- emprestimo | financiamento | cartao | fornecedor | debenture | outro
  indexador text not null default 'PREFIXADO', -- PREFIXADO | CDI | SELIC | IPCA | OUTRO
  valor_original numeric(18,2),
  valor_atual numeric(18,2) not null default 0, -- saldo devedor atual
  taxa_juros numeric(9,6),       -- taxa a.a., em fração (0.18 = 18%)
  data_contratacao date,
  data_vencimento date,
  garantia text,
  moeda text not null default 'USD',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_dividas_org on dividas(org_id);
create index idx_dividas_vencimento on dividas(org_id, data_vencimento);

alter table dividas enable row level security;

create policy dividas_select on dividas
  for select using (is_org_member(org_id));

create policy dividas_write on dividas
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));
