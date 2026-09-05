-- ISIN/CUSIP dos 17 títulos do grupo "XP/Bradesco" (contas 1.1.4.002 a
-- 1.1.4.018) — faltava desde a migration 0014 (que só trouxe os dados
-- financeiros papel a papel, sem identificador de mercado). Sem isso, a
-- importação automática de PDF (Ajustes → Importar de PDF e o upload
-- unificado em Importar) só conseguia casar esses papéis por nome
-- (heurística, sujeita a erro), igual ao que já acontecia hoje para juros
-- acruados desse grupo.
--
-- Identificadores extraídos do "Portfolio Holdings" do extrato Bradesco
-- Investments/Pershing (conta 3GM-062156, 31/08/2026) — casados com os
-- Ativos já cadastrados cruzando valor de face, setor (grupo_emissor da
-- migration 0017) e data de cupom (data_pagamento_anterior da migration
-- 0014). A soma dos valores de face bate exatamente com o total de
-- "Corporate Bonds" do extrato (US$ 1.679.000,00), confirmando o casamento.
update ativos set isin = data.isin
from (values
  ('1.1.4.002', 'US71647NBH17'),   -- Petrobras Global Fin BV 5.600% 01/03/31
  ('1.1.4.003', 'US71645WAQ42'),   -- Petrobras Intl Fin Co 6.875% 01/20/40
  ('1.1.4.004', '80282KAP1'),      -- Santander Hldgs USA 4.400% 07/13/27 (CUSIP, sem ISIN)
  ('1.1.4.005', 'USL9412AAB37'),   -- Ultrapar International SA 5.250% 06/06/29
  ('1.1.4.006', 'USP22835AB13'),   -- Axia Energia SA 4.625% 02/04/30
  ('1.1.4.007', '24703TAG1'),      -- Dell Intl LLC/EMC Corp 5.300% 10/01/29 (CUSIP, sem ISIN)
  ('1.1.4.008', '37045VAS9'),      -- General Mtrs Co 5.000% 10/01/28 (CUSIP, sem ISIN)
  ('1.1.4.009', 'USP2000TAE57'),   -- Banco do Brasil SA 6.000% 03/18/31
  ('1.1.4.010', '46647PBD7'),      -- JPMorgan Chase & Co variável 05/06/30 (CUSIP, sem ISIN)
  ('1.1.4.011', '06051GHQ5'),      -- Bank Amer Corp variável 02/07/30 (CUSIP, sem ISIN)
  ('1.1.4.012', '38141GXH2'),      -- Goldman Sachs Group Inc 3.800% 03/15/30 (CUSIP, sem ISIN)
  ('1.1.4.013', '172967ME8'),      -- Citigroup Inc variável 03/20/30 (CUSIP, sem ISIN)
  ('1.1.4.014', '6174468L6'),      -- Morgan Stanley variável 01/22/31 (CUSIP, sem ISIN)
  ('1.1.4.015', '95000U3J0'),      -- Wells Fargo & Co variável 01/23/30 (CUSIP, sem ISIN)
  ('1.1.4.016', 'US05947LBB36'),   -- Banco Bradesco SA Grand Cayman 6.500% 01/22/30
  ('1.1.4.017', 'US46556W2E95'),   -- Itaú Unibanco Holding SA 6.000% 02/27/30 ("Itaú fev2030")
  ('1.1.4.018', '00206RKH4')       -- AT&T Inc Global NT 2.250% 02/01/32 (CUSIP, sem ISIN)
) as data(conta_code, isin)
where ativos.org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and ativos.conta_code = data.conta_code;
