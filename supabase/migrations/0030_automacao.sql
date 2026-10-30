-- =====================================================================
-- Automação da rotina contábil (Fase 1)
--
-- Um job diário (Vercel Cron → /api/automacao/processar) lê uma caixa de
-- e-mail dedicada, pega os extratos anexados, importa, classifica e — só
-- se nenhuma validação falhar — lança no Diário e gera o relatório
-- completo em PDF do período. Tudo roda com a service role (sem usuário
-- logado), por isso as tabelas abaixo só aceitam escrita pelo backend;
-- os membros da organização só leem (tela /automacao).
-- =====================================================================

-- Regras: qual organização/conta bancária recebe cada extrato.
-- `identificador` é procurado (sem acento, minúsculas) no assunto do
-- e-mail, no nome do arquivo e no começo do texto do PDF.
create table automacao_regras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  identificador text not null,
  conta_bancaria_code text not null,
  remetentes_permitidos text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_automacao_regras_org on automacao_regras(org_id);

-- Uma linha por arquivo processado.
create table automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  regra_id uuid references automacao_regras(id) on delete set null,
  email_message_id text,
  email_remetente text,
  email_assunto text,
  nome_arquivo text not null,
  status text not null check (status in ('sucesso', 'revisar', 'erro', 'ignorado')),
  periodo_inicio date,
  periodo_fim date,
  lote_id uuid references import_lotes(id) on delete set null,
  total_transacoes integer not null default 0,
  lancamentos_criados integer not null default 0,
  pendencias jsonb not null default '[]'::jsonb,
  relatorio_path text,
  created_at timestamptz not null default now()
);

create index idx_automacao_execucoes_org on automacao_execucoes(org_id, created_at desc);
create unique index uq_automacao_execucoes_email_arquivo
  on automacao_execucoes(email_message_id, nome_arquivo)
  where email_message_id is not null;

alter table automacao_regras enable row level security;
alter table automacao_execucoes enable row level security;

create policy automacao_regras_select on automacao_regras
  for select using (is_org_member(org_id));

create policy automacao_execucoes_select on automacao_execucoes
  for select using (is_org_member(org_id));

-- Bucket privado para os relatórios gerados pela automação (download só
-- pela rota /api/automacao/relatorio/[id], que confere a organização).
insert into storage.buckets (id, name, public)
values ('automacao', 'automacao', false)
on conflict (id) do nothing;
