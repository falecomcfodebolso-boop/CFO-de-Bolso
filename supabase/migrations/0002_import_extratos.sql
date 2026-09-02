-- =====================================================================
-- IMPORTAÇÃO DE EXTRATOS BANCÁRIOS (OFX/CSV/XLS/PDF)
-- =====================================================================
-- Fluxo: usuário sobe um arquivo de extrato vinculado a uma conta
-- bancária do plano de contas -> o app faz o parsing e grava as
-- transações "cruas" em import_transacoes (status 'pendente') -> a IA
-- (quando configurada) sugere uma conta de contrapartida por transação
-- -> o usuário revisa/ajusta e confirma -> cada confirmação vira um
-- lançamento de verdade via a RPC create_lancamento já existente
-- (partida dobrada: conta bancária de um lado, contrapartida do outro).
-- Segue o mesmo padrão de RLS default-deny das demais tabelas.
-- =====================================================================

create table import_lotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conta_bancaria_code text not null,
  nome_arquivo text not null,
  tipo_arquivo text not null check (tipo_arquivo in ('ofx','csv','xls','pdf')),
  total_transacoes integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_import_lotes_org on import_lotes(org_id);

create table import_transacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  lote_id uuid not null references import_lotes(id) on delete cascade,
  data date not null,
  descricao text not null,
  valor numeric(18,2) not null, -- assinado: positivo = entrada, negativo = saída
  conta_sugerida text,
  confianca_sugestao text check (confianca_sugestao in ('alta','media','baixa')),
  conta_confirmada text,
  status text not null default 'pendente' check (status in ('pendente','conciliado','ignorado')),
  lancamento_id uuid references lancamentos(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_import_transacoes_lote on import_transacoes(lote_id);
create index idx_import_transacoes_org_status on import_transacoes(org_id, status);

alter table import_lotes enable row level security;
alter table import_transacoes enable row level security;

create policy import_lotes_select on import_lotes
  for select using (is_org_member(org_id));

create policy import_lotes_write on import_lotes
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

create policy import_transacoes_select on import_transacoes
  for select using (is_org_member(org_id));

create policy import_transacoes_write on import_transacoes
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));
