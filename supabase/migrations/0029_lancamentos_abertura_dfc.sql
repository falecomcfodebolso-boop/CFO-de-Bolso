-- ---------------------------------------------------------------------
-- Corrige a DFC para lançamentos de "saldo de abertura" (importação em
-- massa de saldos iniciais, incluindo o saldo de Caixa do dia zero).
--
-- Bug: a DFC (método direto) distribui qualquer variação de Caixa de um
-- lançamento proporcionalmente entre as contrapartidas não-caixa do MESMO
-- lançamento, classificando pelo grupo_dfc de cada uma (operacional,
-- investimento, financiamento). Isso é correto para lançamentos normais,
-- mas o lançamento "Saldos de abertura (importação em massa)" (datado
-- 31/12/2025) tem, nas mesmas linhas, o saldo inicial de Caixa (contas
-- 1.1.1.x) E os saldos iniciais de todos os outros ativos/PL — não é uma
-- movimentação de caixa do período, é a fotografia do dia zero. Sem essa
-- marcação, a DFC de qualquer período que inclua 31/12/2025 (ex.: o ano
-- de 2025) rateia esse saldo inicial de Caixa entre "Atividades
-- Operacionais"/"Investimento" como se fossem fluxos reais, gerando
-- valores pequenos e sem sentido econômico nessas linhas.
--
-- Fix: marca lançamentos de abertura com eh_abertura = true, e o código
-- da DFC (lib/accounting/demonstrativos.ts) passa a ignorá-los na hora de
-- ratear Caixa — eles continuam contando normalmente para o Saldo Inicial
-- de Caixa (via saldoInicialCaixa, que soma valor_saldo das contas de
-- Caixa até o dia anterior ao período, independente dessa flag).

alter table lancamentos
  add column eh_abertura boolean not null default false;

update lancamentos
  set eh_abertura = true
  where historico ilike 'Saldos de abertura%' or historico ilike 'Balanço de abertura%';

-- v_movimento_contas passa a expor também eh_abertura (do lançamento) —
-- só acrescenta coluna no final, como já documentado nas migrations
-- 0003 e 0006 (CREATE OR REPLACE VIEW não permite reordenar as
-- existentes).
create or replace view v_movimento_contas
  with (security_invoker = true) as
select
  ll.org_id,
  ll.conta_code,
  pc.name as conta_name,
  pc.natureza,
  l.data,
  l.numero as lancamento_numero,
  l.historico,
  ll.tipo,
  ll.valor,
  case
    when pc.natureza in ('ATIVO','DESPESA') then (case when ll.tipo = 'D' then ll.valor else -ll.valor end)
    else (case when ll.tipo = 'C' then ll.valor else -ll.valor end)
  end as valor_saldo,
  ll.id as lancamento_linha_id,
  ll.lancamento_id,
  pc.circulante,
  pc.is_caixa,
  pc.grupo_dre,
  pc.grupo_dfc,
  l.intercompany_org_id,
  l.eh_abertura
from lancamento_linhas ll
join lancamentos l on l.id = ll.lancamento_id
join plano_de_contas pc on pc.org_id = ll.org_id and pc.code = ll.conta_code;

-- Conferência: deve mostrar o Lçto "Saldos de abertura (importação em
-- massa)" com eh_abertura = true, e nenhum outro lançamento afetado.
select numero, data, historico, eh_abertura
from lancamentos
where org_id = 'ce2b4625-e145-4c04-911b-60ce008cd8c6'
order by numero;
