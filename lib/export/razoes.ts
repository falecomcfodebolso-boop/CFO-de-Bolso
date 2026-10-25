import type { SupabaseClient } from "@supabase/supabase-js";
import { getMovimentoTodasContas } from "@/lib/accounting/queries";
import type { LinhaMovimento } from "@/lib/export/excel";

export type MovimentoConta = {
  conta_code: string;
  conta_name: string;
  data: string;
  lancamento_numero: number | string;
  historico: string;
  tipo: "D" | "C";
  valor: number;
  valor_saldo: number;
};

export type RazaoConta = { contaCode: string; contaLabel: string; movimentos: LinhaMovimento[] };

/**
 * Razão detalhado de todas as contas com movimento em [inicio, fim]. Busca tudo até `fim`
 * numa query só para calcular o saldo corrido de cada conta desde o começo, e filtra para
 * o período só na hora de montar as linhas — usado pela exportação de Razões e pelo
 * relatório geral.
 */
export async function getRazoesDetalhados(
  supabase: SupabaseClient,
  orgId: string,
  inicio: string,
  fim: string
): Promise<RazaoConta[]> {
  const todosMovimentos = (await getMovimentoTodasContas(supabase, orgId, fim)) as MovimentoConta[];

  const porConta = new Map<string, MovimentoConta[]>();
  for (const m of todosMovimentos) {
    if (!porConta.has(m.conta_code)) porConta.set(m.conta_code, []);
    porConta.get(m.conta_code)!.push(m);
  }

  const contas: RazaoConta[] = [];
  for (const [contaCode, movs] of Array.from(porConta.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    let saldoCorrido = 0;
    const comSaldo = movs.map((m) => {
      saldoCorrido += Number(m.valor_saldo);
      return { ...m, saldoCorrido };
    });
    const doPeriodo = comSaldo.filter((m) => m.data >= inicio && m.data <= fim);
    if (doPeriodo.length === 0) continue;

    contas.push({
      contaCode,
      contaLabel: `${contaCode} — ${movs[0].conta_name}`,
      movimentos: doPeriodo.map((m) => ({
        data: m.data,
        lancamentoNumero: m.lancamento_numero,
        historico: m.historico,
        tipo: m.tipo,
        valor: Number(m.valor),
        saldoCorrido: m.saldoCorrido,
      })),
    });
  }
  return contas;
}

/** Remove caracteres que o Excel proíbe em nome de aba e garante nomes únicos (inclusive contra `jaUsados`). */
export function nomesDeAbaUnicos(codigos: string[], jaUsados: Iterable<string> = []): Map<string, string> {
  const usados = new Set<string>(jaUsados);
  const porCodigo = new Map<string, string>();
  for (const codigo of codigos) {
    const base = codigo.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
    let nome = base;
    let sufixo = 2;
    while (usados.has(nome)) {
      nome = `${base.slice(0, 28)}-${sufixo}`;
      sufixo++;
    }
    usados.add(nome);
    porCodigo.set(codigo, nome);
  }
  return porCodigo;
}
