-- As contas de Ativo Não Circulante passam a viver sob o prefixo "1.2"
-- (convenção usual do plano de contas brasileiro: 1.1 = Ativo Circulante,
-- 1.2 = Ativo Não Circulante), em vez de ficarem misturadas em "1.1.3.*" /
-- "1.1.4.*" diferenciadas só pelo flag `circulante = false` (como foi
-- feito na reclassificação de 2026-10, migração ad-hoc fora do versionado
-- porque dependia de org_id específico).
--
-- Cria os grupos espelho:
--   1.2       ATIVO NÃO CIRCULANTE
--   1.2.3     Aplicações Financeiras - Banco Itaú (longo prazo)
--   1.2.4     Aplicações Financeiras - Banco Bradesco/XP (longo prazo)
-- e move pra lá toda conta de ATIVO hoje marcada `circulante = false` sob
-- "1.1.3.*" ou "1.1.4.*", preservando o último segmento do código (ex.:
-- 1.1.3.006 -> 1.2.3.006) pra manter rastreabilidade com os saldos
-- históricos.
--
-- Não há FK no banco amarrando conta_code a plano_de_contas.code — por
-- isso a renumeração precisa ser propagada manualmente pra toda tabela
-- que guarda uma cópia do código: lancamento_linhas (lançamentos
-- históricos), ativos (vínculo do papel com a conta) e import_transacoes
-- (sugestão/confirmação de conta num lote de importação já revisado).
-- "Juros Acruados a Receber" (1.1.2.*) fica onde está, mesmo pros papéis
-- de longo prazo — o recebível do próximo cupom é de ciclo curto
-- independente do prazo do principal, então continua Ativo Circulante.

do $$
declare
  v_org record;
begin
  for v_org in select distinct org_id from plano_de_contas where natureza = 'ATIVO' loop
    insert into plano_de_contas (org_id, code, name, natureza, parent_code, is_leaf, circulante, is_caixa, grupo_dfc)
    values
      (v_org.org_id, '1.2', 'ATIVO NÃO CIRCULANTE', 'ATIVO', null, false, false, false, 'investimento'),
      (v_org.org_id, '1.2.3', 'Aplicações Financeiras - Banco Itaú (longo prazo, subconta por ativo)', 'ATIVO', null, false, false, false, 'investimento'),
      (v_org.org_id, '1.2.4', 'Aplicações Financeiras - Banco Bradesco/XP (longo prazo, subconta por ativo)', 'ATIVO', null, false, false, false, 'investimento')
    on conflict (org_id, code) do nothing;
  end loop;
end $$;

-- Sem tabela temporária de propósito: colado no SQL Editor do Supabase, um
-- script com vários statements não tem garantia de rodar tudo na mesma
-- sessão (pooling), então uma tabela temporária criada num statement pode
-- não existir mais no statement seguinte. Em vez disso, cada UPDATE abaixo
-- recalcula o mapeamento na hora com a mesma subquery, lendo sempre da
-- plano_de_contas — por isso a ordem importa: os quatro primeiros UPDATEs
-- (que ainda dependem do código ANTIGO) têm que rodar antes do UPDATE que
-- renomeia a própria plano_de_contas, que fica por último.
update lancamento_linhas ll
set conta_code = m.code_novo
from (
  select org_id, code as code_antigo,
         case when code like '1.1.3.%' then '1.2.3.' || right(code, 3)
              when code like '1.1.4.%' then '1.2.4.' || right(code, 3) end as code_novo
  from plano_de_contas
  where natureza = 'ATIVO' and circulante = false and (code like '1.1.3.%' or code like '1.1.4.%')
) m
where ll.org_id = m.org_id and ll.conta_code = m.code_antigo;

update ativos a
set conta_code = m.code_novo
from (
  select org_id, code as code_antigo,
         case when code like '1.1.3.%' then '1.2.3.' || right(code, 3)
              when code like '1.1.4.%' then '1.2.4.' || right(code, 3) end as code_novo
  from plano_de_contas
  where natureza = 'ATIVO' and circulante = false and (code like '1.1.3.%' or code like '1.1.4.%')
) m
where a.org_id = m.org_id and a.conta_code = m.code_antigo;

update import_transacoes it
set conta_sugerida = m.code_novo
from (
  select org_id, code as code_antigo,
         case when code like '1.1.3.%' then '1.2.3.' || right(code, 3)
              when code like '1.1.4.%' then '1.2.4.' || right(code, 3) end as code_novo
  from plano_de_contas
  where natureza = 'ATIVO' and circulante = false and (code like '1.1.3.%' or code like '1.1.4.%')
) m
where it.org_id = m.org_id and it.conta_sugerida = m.code_antigo;

update import_transacoes it
set conta_confirmada = m.code_novo
from (
  select org_id, code as code_antigo,
         case when code like '1.1.3.%' then '1.2.3.' || right(code, 3)
              when code like '1.1.4.%' then '1.2.4.' || right(code, 3) end as code_novo
  from plano_de_contas
  where natureza = 'ATIVO' and circulante = false and (code like '1.1.3.%' or code like '1.1.4.%')
) m
where it.org_id = m.org_id and it.conta_confirmada = m.code_antigo;

update plano_de_contas pc
set code = m.code_novo
from (
  select org_id, code as code_antigo,
         case when code like '1.1.3.%' then '1.2.3.' || right(code, 3)
              when code like '1.1.4.%' then '1.2.4.' || right(code, 3) end as code_novo
  from plano_de_contas
  where natureza = 'ATIVO' and circulante = false and (code like '1.1.3.%' or code like '1.1.4.%')
) m
where pc.org_id = m.org_id and pc.code = m.code_antigo;
