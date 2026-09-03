import type { SaldoConta } from "./queries";

/**
 * Sincroniza o valor de itens de controle auxiliar (Carteira de ativos, Dívidas & Passivos) com o
 * saldo real da conta do Plano de Contas vinculada — quando existe um vínculo (`conta_code`) e essa
 * conta já tem algum lançamento. Sem isso, o valor desses cadastros ficava "congelado" no que foi
 * digitado/importado manualmente, e não acompanhava lançamentos feitos depois no Diário.
 *
 * Itens sem `conta_code`, ou vinculados a uma conta que ainda não tem nenhum lançamento (não
 * aparece em v_saldo_contas), mantêm o valor cadastrado manualmente — o vínculo contábil é
 * opcional, não obrigatório.
 *
 * `saldo` em v_saldo_contas já vem normalizado para o lado normal de cada natureza (positivo =
 * aumento do saldo normal, tanto para Ativo/Despesa quanto para Passivo/PL/Receita) — por isso
 * usar o valor absoluto aqui é seguro tanto para ativos (contas ATIVO) quanto para dívidas
 * (contas PASSIVO).
 */
export function sincronizarComSaldoContabil<T extends { conta_code?: string | null; valor_atual: number }>(
  itens: T[],
  saldos: SaldoConta[]
): (T & { sincronizado: boolean })[] {
  const saldoPorConta = new Map(saldos.map((s) => [s.conta_code, s.saldo]));
  return itens.map((item) => {
    const saldo = item.conta_code ? saldoPorConta.get(item.conta_code) : undefined;
    if (saldo !== undefined) {
      return { ...item, valor_atual: Math.abs(Number(saldo)), sincronizado: true };
    }
    return { ...item, sincronizado: false };
  });
}
