-- =====================================================================
-- FIX: contas de RECEITA com "juros" no nome caindo em Receita Bruta
-- =====================================================================
-- A heurística original só reconhecia "juros ativ" / "juros recebid"
-- como Receita Financeira, então contas como "Receita Juros - Itaú /
-- CLN HSBC (Grupo 1)" não batiam o padrão e caíam por padrão em
-- Receita Bruta na DRE — o que é enganoso para uma holding cuja
-- receita é, em essência, toda financeira (juros/rendimentos de
-- carteira). A heurística em lib/accounting/classificacao.ts já foi
-- ampliada para reconhecer "juros" de forma mais geral; este UPDATE
-- reclassifica as contas existentes de acordo com a regra nova.
update plano_de_contas set
  grupo_dre = case
    when name ~* 'juros|rendimento|receita financeira' then 'receitas_financeiras'
    when name ~* 'devolu|imposto sobre vendas|icms sobre vendas|iss sobre|pis sobre|cofins sobre|abatimento' then 'deducoes'
    else 'receita_bruta'
  end
where natureza = 'RECEITA';
