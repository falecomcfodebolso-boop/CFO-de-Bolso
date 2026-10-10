-- =====================================================================
-- QUANTIDADE DE PAPÉIS POR ATIVO
-- =====================================================================
-- Pra cruzar a carteira com a contabilidade (valor_face × quantidade =
-- principal total do papel, que deve bater com o saldo contábil da(s)
-- conta(s) de principal/acruo vinculada(s)), cada Ativo passa a
-- registrar também a quantidade de papéis/cotas que a organização
-- detém — `valor_face` (adicionado na migração 0013) já existe, mas
-- faltava a quantidade pra decompor o valor total do papel.
alter table ativos
  add column if not exists quantidade numeric(18,4);

comment on column ativos.quantidade is
  'Quantidade de papéis/cotas detidos deste ativo (ex: nº de notes de um CLN, nº de cotas de um fundo) — usado junto com valor_face pra cruzar com a contabilidade.';
