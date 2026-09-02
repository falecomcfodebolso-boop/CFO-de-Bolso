-- =====================================================================
-- CFO DE BOLSO — SCHEMA MULTI-TENANT COM ROW LEVEL SECURITY (RLS)
-- =====================================================================
-- Modelo: cada cliente (holding/empresa) é uma "organization". Usuários
-- pertencem a organizações via "memberships" (N:N, com papel/role).
-- Toda tabela de dados de negócio carrega org_id e tem RLS habilitado,
-- restringindo leitura/escrita a quem tem membership ativa naquela org.
-- Nenhuma tabela é acessível por padrão: RLS nega tudo até que uma
-- política explícita libere o acesso (default-deny).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ORGANIZAÇÕES E MEMBROS
-- ---------------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create type membership_role as enum ('owner', 'admin', 'accountant', 'viewer');

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role membership_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index idx_memberships_user on memberships(user_id);
create index idx_memberships_org on memberships(org_id);

-- Helper: retorna true se o usuário autenticado (auth.uid()) é membro
-- ativo da organização informada. SECURITY DEFINER + search_path fixo
-- evitam escalonamento de privilégio e "table hijacking".
create or replace function is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
  );
$$;

-- Helper: retorna true se o usuário autenticado tem papel de gestão
-- (owner/admin/accountant) na organização — usado para liberar escrita
-- em tabelas contábeis, enquanto 'viewer' só lê.
create or replace function has_write_role(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin','accountant')
  );
$$;

-- Helper: retorna true se o usuário autenticado é owner/admin da org.
-- IMPORTANTE: usado nas próprias policies da tabela memberships. Por ser
-- SECURITY DEFINER, a consulta interna roda com o papel do dono da função
-- (não com o role "authenticated" da sessão), então NÃO reaciona as
-- policies de memberships — evita o erro "infinite recursion detected
-- in policy for relation memberships" que ocorre se uma policy de
-- memberships fizer uma subconsulta direta na própria tabela memberships.
create or replace function is_org_admin(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from memberships m
    where m.org_id = target_org
      and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

alter table organizations enable row level security;
alter table memberships enable row level security;

-- Organizações: só é visível/editável por quem é membro dela.
create policy org_select on organizations
  for select using (is_org_member(id));

create policy org_update on organizations
  for update using (is_org_admin(id));

-- Criação de organização: qualquer usuário autenticado pode criar uma
-- (vira o "owner" dela na sequência, via trigger abaixo).
create policy org_insert on organizations
  for insert with check (auth.uid() is not null and created_by = auth.uid());

-- Memberships: um usuário só enxerga memberships das orgs às quais pertence.
create policy membership_select on memberships
  for select using (is_org_member(org_id));

-- Só owner/admin pode gerenciar membros da própria org.
create policy membership_write on memberships
  for all using (is_org_admin(org_id))
  with check (is_org_admin(org_id));

-- Criação de organização: RPC atômica (org + membership 'owner' em uma
-- única transação SECURITY DEFINER). É o caminho recomendado a partir do
-- app (supabase.rpc('create_organization', ...)) porque evita a corrida
-- entre o INSERT em organizations e a policy de SELECT usada pelo
-- RETURNING (que depende da membership já existir para enxergar a linha).
-- Um INSERT direto em organizations pelo cliente continua permitido pela
-- policy org_insert acima (defesa em profundidade), mas nesse caso o
-- próprio cliente deve inserir a membership 'owner' em seguida.
create or replace function create_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_base_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into organizations (name, legal_name, tax_id, base_currency, created_by)
  values (p_name, p_legal_name, p_tax_id, p_base_currency, auth.uid())
  returning id into v_org_id;

  insert into memberships (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner');

  return v_org_id;
end;
$$;

revoke all on function create_organization(text, text, text, text) from public;
grant execute on function create_organization(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- PLANO DE CONTAS
-- ---------------------------------------------------------------------

create type plano_natureza as enum ('ATIVO','PASSIVO','PL','RECEITA','DESPESA','CONTROLE');

create table plano_de_contas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  natureza plano_natureza not null,
  parent_code text,
  is_leaf boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create index idx_plano_org on plano_de_contas(org_id);

alter table plano_de_contas enable row level security;

create policy plano_select on plano_de_contas
  for select using (is_org_member(org_id));

create policy plano_write on plano_de_contas
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

-- ---------------------------------------------------------------------
-- DIÁRIO (LANÇAMENTOS EM PARTIDA DOBRADA)
-- ---------------------------------------------------------------------

create table lancamentos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  numero integer not null,
  data date not null,
  historico text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (org_id, numero)
);

create index idx_lancamentos_org_data on lancamentos(org_id, data);

create table lancamento_linhas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  lancamento_id uuid not null references lancamentos(id) on delete cascade,
  conta_code text not null,
  tipo text not null check (tipo in ('D','C')),
  valor numeric(18,2) not null check (valor > 0),
  created_at timestamptz not null default now()
);

create index idx_linhas_lancamento on lancamento_linhas(lancamento_id);
create index idx_linhas_org_conta on lancamento_linhas(org_id, conta_code);

alter table lancamentos enable row level security;
alter table lancamento_linhas enable row level security;

create policy lancamentos_select on lancamentos
  for select using (is_org_member(org_id));

create policy lancamentos_write on lancamentos
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

create policy linhas_select on lancamento_linhas
  for select using (is_org_member(org_id));

create policy linhas_write on lancamento_linhas
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

-- Validação de partida dobrada: soma de débitos = soma de créditos por
-- lançamento. Roda a cada alteração em lancamento_linhas.
create or replace function check_lancamento_balanceado(p_lancamento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deb numeric(18,2);
  v_cred numeric(18,2);
begin
  select coalesce(sum(valor) filter (where tipo = 'D'), 0),
         coalesce(sum(valor) filter (where tipo = 'C'), 0)
    into v_deb, v_cred
    from lancamento_linhas
   where lancamento_id = p_lancamento_id;

  if v_deb <> v_cred then
    raise exception 'Lançamento % não está balanceado: débitos=% créditos=%', p_lancamento_id, v_deb, v_cred;
  end if;
end;
$$;

create or replace function trg_check_lancamento_balanceado()
returns trigger
language plpgsql
as $$
begin
  perform check_lancamento_balanceado(coalesce(new.lancamento_id, old.lancamento_id));
  return null;
end;
$$;

create constraint trigger trg_linhas_balanceadas
  after insert or update or delete on lancamento_linhas
  deferrable initially deferred
  for each row execute function trg_check_lancamento_balanceado();

-- RPC de conveniência: cria um lançamento + suas linhas em uma única
-- transação (garante atomicidade para o trigger de partida dobrada, que
-- só valida no fim da transação). NÃO é SECURITY DEFINER de propósito:
-- roda com os privilégios do usuário chamador, então continua sujeita
-- às mesmas policies de RLS/has_write_role de lancamentos e
-- lancamento_linhas — um 'viewer' não consegue chamar isto com sucesso.
create or replace function create_lancamento(
  p_org_id uuid,
  p_numero integer,
  p_data date,
  p_historico text,
  p_linhas jsonb -- [{"conta_code":"1.1.1.001","tipo":"D","valor":1000}, ...]
)
returns uuid
language plpgsql
as $$
declare
  v_lanc_id uuid;
  v_linha jsonb;
begin
  insert into lancamentos (org_id, numero, data, historico, created_by)
  values (p_org_id, p_numero, p_data, p_historico, auth.uid())
  returning id into v_lanc_id;

  for v_linha in select * from jsonb_array_elements(p_linhas)
  loop
    insert into lancamento_linhas (org_id, lancamento_id, conta_code, tipo, valor)
    values (
      p_org_id,
      v_lanc_id,
      v_linha->>'conta_code',
      v_linha->>'tipo',
      (v_linha->>'valor')::numeric
    );
  end loop;

  return v_lanc_id;
end;
$$;

grant execute on function create_lancamento(uuid, integer, date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- CARTEIRA DE ATIVOS / POSIÇÕES
-- ---------------------------------------------------------------------

create table ativos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  nome text not null,
  custodiante text,
  conta_code text,               -- vínculo com o Plano de Contas (subconta do ativo)
  tipo text not null default 'renda_fixa', -- renda_fixa | fundo | acao | outro
  valor_atual numeric(18,2) not null default 0,
  taxa_cupom numeric(9,6),
  data_vencimento date,
  rating text,
  moeda text not null default 'USD',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_ativos_org on ativos(org_id);
create index idx_ativos_vencimento on ativos(org_id, data_vencimento);

alter table ativos enable row level security;

create policy ativos_select on ativos
  for select using (is_org_member(org_id));

create policy ativos_write on ativos
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

-- ---------------------------------------------------------------------
-- ALERTAS DE VENCIMENTO
-- ---------------------------------------------------------------------

create table alert_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  dias_antecedencia integer[] not null default '{5,4,3,2,1}',
  hora_local time not null default '10:00',
  timezone text not null default 'America/Sao_Paulo',
  canal text not null default 'push', -- push | email
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table alert_configs enable row level security;

create policy alert_configs_select on alert_configs
  for select using (is_org_member(org_id));

create policy alert_configs_write on alert_configs
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

-- ---------------------------------------------------------------------
-- CFO DE BOLSO — HISTÓRICO DE CHAT
-- ---------------------------------------------------------------------

create table chat_conversas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  titulo text,
  created_at timestamptz not null default now()
);

create table chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversa_id uuid not null references chat_conversas(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_chat_conversas_org_user on chat_conversas(org_id, user_id);
create index idx_chat_mensagens_conversa on chat_mensagens(conversa_id);

alter table chat_conversas enable row level security;
alter table chat_mensagens enable row level security;

-- Conversas e mensagens são privadas ao próprio usuário dentro da org
-- (um contador não vê as perguntas que o dono fez ao CFO de bolso,
-- salvo se também tiver papel de owner/admin).
create policy chat_conversas_select on chat_conversas
  for select using (
    is_org_member(org_id) and (user_id = auth.uid() or is_org_admin(org_id))
  );

create policy chat_conversas_write on chat_conversas
  for insert with check (is_org_member(org_id) and user_id = auth.uid());

create policy chat_conversas_delete on chat_conversas
  for delete using (is_org_member(org_id) and user_id = auth.uid());

create policy chat_mensagens_select on chat_mensagens
  for select using (
    exists (
      select 1 from chat_conversas c
      where c.id = chat_mensagens.conversa_id
        and (c.user_id = auth.uid() or is_org_admin(c.org_id))
    )
  );

create policy chat_mensagens_write on chat_mensagens
  for insert with check (
    exists (select 1 from chat_conversas c where c.id = chat_mensagens.conversa_id and c.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- AUDITORIA (quem viu/alterou o quê) — mitigação extra de vazamento
-- ---------------------------------------------------------------------

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy audit_log_select on audit_log
  for select using (
    exists (select 1 from memberships m where m.org_id = audit_log.org_id and m.user_id = auth.uid() and m.role in ('owner','admin'))
  );

-- audit_log só é escrito pelo backend via service role (nunca pelo
-- cliente) — por isso não existe policy de insert para o role "authenticated".

-- ---------------------------------------------------------------------
-- VIEWS DE APOIO (RAZÃO / BALANCETE)
-- ---------------------------------------------------------------------
-- security_invoker = true faz a view rodar com os privilégios de quem a
-- consulta (não do dono da view), então a RLS das tabelas base
-- (lancamento_linhas, plano_de_contas) continua sendo aplicada
-- normalmente — a view em si não abre nenhum furo de segurança.

create view v_movimento_contas
  with (security_invoker = true) as
select
  ll.org_id,
  ll.conta_code,
  pc.name as conta_name,
  pc.natureza,
  l.data,
  l.numero as lancamento_numero,
  l.historico,
  ll.tipo,
  ll.valor,
  case
    when pc.natureza in ('ATIVO','DESPESA') then (case when ll.tipo = 'D' then ll.valor else -ll.valor end)
    else (case when ll.tipo = 'C' then ll.valor else -ll.valor end)
  end as valor_saldo
from lancamento_linhas ll
join lancamentos l on l.id = ll.lancamento_id
join plano_de_contas pc on pc.org_id = ll.org_id and pc.code = ll.conta_code;

create view v_saldo_contas
  with (security_invoker = true) as
select
  org_id,
  conta_code,
  conta_name,
  natureza,
  sum(valor_saldo) as saldo
from v_movimento_contas
group by org_id, conta_code, conta_name, natureza;
