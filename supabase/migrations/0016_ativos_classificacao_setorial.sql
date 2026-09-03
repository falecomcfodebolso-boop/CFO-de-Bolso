-- =====================================================================
-- CLASSIFICAÇÃO SETORIAL/PAÍS/ESTRUTURA DOS ATIVOS (Carteira)
-- =====================================================================
-- Para reproduzir as análises de concentração por setor/emissor, risco-país
-- e exposição a estruturas complexas (CLNs) que a usuária mantinha em
-- planilha, cada Ativo passa a carregar uma classificação adicional.
alter table ativos
  add column if not exists grupo_emissor text,
  add column if not exists pais_risco text,
  add column if not exists estrutura text,
  add column if not exists moeda text not null default 'USD';

comment on column ativos.grupo_emissor is
  'Rótulo do grupo de emissor/setor para agrupar a exibição na tela Carteira (ex: "Bancos globais IG").';
comment on column ativos.pais_risco is
  'País de risco de crédito predominante do emissor (ex: "Brasil", "Outros") — usado para medir concentração de risco-país.';
comment on column ativos.estrutura is
  'Estrutura do instrumento quando relevante (ex: "CLN" para Credit Linked Notes) — usado para medir exposição a estruturas complexas.';
