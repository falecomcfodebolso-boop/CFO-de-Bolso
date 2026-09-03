-- =====================================================================
-- CORREÇÃO: duplicidade no saldo de abertura de Juros Acruados - Itaú
-- =====================================================================
-- A planilha "Juros Acruados 31072026.xlsx" (detalhamento papel a papel)
-- confirma: o saldo de abertura (31/12/2025) do Grupo 1 — CLN HSBC, CLN
-- ARC MITTAL e CLN BRADESCO — era de US$ 7.600,14, e esse valor estava
-- embutido dentro do saldo de abertura genérico da conta "1.1.2.001 -
-- Juros Acruados a Receber - Itaú (posições com cupom periódico)"
-- (US$ 41.950,00). Quando cada CLN do Grupo 1 foi reconhecido
-- individualmente durante o exercício (contas 1.1.2.002/003/004), esse
-- valor original não foi retirado de 1.1.2.001 — ficando contado duas
-- vezes. Isso bate exatamente com a diferença de US$ 7.600,14 encontrada
-- ao comparar o saldo contábil combinado de 1.1.2.001+1.1.2.005 (US$
-- 20.728,18) contra o extrato consolidado do Itaú para esse mesmo grupo
-- (US$ 13.128,04).
--
-- Este lançamento remove a duplicidade: credita 1.1.2.001 (reduzindo o
-- Ativo em duplicidade) e debita a mesma conta de Patrimônio Líquido que
-- recebeu o crédito original do saldo de abertura (Reserva de Capital -
-- Itaú), preservando o balanceamento do Balanço Patrimonial.
select create_lancamento(
  (select id from organizations where name ilike '%Personal Overseas%' limit 1),
  (select coalesce(max(numero), 0) + 1 from lancamentos
     where org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)),
  '2026-07-31'::date,
  'Correção histórica: eliminação de duplicidade no saldo de abertura de Juros Acruados - Itaú (Grupo 1 CLN HSBC/ARC MITTAL/BRADESCO reconhecido individualmente durante o exercício, mas não removido do saldo genérico de abertura). Ver planilha Juros Acruados 31072026.xlsx.',
  '[{"conta_code":"3.2.001","tipo":"D","valor":7600.14},{"conta_code":"1.1.2.001","tipo":"C","valor":7600.14}]'::jsonb,
  null
);
