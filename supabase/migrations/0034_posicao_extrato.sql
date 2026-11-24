-- Posição dos ativos conforme o extrato do custodiante (Carteira / Vencimentos).
-- Informativo: não altera a contabilidade (o saldo contábil continua vindo dos lançamentos).
alter table public.ativos
  add column if not exists valor_mercado numeric(18,2),
  add column if not exists juros_acruados_extrato numeric(18,2),
  add column if not exists preco_mercado numeric(18,6),
  add column if not exists data_posicao date,
  add column if not exists fonte_posicao text;

comment on column public.ativos.valor_mercado is 'Valor de mercado LIMPO (sem juros acruados) informado pelo custodiante na data_posicao.';
comment on column public.ativos.juros_acruados_extrato is 'Juros acruados informados pelo custodiante na data_posicao.';
comment on column public.ativos.data_posicao is 'Data-base do último extrato usado para atualizar a posição.';
