-- Gerado a partir de "ANALISE_CARTEIRA_INDICES_RISCO_31_07_2026.xlsx" (planilha
-- da usuária, seção "A) Composição por Grupo de Emissor/Setor"), casado com os
-- Ativos já cadastrados por conta_code.
update ativos set grupo_emissor = data.grupo_emissor, pais_risco = data.pais_risco, estrutura = data.estrutura
from (values
  ('1.1.3.011', 'Bancos globais IG', 'Outros', null),
  ('1.1.3.012', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.004', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.011', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.010', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.014', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.015', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.013', 'Bancos globais IG', 'Outros', null),
  ('1.1.4.012', 'Bancos globais IG', 'Outros', null),
  ('1.1.3.006', 'Bancos globais IG', 'Outros', 'CLN'),
  ('1.1.3.008', 'Bancos globais IG', 'Outros', 'CLN'),
  ('1.1.3.010', 'Bancos globais IG', 'Outros', 'CLN'),
  ('1.1.3.013', 'Bancos globais IG', 'Outros', null),
  ('1.1.3.016', 'Bancos brasileiros', 'Brasil', null),
  ('1.1.4.009', 'Bancos brasileiros', 'Brasil', null),
  ('1.1.4.016', 'Bancos brasileiros', 'Brasil', null),
  ('1.1.4.017', 'Bancos brasileiros', 'Brasil', null),
  ('1.1.3.020', 'Bancos brasileiros', 'Brasil', 'CLN'),
  ('1.1.3.004', 'Estatais/quase-soberanas Brasil', 'Brasil', null),
  ('1.1.4.002', 'Estatais/quase-soberanas Brasil', 'Brasil', null),
  ('1.1.4.003', 'Estatais/quase-soberanas Brasil', 'Brasil', null),
  ('1.1.4.006', 'Estatais/quase-soberanas Brasil', 'Brasil', null),
  ('1.1.3.002', 'Corporativos Brasil', 'Brasil', null),
  ('1.1.3.005', 'Corporativos Brasil', 'Brasil', null),
  ('1.1.3.017', 'Corporativos Brasil', 'Brasil', null),
  ('1.1.4.005', 'Corporativos Brasil', 'Brasil', null),
  ('1.1.3.003', 'Corporativos Brasil', 'Brasil', null),
  ('1.1.4.018', 'Corporativos EUA/México/Outros', 'Outros', null),
  ('1.1.4.007', 'Corporativos EUA/México/Outros', 'Outros', null),
  ('1.1.4.008', 'Corporativos EUA/México/Outros', 'Outros', null),
  ('1.1.3.022', 'Corporativos EUA/México/Outros', 'Outros', null),
  ('1.1.3.014', 'Corporativos EUA/México/Outros', 'Outros', 'CLN'),
  ('1.1.3.007', 'Corporativos EUA/México/Outros', 'Outros', 'CLN'),
  ('1.1.3.001', 'Fundos multimercado/renda variável', 'Outros', null),
  ('1.1.3.009', 'Fundos multimercado/renda variável', 'Outros', null),
  ('1.1.3.015', 'Fundos multimercado/renda variável', 'Outros', null),
  ('1.1.3.019', 'Fundos multimercado/renda variável', 'Outros', null)
) as data(conta_code, grupo_emissor, pais_risco, estrutura)
where ativos.org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and ativos.conta_code = data.conta_code;
