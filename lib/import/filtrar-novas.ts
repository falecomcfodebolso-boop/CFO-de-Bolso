import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransacaoExtraida } from "./parsers";

export type ResultadoFiltro = {
  novas: TransacaoExtraida[];
  jaLancadas: number;
  periodoFechado: number;
  dataFechamento: string | null;
};

/**
 * Deixa só o que ainda precisa ser contabilizado num extrato:
 *  - descarta transações com data até a data de fechamento da organização
 *    (período fechado — o banco também recusa lançar nelas);
 *  - descarta transações que já estão no Diário: mesma data, mesma conta
 *    bancária, mesmo lado (entrada = débito no banco) e mesmo valor. Conta
 *    ocorrências, então duas transações iguais no mesmo dia só somem se
 *    houver dois lançamentos iguais.
 * Extratos "acumulados" (ex.: tela do internet banking com meses de histórico)
 * passam a gerar só as transações novas.
 */
export async function filtrarTransacoesNovas(
  supabase: SupabaseClient,
  orgId: string,
  contaBancariaCode: string,
  transacoes: TransacaoExtraida[]
): Promise<ResultadoFiltro> {
  const { data: org } = await supabase.from("organizations").select("data_fechamento").eq("id", orgId).maybeSingle();
  const dataFechamento = (org?.data_fechamento as string | null) ?? null;

  const abertas = dataFechamento ? transacoes.filter((t) => t.data > dataFechamento) : transacoes;
  const periodoFechado = transacoes.length - abertas.length;
  if (abertas.length === 0) return { novas: [], jaLancadas: 0, periodoFechado, dataFechamento };

  const datas = abertas.map((t) => t.data).sort();
  const { data: movs, error } = await supabase
    .from("v_movimento_contas")
    .select("data, tipo, valor")
    .eq("org_id", orgId)
    .eq("conta_code", contaBancariaCode)
    .gte("data", datas[0])
    .lte("data", datas[datas.length - 1]);
  if (error) throw error;

  const chave = (data: string, tipo: string, valor: number) => `${data}|${tipo}|${Math.abs(valor).toFixed(2)}`;
  const existentes = new Map<string, number>();
  for (const m of movs ?? []) {
    const k = chave(m.data as string, m.tipo as string, Number(m.valor));
    existentes.set(k, (existentes.get(k) ?? 0) + 1);
  }

  const novas: TransacaoExtraida[] = [];
  let jaLancadas = 0;
  for (const t of abertas) {
    const k = chave(t.data, t.valor > 0 ? "D" : "C", t.valor);
    const n = existentes.get(k) ?? 0;
    if (n > 0) {
      existentes.set(k, n - 1);
      jaLancadas++;
    } else {
      novas.push(t);
    }
  }
  return { novas, jaLancadas, periodoFechado, dataFechamento };
}
