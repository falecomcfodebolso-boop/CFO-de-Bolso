-- =====================================================================
-- MEI — situações especiais (ultrapassagem de limite, desenquadramento
-- retroativo, atraso no DAS)
-- =====================================================================
-- Guarda a data de abertura da atividade (opcional) pra proporcionalizar
-- o limite anual do MEI quando ele foi aberto no meio do ano-calendário.

alter table organizations
  add column data_abertura_atividade date;

create or replace function update_regime_tributario(
  p_org_id uuid,
  p_regime_tributario regime_tributario,
  p_atividade_tributaria atividade_tributaria default null,
  p_aliquota_iss numeric default null,
  p_data_abertura_atividade date default null
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
      aliquota_iss = p_aliquota_iss,
      data_abertura_atividade = p_data_abertura_atividade
  where id = p_org_id;
end;
$$;

revoke all on function update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric, date) from public;
grant execute on function update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric, date) to authenticated;

-- Assinatura antiga (4 argumentos) fica ambígua com a nova — remove.
drop function if exists update_regime_tributario(uuid, regime_tributario, atividade_tributaria, numeric);
