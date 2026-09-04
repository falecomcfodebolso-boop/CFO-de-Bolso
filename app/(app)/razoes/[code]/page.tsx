import { requireOrgContext } from "@/lib/org";
import { getMovimentoConta } from "@/lib/accounting/queries";
import { periodoAnterior } from "@/lib/accounting/analise";
import { fmtDate, fmtMoney } from "@/lib/format";
import Link from "next/link";
import { ExportButtons } from "../../demonstracoes/export-buttons";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function RazaoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ dataInicio?: string; dataFim?: string; comparar?: string }>;
}) {
  const { code } = await params;
  const contaCode = decodeURIComponent(code);
  const { dataInicio: dataInicioParam, dataFim: dataFimParam, comparar: compararParam } = await searchParams;
  const dataInicio = dataInicioParam || inicioDoAno();
  const dataFim = dataFimParam || hoje();
  const comparar = compararParam === "1";

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const movimentos = await getMovimentoConta(supabase, currentOrgId, contaCode);

  const movimentosComSaldo = movimentos.reduce<Array<(typeof movimentos)[number] & { saldoCorrido: number }>>(
    (acc, m) => {
      const anterior = acc.length > 0 ? acc[acc.length - 1].saldoCorrido : 0;
      return [...acc, { ...m, saldoCorrido: anterior + Number(m.valor_saldo) }];
    },
    []
  );

  const doPeriodo = movimentosComSaldo.filter((m) => m.data >= dataInicio && m.data <= dataFim);
  const saldoAbertura = [...movimentosComSaldo].reverse().find((m) => m.data < dataInicio)?.saldoCorrido ?? 0;
  const saldoFinal = doPeriodo.length > 0 ? doPeriodo[doPeriodo.length - 1].saldoCorrido : saldoAbertura;

  let comparacao: { inicioAnt: string; fimAnt: string; saldoFinalAnt: number; variacao: number; variacaoPct: number | null } | null = null;
  if (comparar) {
    const ant = periodoAnterior(dataInicio, dataFim);
    const saldoFinalAnt = [...movimentosComSaldo].reverse().find((m) => m.data <= ant.fim)?.saldoCorrido ?? 0;
    const variacao = saldoFinal - saldoFinalAnt;
    comparacao = {
      inicioAnt: ant.inicio,
      fimAnt: ant.fim,
      saldoFinalAnt,
      variacao,
      variacaoPct: saldoFinalAnt !== 0 ? variacao / Math.abs(saldoFinalAnt) : null,
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/razoes" className="text-sm text-slate-500 hover:underline">
            \u2190 Voltar para Raz\u00f5es
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            {movimentos[0]?.conta_name ?? contaCode}
          </h1>
          <p className="text-sm text-slate-500 font-mono">{contaCode}</p>
        </div>
        <ExportButtons
          hrefBase={`/api/export/razao/${encodeURIComponent(contaCode)}`}
          query={{ dataInicio, dataFim, comparar: comparar ? "1" : "0" }}
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">De</label>
          <input
            type="date"
            name="dataInicio"
            defaultValue={dataInicio}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">At\u00e9</label>
          <input type="date" name="dataFim" defaultValue={dataFim} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="w-full h-px bg-slate-100 my-1" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="rounded border-slate-300" />
          Comparar saldo final com o per\u00edodo anterior equivalente (an\u00e1lise horizontal)
        </label>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
      </form>

      <div className={`grid grid-cols-1 ${comparar ? "sm:grid-cols-4" : "sm:grid-cols-2"} gap-4`}>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Saldo de abertura em {fmtDate(dataInicio)}</p>
          <p className="text-xl font-semibold mt-1 text-slate-900">{fmtMoney(saldoAbertura, currency)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Saldo final em {fmtDate(dataFim)}</p>
          <p className="text-xl font-semibold mt-1 text-slate-900">{fmtMoney(saldoFinal, currency)}</p>
        </div>
        {comparacao && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">
                Saldo final em {fmtDate(comparacao.fimAnt)} (per\u00edodo anterior)
              </p>
              <p className="text-xl font-semibold mt-1 text-slate-900">{fmtMoney(comparacao.saldoFinalAnt, currency)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Varia\u00e7\u00e3o (AH)</p>
              <p
                className={`text-xl font-semibold mt-1 ${
                  comparacao.variacao > 0 ? "text-emerald-600" : comparacao.variacao < 0 ? "text-red-600" : "text-slate-900"
                }`}
              >
                {fmtMoney(comparacao.variacao, currency)}
                {comparacao.variacaoPct != null && (
                  <span className="text-sm font-normal text-slate-500 ml-1">
                    ({(comparacao.variacaoPct * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Data</th>
              <th className="text-left px-4 py-2">N\u00ba L\u00e7to</th>
              <th className="text-left px-4 py-2">Hist\u00f3rico</th>
              <th className="text-center px-4 py-2">Natureza</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-right px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {doPeriodo.map((m, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{fmtDate(m.data)}</td>
                <td className="px-4 py-2 text-slate-500">#{m.lancamento_numero}</td>
                <td className="px-4 py-2 text-slate-800">{m.historico}</td>
                <td className="px-4 py-2 text-center text-slate-500">{m.tipo === "D" ? "D\u00e9bito" : "Cr\u00e9dito"}</td>
                <td className="px-4 py-2 text-right text-slate-700">{fmtMoney(Number(m.valor), currency)}</td>
                <td className="px-4 py-2 text-right font-medium text-slate-900">
                  {fmtMoney(m.saldoCorrido, currency)}
                </td>
              </tr>
            ))}
            {doPeriodo.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-slate-400">
                  Nenhuma movimenta\u00e7\u00e3o nesta conta no per\u00edodo selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
