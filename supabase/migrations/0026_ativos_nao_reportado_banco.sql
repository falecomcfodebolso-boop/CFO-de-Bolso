-- Marca papéis cujo acruo interno (30/360) não tem contrapartida no valor
-- informado pelo banco/custodiante em um dado mês — hoje isso acontece com
-- notas fixed-to-floating (ex.: JPM, Bank Amer, Citigroup, Morgan Stanley,
-- Wells Fargo no grupo XP/Bradesco) enquanto ainda estão no período de taxa
-- fixa: o banco não reporta juros acruado pra elas no extrato, mas o cálculo
-- interno segue estimando um valor com a taxa de cupom cadastrada. Isso
-- inflava a comparação "Calculado (interno) vs. Informado pelo banco" com
-- uma diferença que não é erro — ver app/(app)/ajustes/page.tsx.
--
-- Esse campo é setado manualmente (não há como derivar automaticamente,
-- porque o valor do banco só vem como um agregado por grupo, sem detalhe
-- por papel) sempre que um papel ficar comprovadamente de fora do que o
-- banco reporta naquele fechamento.
alter table ativos
  add column if not exists acruo_nao_reportado_banco boolean not null default false;
