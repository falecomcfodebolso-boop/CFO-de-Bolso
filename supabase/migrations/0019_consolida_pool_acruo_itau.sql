-- =====================================================================
-- CONSOLIDAÇÃO DO POOL DE CONTAS DE ACRUO "ITAÚ — DEMAIS POSIÇÕES"
-- =====================================================================
-- A divisão do acruo do Itaú em várias contas (migração 0013/0014) deixou o
-- grupo "Itaú — demais posições" com duas contas em pool (1.1.2.001 e
-- 1.1.2.005, e do lado da receita 4.1.001 e 4.1.005). O lançamento de ajuste
-- mensal (registrarAjusteAction) sempre lança a diferença inteira na
-- primeira conta da lista — nunca na segunda — então toda a movimentação
-- desde a divisão caiu em 1.1.2.001/4.1.001, enquanto 1.1.2.005/4.1.005
-- ficaram congeladas com o saldo herdado da conta única original. Isso
-- levou 1.1.2.001 a ficar negativa (o total do pool continuava batendo com
-- o extrato do banco, só a distribuição interna entre as duas contas que
-- estava errada).
--
-- A reclassificação contábil que zera as contas .005 e consolida tudo em
-- .001 é feita via SQL ad-hoc diretamente no Supabase (não faz sentido
-- reproduzir como parte da migração, já que o valor exato depende do saldo
-- vigente no momento). Esta migração cuida só da parte estrutural: volta os
-- Ativos do grupo a apontar para uma conta só (sem pool), evitando que o
-- mesmo problema se repita.
update ativos
set conta_acruo_code = '1.1.2.001',
    conta_receita_code = '4.1.001'
where org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and conta_acruo_code = '1.1.2.001,1.1.2.005';
