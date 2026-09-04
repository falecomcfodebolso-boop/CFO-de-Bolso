-- =====================================================================
-- MARCAÇÃO A MERCADO — fundos de renda variável (categoria_acruo = 'mercado')
-- =====================================================================
-- Os Ativos de categoria 'mercado' (fundos e posições sem cronograma de
-- cupom — Pimco, Vanguard SP 500, Oaktree, CP Note GLD) não geram juros
-- acruado: seu valor contábil é o próprio principal, marcado a mercado
-- periodicamente contra o valor informado pelo relatório/valuation
-- statement do custodiante. Esta migração cria a estrutura equivalente à
-- de Ajustes de Acruamento (ajustes_acruo), só que pro principal desses
-- fundos em vez dos juros — com o mesmo fluxo de aprovação em dois passos
-- (registrar apuração, depois "Lançar no Diário").
--
-- Cada fundo tem sua própria conta de ganho/perda dedicada (em vez de uma
-- pool compartilhada), pro DRE mostrar o resultado de cada posição
-- separadamente — decisão explícita da usuária, evitando o mesmo problema
-- de contas compartilhadas que gerou o bug corrigido na migração 0019.

create table ajustes_marcacao_mercado (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ativo_id uuid not null references ativos(id) on delete cascade,
  conta_ativo_code text not null,
  conta_ganho_perda_code text not null,
  nome_ativo text not null,
  data_base date not null,
  valor_reportado_mercado numeric(18,2) not null,
  saldo_contabil_antes numeric(18,2) not null,
  diferenca numeric(18,2) not null,
  fonte text,
  observacoes text,
  lancamento_id uuid references lancamentos(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_ajustes_mtm_org on ajustes_marcacao_mercado(org_id);
create index idx_ajustes_mtm_ativo on ajustes_marcacao_mercado(org_id, ativo_id);

alter table ajustes_marcacao_mercado enable row level security;

create policy ajustes_mtm_select on ajustes_marcacao_mercado
  for select using (is_org_member(org_id));

create policy ajustes_mtm_write on ajustes_marcacao_mercado
  for all using (has_write_role(org_id))
  with check (has_write_role(org_id));

-- Vínculo de cada Ativo 'mercado' com sua conta de ganho/perda dedicada.
alter table ativos add column if not exists conta_ganho_perda_mercado_code text;

comment on column ativos.conta_ganho_perda_mercado_code is
  'Conta de RECEITA (ganho/perda com marcação a mercado) usada como contrapartida do ajuste '
  'do principal deste Ativo — só se aplica a categoria_acruo = ''mercado''.';

-- Contas de ganho/perda com marcação a mercado, uma por fundo.
insert into plano_de_contas (org_id, code, name, natureza, parent_code, is_leaf)
select id, '4.3', 'Ganho/Perda com Marcação a Mercado - Itaú', 'RECEITA', '4', false
from organizations where name ilike '%Personal Overseas%'
on conflict (org_id, code) do nothing;

insert into plano_de_contas (org_id, code, name, natureza, parent_code, is_leaf)
select o.id, d.code, d.name, 'RECEITA', '4.3', true
from organizations o
cross join (values
  ('4.3.001', 'Ganho/Perda com Marcação a Mercado - Pimco Us Hy Bond Fund'),
  ('4.3.002', 'Ganho/Perda com Marcação a Mercado - Vanguard SP 500'),
  ('4.3.003', 'Ganho/Perda com Marcação a Mercado - Oaktree Fund'),
  ('4.3.004', 'Ganho/Perda com Marcação a Mercado - CP Note GLD')
) as d(code, name)
where o.name ilike '%Personal Overseas%'
on conflict (org_id, code) do nothing;

update ativos set conta_ganho_perda_mercado_code = data.conta_ganho_perda_code
from (values
  ('1.1.3.001', '4.3.001'),
  ('1.1.3.009', '4.3.002'),
  ('1.1.3.015', '4.3.003'),
  ('1.1.3.019', '4.3.004')
) as data(conta_code, conta_ganho_perda_code)
where ativos.org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and ativos.conta_code = data.conta_code;
