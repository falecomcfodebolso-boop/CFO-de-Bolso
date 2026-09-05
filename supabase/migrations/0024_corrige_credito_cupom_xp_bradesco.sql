-- Corrige 3 lancamentos de recebimento de cupom (juros) de bonds carregados
-- ate o vencimento (grupo XP/Bradesco), que foram postados creditando a
-- propria conta do ativo (marcando o principal a mercado, incorretamente)
-- em vez de creditar a conta de juros acruados a receber do grupo
-- (1.1.2.006). Bonds held-to-maturity ficam a custo/valor de face na
-- contabilidade; o recebimento de cupom deve reduzir o acruado a receber,
-- nao o principal do titulo.
--
-- Lancamentos afetados (confirmados via SELECT antes desta correcao):
--   #102 - 03/08/2026 - AT&T Inc Global NT      - credito 1.1.4.018 -> 1.1.2.006 (US$ 1.687,50)
--   #105 - 07/08/2026 - Bank Amer Corp          - credito 1.1.4.011 -> 1.1.2.006 (US$ 1.987,00)
--   #107 - 27/08/2026 - Itau Unibanco Holding SA- credito 1.1.4.017 -> 1.1.2.006 (US$ 3.000,00)
update lancamento_linhas ll
set conta_code = '1.1.2.006'
from lancamentos l
where ll.lancamento_id = l.id
  and l.org_id = (select id from organizations where name ilike '%Personal Overseas%' limit 1)
  and l.numero in (102, 105, 107)
  and ll.tipo = 'C'
  and (
    (l.numero = 102 and ll.conta_code = '1.1.4.018' and ll.valor = 1687.50) or
    (l.numero = 105 and ll.conta_code = '1.1.4.011' and ll.valor = 1987.00) or
    (l.numero = 107 and ll.conta_code = '1.1.4.017' and ll.valor = 3000.00)
  );
