-- Gerado a partir de "Juros Acruados 31072026.xlsx" (planilha detalhada da
-- usuária, papel a papel), casado com os Ativos já cadastrados por conta_code.
-- Ativos sem posição relevante para acruo na data desta migração (fundos
-- marcados a mercado, CLN em default, discount note, posição vencida) também
-- recebem a categoria correspondente, para que o cálculo sempre retorne zero
-- corretamente em vez de ficar sem classificação.
update ativos set
  valor_face = data.valor_face,
  categoria_acruo = data.categoria_acruo,
  tipo_taxa = data.tipo_taxa,
  indice_referencia = data.indice_referencia,
  spread_taxa = data.spread_taxa,
  taxa_referencia_atual = data.taxa_referencia_atual,
  data_pagamento_anterior = data.data_pagamento_anterior,
  data_inicio_acruo = data.data_inicio_acruo,
  pendente_custodiante = data.pendente_custodiante,
  conta_acruo_code = data.conta_acruo_code,
  conta_receita_code = data.conta_receita_code,
  grupo_acruo_nome = data.grupo_acruo_nome
from (values
  ('1.1.3.001', 117600.0, 'mercado', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.002', 235000.0, 'periodico', 'fixa', null, null, null, '2026-07-08'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.003', 30800.0, 'defaulted', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.004', 235000.0, 'periodico', 'fixa', null, null, null, '2026-07-03'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.005', 110000.0, 'periodico', 'fixa', null, null, null, '2026-05-21'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.006', 50000.0, 'continuo', 'fixa', null, null, null, null::date, '2025-01-31'::date, false, '1.1.2.002', '4.1.002', 'CLN HSBC (Grupo 1)'),
  ('1.1.3.007', 100000.0, 'continuo', 'fixa', null, null, null, null::date, '2025-02-07'::date, false, '1.1.2.003', '4.1.003', 'CLN ARC MITTAL (Grupo 1)'),
  ('1.1.3.008', 100000.0, 'periodico', 'fixa', null, null, null, '2026-07-07'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.009', 11300.0, 'mercado', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.010', 200000.0, 'periodico', 'flutuante', 'SOFR', 0.015, 0.0353, '2026-07-09'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.011', 200000.0, 'periodico', 'fixa', null, null, null, '2026-05-23'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.012', 200000.0, 'periodico', 'fixa', null, null, null, '2026-07-09'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.013', 240000.0, 'desconto', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.014', 190000.0, 'periodico', 'flutuante', 'SOFR', 0.0168, 0.0353, '2026-07-09'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.015', 151900.0, 'mercado', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.016', 200000.0, 'periodico', 'fixa', null, null, null, '2026-03-18'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.017', 240000.0, 'periodico', 'fixa', null, null, null, '2026-07-15'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.018', 0.0, 'vencido', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.019', 97700.0, 'mercado', 'fixa', null, null, null, null::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.3.020', 200000.0, 'continuo', 'fixa', null, null, null, null::date, '2025-12-19'::date, false, '1.1.2.004', '4.1.004', 'CLN BRADESCO (Grupo 1)'),
  ('1.1.3.022', 200000.0, 'periodico', 'fixa', null, null, null, '2026-04-16'::date, null::date, false, '1.1.2.001,1.1.2.005', '4.1.001,4.1.005', 'Itaú — demais posições'),
  ('1.1.4.002', 85000.0, 'periodico', 'fixa', null, null, null, '2026-07-03'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.003', 85000.0, 'periodico', 'fixa', null, null, null, '2026-07-20'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.004', 100000.0, 'periodico', 'fixa', null, null, null, '2026-07-13'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.005', 140000.0, 'periodico', 'fixa', null, null, null, '2026-06-06'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.006', 145000.0, 'periodico', 'fixa', null, null, null, '2026-02-04'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.007', 95000.0, 'periodico', 'fixa', null, null, null, '2026-04-01'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.008', 100000.0, 'periodico', 'fixa', null, null, null, '2026-04-01'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.009', 125000.0, 'periodico', 'fixa', null, null, null, '2026-03-18'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.010', 100000.0, 'periodico', 'fixa', null, null, null, '2026-05-06'::date, null::date, true, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.011', 100000.0, 'periodico', 'fixa', null, null, null, '2026-02-07'::date, null::date, true, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.012', 50000.0, 'periodico', 'fixa', null, null, null, '2026-03-15'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.013', 50000.0, 'periodico', 'fixa', null, null, null, '2026-03-20'::date, null::date, true, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.014', 105000.0, 'periodico', 'fixa', null, null, null, '2026-07-22'::date, null::date, true, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.015', 68000.0, 'periodico', 'fixa', null, null, null, '2026-07-23'::date, null::date, true, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.016', 81000.0, 'periodico', 'fixa', null, null, null, '2026-07-22'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.017', 100000.0, 'periodico', 'fixa', null, null, null, '2026-02-27'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco'),
  ('1.1.4.018', 150000.0, 'periodico', 'fixa', null, null, null, '2026-02-01'::date, null::date, false, '1.1.2.006', '4.2.001', 'XP/Bradesco')
) as data(conta_code, valor_face, categoria_acruo, tipo_taxa, indice_referencia, spread_taxa,
           taxa_referencia_atual, data_pagamento_anterior, data_inicio_acruo, pendente_custodiante,
           conta_acruo_code, conta_receita_code, grupo_acruo_nome)
where ativos.org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and ativos.conta_code = data.conta_code;
