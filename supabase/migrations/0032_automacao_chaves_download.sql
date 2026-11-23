-- Chaves de download de relatórios da automação: usadas por um computador
-- (que não precisa ter o projeto nem as chaves do banco) para baixar os PDFs
-- gerados — ver /api/automacao/relatorios/* e instalador-relatorios-pc/.
-- Só o hash SHA-256 da chave fica no banco; a chave em si fica no config do PC.
create table automacao_chaves_download (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  chave_hash text not null unique,
  ativo boolean not null default true,
  ultimo_uso timestamptz,
  created_at timestamptz not null default now()
);

alter table automacao_chaves_download enable row level security;

create policy automacao_chaves_download_select on automacao_chaves_download
  for select using (is_org_member(org_id));
