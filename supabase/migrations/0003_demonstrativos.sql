-- =====================================================================
-- DEMONSTRAÇÕES FINANCEIRAS (DRE, Balanço Patrimonial, DFC, DMPL)
-- =====================================================================
-- Para gerar as demonstrações a partir do Diário/Razão existentes,
-- cada conta do Plano de Contas passa a carregar uma classificação
-- extra, além da natureza (ATIVO/PASSIVO/PL/RECEITA/DESPESA/CONTROLE):
--
--   circulante   -- para ATIVO/PASSIVO: separa curto de longo prazo
--                    no Balanço Patrimonial. Null para as demais naturezas.
--   is_caixa     -- marca contas de "Caixa e Equivalentes de Caixa"
--                    (usadas como ponto de partida da DFC).
--   grupo_dre    -- para RECEITA/DESPESA: em qual linha da DRE a conta entra.
--   grupo_dfc    -- para todas exceto CONTROLE: se o movimento de caixa
--                    ligado a essa conta é operacional, de investimento
--                    ou de financiamento (método direto da DFC).
--
-- Contas novas recebem esses valores automaticamente (heurística por
-- nome, replicada em lib/accounting/classificacao.ts) no momento da
-- criação. Este UPDATE aplica a mesma heurística nas contas que já
-- existiam antes desta migração.
-- =====================================================================

alter table plano_de_contas
  add column if not exists circulante boolean,
  add column if not exists is_caixa boolean not null default false,
  add column if not exists grupo_dre text,
  add column if not exists grupo_dfc text;

alter table plano_de_contas
  add constraint plano_de_contas_grupo_dre_check
    check (grupo_dre is null or grupo_dre in (
      'receita_bruta', 'deducoes', 'custos', 'despesas_operacionais',
      'receitas_financeiras', 'despesas_financeiras', 'impostos_sobre_lucro',
      'outras_receitas_despesas'
    ));

alter table plano_de_contas
  add constraint plano_de_contas_grupo_dfc_check
    check (grupo_dfc is null or grupo_dfc in ('operacional', 'investimento', 'financiamento'));

-- ---------------------------------------------------------------------
-- Backfill heurístico das contas já existentes (baseado no nome)
-- ---------------------------------------------------------------------

update plano_de_contas set
  is_caixa = (name ~* 'caixa|banco|conta corrente|conta movimento|equivalentes de caixa|aplicaç|cdb|poupança'),
  circulante = not (name ~* 'imobilizado|intangível|investimento perman|imóve|veículo|máquina|equipamento|participaç societ|depreciação acumulada')
where natureza = 'ATIVO';

update plano_de_contas set
  grupo_dfc = case
    when is_caixa then null
    when not circulante then 'investimento'
    else 'operacional'
  end
where natureza = 'ATIVO';

update plano_de_contas set
  circulante = not (name ~* 'empréstimo de longo prazo|financiamento de longo prazo|financiamento lp|empréstimo lp')
where natureza = 'PASSIVO';

update plano_de_contas set
  grupo_dfc = case when not circulante then 'financiamento' else 'operacional' end
where natureza = 'PASSIVO';

update plano_de_contas set grupo_dfc = 'financiamento' where natureza = 'PL';

update plano_de_contas set
  grupo_dre = case
    when name ~* 'juros ativ|rendimento|receita financeira|juros recebid' then 'receitas_financeiras'
    when name ~* 'devolu|imposto sobre vendas|icms sobre vendas|iss sobre|pis sobre|cofins sobre|abatimento' then 'deducoes'
    else 'receita_bruta'
  end,
  grupo_dfc = 'operacional'
where natureza = 'RECEITA';

update plano_de_contas set
  grupo_dre = case
    when name ~* 'irpj|csll|imposto de renda|contribuição social sobre' then 'impostos_sobre_lucro'
    when name ~* 'juros pass|juros de empr|despesa financeira|iof|tarifa banc|encargo financeiro' then 'despesas_financeiras'
    when name ~* 'custo da merc|cmv|custo do servi|csp|custo de produ|cpv' then 'custos'
    else 'despesas_operacionais'
  end,
  grupo_dfc = 'operacional'
where natureza = 'DESPESA';

-- ---------------------------------------------------------------------
-- v_movimento_contas passa a expor também lancamento_id (para agrupar
-- linhas do mesmo lançamento na DFC) e a classificação da conta.
-- CREATE OR REPLACE mantém as colunas antigas e só acrescenta novas —
-- v_saldo_contas, que faz SELECT explícito, não é afetada.
-- ---------------------------------------------------------------------

-- CREATE OR REPLACE VIEW só permite ACRESCENTAR colunas no final da
-- lista (não reordenar nem renomear as existentes) — por isso as
-- colunas originais (org_id ... valor_saldo) mantêm exatamente a mesma
-- ordem de antes, e as novas colunas vêm todas depois de valor_saldo.
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
  pc.grupo_dfc
from lancamento_linhas ll
join lancamentos l on l.id = ll.lancamento_id
join plano_de_contas pc on pc.org_id = ll.org_id and pc.code = ll.conta_code;
