-- =====================================================================
-- REGIME TRIBUTÁRIO (MEI / Lucro Presumido / Lucro Real)
-- =====================================================================
-- Só é relevante pra organizações brasileiras em Reais (base_currency =
-- 'BRL') — o app usa isso pra decidir se mostra o menu "Obrigações
-- Fiscais" e como calcular as obrigações de cada regime.
-- =====================================================================

create type regime_tributario as enum ('MEI', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- Atividade principal, usada tanto pra escolher o valor do DAS (MEI)
-- quanto o percentual de presunção de IRPJ/CSLL (Lucro Presumido).
create type atividade_tributaria as enum (
  'COMERCIO_INDUSTRIA',
  'SERVICOS',
  'COMERCIO_E_SERVICOS',
  'TRANSPORTE_CARGA'
);

alter table organizations
  add column regime_tributario regime_tributario,
  add column atividade_tributaria atividade_tributaria,
  -- Alíquota de ISS do município (fração, ex: 0.05 = 5%) — varia por
  -- cidade, então precisa ser informada manualmente pelo usuário.
  add column aliquota_iss numeric;

-- Atualiza create_organization pra aceitar os novos campos (opcionais —
-- só fazem sentido quando p_base_currency = 'BRL').
create or replace function create_organization(
  p_name text,
  p_legal_name text default null,
  p_tax_id text default null,
  p_base_currency text default 'USD',
  p_regime_tributario regime_tributario default null,
  p_atividade_tributaria atividade_tributaria default null,
  p_aliquota_iss numeric default null
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

  insert into organizations (
    name, legal_name, tax_id, base_currency, created_by,
    regime_tributario, atividade_tributaria, aliquota_iss
  )
  values (
    p_name, p_legal_name, p_tax_id, p_base_currency, auth.uid(),
    p_regime_tributario, p_atividade_tributaria, p_aliquota_iss
  )
  returning id into v_org_id;

  insert into memberships (org_id, user_id, role)
  values (v_org_id, auth.uid(), 'owner');

  return v_org_id;
end;
$$;

revoke all on function create_organization(text, text, text, text, regime_tributario, atividade_tributaria, numeric) from public;
grant execute on function create_organization(text, text, text, text, regime_tributario, atividade_tributaria, numeric) to authenticated;

-- A função antiga (4 argumentos) ainda pode existir no Postgres como uma
-- sobrecarga separada — removemos pra não haver ambiguidade de chamada.
drop function if exists create_organization(text, text, text, text);

-- Permite dono/admin atualizarem essas configurações fiscais depois de
-- criada a organização (tela de Configurações).
create or replace function update_regime_tributario(
  p_org_id uuid,
  p_regime_tributario regime_tributario,
  p_atividade_tributaria atividade_tributaria default null,
  p_aliquota_iss numeric default null
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

  update organizations
  set regime_tributario = p_regime_tributario,
      atividade_tributaria = p_atividade_tributaria,
      aliquota_iss = p_aliquota_iss
  where id = p_org_id;
end;
$$;

revoke all on function update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric) from public;
grant execute on function update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric) to authenticated;
