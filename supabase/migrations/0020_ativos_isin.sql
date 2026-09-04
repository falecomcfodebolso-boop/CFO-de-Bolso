-- =====================================================================
-- ISIN DOS ATIVOS — para casar posições lidas de extrato/PDF automaticamente
-- =====================================================================
-- A importação automática de juros acruados a partir do "Statement" do
-- banco/custodiante (tela Ajustes → Importar de PDF) identifica cada papel
-- pelo ISIN, que é a forma mais confiável de casar uma linha do extrato com
-- o Ativo já cadastrado (nomes e grafias variam ligeiramente entre extratos
-- do mesmo papel). Aceita mais de um ISIN por Ativo, separados por vírgula,
-- para o caso raro de uma posição ter sido fracionada em mais de um ISIN
-- (ex.: reestruturação de dívida em default).
alter table ativos add column if not exists isin text;

comment on column ativos.isin is
  'ISIN (ou lista separada por vírgula, para posições fracionadas) usado para casar este '
  'Ativo com uma linha de extrato/PDF importado automaticamente.';

update ativos set isin = data.isin
from (values
  ('1.1.3.001', 'IE0005300805'),
  ('1.1.3.002', 'US91911TAQ67'),
  ('1.1.3.004', 'US71647NBH17'),
  ('1.1.3.005', 'US91911TAH68'),
  ('1.1.3.006', 'XS2998739275'),
  ('1.1.3.007', 'XS3004192327'),
  ('1.1.3.008', 'XS3013020451'),
  ('1.1.3.009', 'IE00BFMXXD54'),
  ('1.1.3.010', 'XS3038531540'),
  ('1.1.3.011', 'US404280BH13'),
  ('1.1.3.012', 'US80282KBJ43'),
  ('1.1.3.015', 'LU1876555100'),
  ('1.1.3.016', 'USP2000TAE57'),
  ('1.1.3.017', 'US86964WAK80'),
  ('1.1.3.019', 'XS3214807482'),
  ('1.1.3.020', 'XS3261878527'),
  ('1.1.3.022', 'US91087BAH33'),
  ('1.1.3.003', 'USL269151217,USL269151134')
) as data(conta_code, isin)
where ativos.org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and ativos.conta_code = data.conta_code;
