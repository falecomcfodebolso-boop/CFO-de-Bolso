-- =====================================================================
-- PERIODICIDADE DO CUPOM (para a tela Previsao de Pagamentos)
-- =====================================================================
-- Guarda a frequencia de pagamento do cupom de cada ativo de renda fixa
-- de categoria "periodico" (os demais - continuo/mercado/defaulted/
-- desconto/vencido - nao tem cronograma de cupom previsivel). Usado
-- apenas para projetar a agenda de pagamentos futuros (fluxo de caixa);
-- nao afeta nenhum lancamento contabil.
alter table ativos
  add column if not exists periodicidade_cupom text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ativos_periodicidade_cupom_check'
  ) then
    alter table ativos
      add constraint ativos_periodicidade_cupom_check
        check (periodicidade_cupom is null or periodicidade_cupom in (
          'mensal', 'trimestral', 'semestral', 'anual'
        ));
  end if;
end $$;

comment on column ativos.periodicidade_cupom is
  'Frequencia de pagamento do cupom (so para categoria_acruo = periodico): mensal, trimestral, semestral ou anual. '
  'Usado para projetar a tela Previsao de Pagamentos a partir de data_pagamento_anterior. Null = ainda nao informado.';
