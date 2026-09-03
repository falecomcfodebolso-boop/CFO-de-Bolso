-- =====================================================================
-- SIMPLES NACIONAL — novo regime tributário, com Anexo (I a V)
-- =====================================================================
alter type regime_tributario add value 'SIMPLES_NACIONAL';

alter table organizations
  add column anexo_simples text check (anexo_simples is null or anexo_simples in ('I','II','III','IV','V'));

create or replace function update_regime_tributario(
  p_org_id uuid,
  p_regime_tributario regime_tributario,
  p_atividade_tributaria atividade_tributaria default null,
  p_aliquota_iss numeric default null,
  p_data_abertura_atividade date default null,
  p_anexo_simples text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from memberships
    where org_id = p_org_id and user_id = auth.uid() and role in ('owner', 'admin')
  ) then
    raise exception 'not authorized';
  end if;

  if p_anexo_simples is not null and p_anexo_simples not in ('I','II','III','IV','V') then
    raise exception 'Anexo do Simples Nacional inválido: %', p_anexo_simples;
  end if;

  update organizations
  set regime_tributario = p_regime_tributario,
      atividade_tributaria = p_atividade_tributaria,
      aliquota_iss = p_aliquota_iss,
      data_abertura_atividade = p_data_abertura_atividade,
      anexo_simples = p_anexo_simples
  where id = p_org_id;
end;
$$;

revoke all on function update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric, date, text) from public;
grant execute on function update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric, date, text) to authenticated;

-- Assinatura antiga (5 argumentos) fica ambígua com a nova — remove.
drop function if exists update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric, date);

-- create_organization também passa a aceitar o anexo do Simples Nacional,
-- pra poder ser escolhido já no cadastro da organização (e não só depois,
-- em Configurações).
create or replace function create_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_base_currency text default 'USD',
  p_regime_tributario regime_tributario default null,
  p_atividade_tributaria atividade_tributaria default null,
  p_aliquota_iss numeric default null,
  p_anexo_simples text default null
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

  if p_anexo_simples is not null and p_anexo_simples not in ('I','II','III','IV','V') then
    raise exception 'Anexo do Simples Nacional inválido: %', p_anexo_simples;
  end if;

  insert into organizations (
    name, legal_name, tax_id, base_currency, created_by,
    regime_tributario, atividade_tributaria, aliquota_iss, anexo_simples
  )
  values (
    p_name, p_legal_name, p_tax_id, p_base_currency, auth.uid(),
    p_regime_tributario, p_atividade_tributaria, p_aliquota_iss, p_anexo_simples
  )
  returning id into v_org_id;

  insert into memberships (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner');

  return v_org_id;
end;
$$;

revoke all on function create_organization(text, text, text, text, regime_tributario, atividade_tributaria, numeric, text) from public;
grant execute on function create_organization(text, text, text, text, regime_tributario, atividade_tributaria, numeric, text) to authenticated;

-- Assinatura antiga (7 argumentos, sem o anexo) fica ambígua com a nova — remove.
drop function if exists create_organization(text, text, text, text, regime_tributario, atividade_tributaria, numeric);

