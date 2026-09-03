-- =====================================================================
-- AJUSTES DE ACRUAMENTO — reconhecimento de receitas/despesas acruadas
-- =====================================================================
-- Compara, por conta de acruo (ex: "Juros Acruados a Receber - CLN HSBC"),
-- o saldo já reconhecido na contabilidade contra o valor informado pelo
-- extrato/valuation statement do banco/custodiante na data-base, e
-- opcionalmente contra um cálculo interno simplificado (taxa de cupom x
-- dias corridos, base 360) — servindo tanto para gerar o lançamento de
-- ajuste quanto como documentação/justificativa da política de
-- reconhecimento adotada (ver nota metodológica exibida na tela).
create table ajustes_acruo (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ativo_id uuid references ativos(id) on delete set null,
  conta_acruo_code text not null,
  conta_receita_code text not null,
  nome_grupo text not null,
  data_base date not null,
  data_base_anterior date,
  valor_reportado_banco numeric(18,2) not null,
  saldo_contabil_antes numeric(18,2) not null,
  acruo_calculado_interno numeric(18,2),
  diferenca numeric(18,2) not null,
  fonte text,
  observacoes text,
  lancamento_id uuid references lancamentos(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_ajustes_acruo_org on ajustes_acruo(org_id);
create index idx_ajustes_acruo_ativo on ajustes_acruo(org_id, ativo_id);
create index idx_ajustes_acruo_conta on ajustes_acruo(org_id, conta_acruo_code);

alter table ajustes_acruo enable row level security;

create policy ajustes_acruo_select on ajustes_acruo
  for select using (is_org_member(org_id));

create policy ajustes_acruo_write on ajustes_acruo
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));
