-- Fechamento da contabilidade: lançamentos com data até organizations.data_fechamento
-- não podem ser incluídos, alterados nem excluídos (trigger em lancamentos e
-- lancamento_linhas — vale para tela, importação, automação e SQL direto). A importação
-- de extratos também ignora essas transações (lib/import/filtrar-novas.ts) e registra
-- no lote quantas foram ocultadas.
alter table organizations add column if not exists data_fechamento date;
alter table import_lotes add column if not exists ignoradas_ja_lancadas integer not null default 0;
alter table import_lotes add column if not exists ignoradas_periodo_fechado integer not null default 0;

create or replace function trg_bloqueia_periodo_fechado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fech date;
  v_data_old date;
  v_data_new date;
begin
  if tg_table_name = 'lancamentos' then
    select data_fechamento into v_fech from organizations where id = coalesce(new.org_id, old.org_id);
    if tg_op in ('UPDATE', 'DELETE') then v_data_old := old.data; end if;
    if tg_op in ('INSERT', 'UPDATE') then v_data_new := new.data; end if;
  else
    select l.data, o.data_fechamento into v_data_new, v_fech
      from lancamentos l join organizations o on o.id = l.org_id
     where l.id = coalesce(new.lancamento_id, old.lancamento_id);
  end if;

  if v_fech is not null and (v_data_old <= v_fech or v_data_new <= v_fech) then
    raise exception 'Período fechado até %: não é possível incluir, alterar ou excluir lançamentos com data até essa data. Para corrigir, reabra o período em Configurações.', to_char(v_fech, 'DD/MM/YYYY');
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_lancamentos_periodo_fechado on lancamentos;
create trigger trg_lancamentos_periodo_fechado
  before insert or update or delete on lancamentos
  for each row execute function trg_bloqueia_periodo_fechado();

drop trigger if exists trg_linhas_periodo_fechado on lancamento_linhas;
create trigger trg_linhas_periodo_fechado
  before insert or update or delete on lancamento_linhas
  for each row execute function trg_bloqueia_periodo_fechado();

create or replace function set_data_fechamento(p_org_id uuid, p_data date)
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
    raise exception 'Só o dono ou administrador da organização pode fechar ou reabrir períodos.';
  end if;
  update organizations set data_fechamento = p_data where id = p_org_id;
end;
$$;

grant execute on function set_data_fechamento(uuid, date) to authenticated;
