-- =====================================================================
-- CORREÇÃO: data do lançamento de abertura do exercício 2026
-- =====================================================================
-- O lançamento "Balanço de abertura do exercício 2026 (saldos reportados
-- em 31/12/2025)" foi registrado com data 01/01/2026 — um dia depois do
-- que ele efetivamente representa. Como todo relatório (Balanço, DRE
-- etc.) filtra movimentos até a data escolhida, pedir a posição em
-- 31/12/2025 não encontrava nenhum lançamento (o mais antigo era do dia
-- seguinte), fazendo a comparação aparecer vazia ("—") mesmo havendo
-- saldo de abertura. Este UPDATE redata o lançamento para 31/12/2025,
-- para que a data bata com o que ele representa.
update lancamentos set data = '2025-12-31'::date
where org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and numero = 1
  and historico ilike 'Balanço de abertura%';
