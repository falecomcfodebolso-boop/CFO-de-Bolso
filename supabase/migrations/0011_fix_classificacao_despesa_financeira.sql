-- =====================================================================
-- FIX: contas de DESPESA "Despesas Financeiras..." caindo em Operacional
-- =====================================================================
-- Mesmo problema da migração anterior (0010), agora do lado da despesa:
-- a heurística procurava a string "despesa financeira" no singular, que
-- não bate com "Despesas Financeiras e Perdas" (plural) — o nome mais
-- comum usado no plano de contas — então essas contas caíam por padrão
-- em Despesas Operacionais em vez de Despesas Financeiras. A heurística
-- em lib/accounting/classificacao.ts já foi corrigida para aceitar
-- singular ou plural; este UPDATE reclassifica as contas existentes.
update plano_de_contas set
  grupo_dre = case
    when name ~* 'irpj|csll|imposto de renda|contribuição social sobre' then 'impostos_sobre_lucro'
    when name ~* 'juros pass|juros de empr|despesas? financeir|iof|tarifa banc|encargo financeiro' then 'despesas_financeiras'
    when name ~* 'custo da merc|cmv|custo do servi|csp|custo de produ|cpv' then 'custos'
    else 'despesas_operacionais'
  end
where natureza = 'DESPESA';
