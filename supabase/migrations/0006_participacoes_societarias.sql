-- =====================================================================
-- MÚLTIPLAS EMPRESAS: participações societárias, marcação de lançamentos
-- intercompany e consolidação (integral p/ controladas, MEP p/ coligadas)
-- =====================================================================

-- Registra que uma organização (investidora) tem uma participação
-- societária em outra (investida) — ambas já cadastradas no mesmo login.
-- percentual > 0.50  → controle → consolidação integral (soma 100% dos
--                       ativos/passivos da investida, com participação de
--                       não controladores pelo restante).
-- percentual <= 0.50 → coligada/não controladora → equivalência
--                       patrimonial (MEP): não soma linha a linha, só
--                       reflete a fatia do resultado/PL da investida.
create table participacoes_societarias (
  id uuid primary key default gen_random_uuid(),
  investidora_org_id uuid not null references organizations(id) on delete cascade,
  investida_org_id uuid not null references organizations(id) on delete cascade,
  percentual numeric not null check (percentual > 0 and percentual <= 1),
  data_referencia date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (investidora_org_id, investida_org_id),
  check (investidora_org_id <> investida_org_id)
);

create index idx_participacoes_investidora on participacoes_societarias(investidora_org_id);
create index idx_participacoes_investida on participacoes_societarias(investida_org_id);

alter table participacoes_societarias enable row level security;

-- Visível a quem é membro da investidora OU da investida (ambos os lados
-- do grupo devem conseguir ver que a participação existe).
create policy participacoes_select on participacoes_societarias
  for select using (is_org_member(investidora_org_id) or is_org_member(investida_org_id));

-- Só owner/admin da investidora pode registrar/alterar/remover — e só
-- se também tiver pelo menos acesso de leitura à investida (senão não
-- teria como consolidar os números dela).
create policy participacoes_write on participacoes_societarias
  for all using (is_org_admin(investidora_org_id) and is_org_member(investida_org_id))
  with check (is_org_admin(investidora_org_id) and is_org_member(investida_org_id));

-- ---------------------------------------------------------------------
-- Marcação de lançamentos intercompany, pra eliminação na consolidação
-- ---------------------------------------------------------------------
-- Quando um lançamento representa uma operação entre duas empresas do
-- mesmo grupo (ex: uma vende pra outra), marcar aqui qual é a empresa do
-- outro lado permite ao consolidado eliminar automaticamente o valor
-- (sem isso, a operação apareceria duplicada no consolidado).
alter table lancamentos
  add column intercompany_org_id uuid references organizations(id);

create or replace function create_lancamento(
  p_org_id uuid,
  p_numero integer,
  p_data date,
  p_historico text,
  p_linhas jsonb, -- [{"conta_code":"1.1.1.001","tipo":"D","valor":1000}, ...]
  p_intercompany_org_id uuid default null
)
returns uuid
language plpgsql
as $$
declare
  v_lanc_id uuid;
  v_linha jsonb;
begin
  if p_intercompany_org_id is not null and not is_org_member(p_intercompany_org_id) then
    raise exception 'Você não tem acesso à empresa contraparte informada.';
  end if;

  insert into lancamentos (org_id, numero, data, historico, created_by, intercompany_org_id)
  values (p_org_id, p_numero, p_data, p_historico, auth.uid(), p_intercompany_org_id)
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

grant execute on function create_lancamento(uuid, integer, date, text, jsonb, uuid) to authenticated;

-- Assinatura antiga (5 argumentos) fica ambígua com a nova — remove.
drop function if exists create_lancamento(uuid, integer, date, text, jsonb);

-- v_movimento_contas passa a expor também a empresa contraparte
-- intercompany do lançamento (null quando não é intercompany) — usado
-- pra somar e eliminar essas operações na hora de consolidar duas
-- empresas do grupo. Só acrescenta coluna no final, como já documentado
-- na 0003 (CREATE OR REPLACE VIEW não permite reordenar as existentes).
create or replace view v_movimento_contas
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
  end as valor_saldo,
  ll.id as lancamento_linha_id,
  ll.lancamento_id,
  pc.circulante,
  pc.is_caixa,
  pc.grupo_dre,
  pc.grupo_dfc,
  l.intercompany_org_id
from lancamento_linhas ll
join lancamentos l on l.id = ll.lancamento_id
join plano_de_contas pc on pc.org_id = ll.org_id and pc.code = ll.conta_code;
