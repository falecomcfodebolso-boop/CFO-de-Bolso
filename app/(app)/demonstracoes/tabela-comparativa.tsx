import Link from "next/link";
import { fmtMoney } from "@/lib/format";
import { calcAV, calcVariacao, type LinhaAnalise } from "@/lib/accounting/analise";

function fmtPct(v: number | null, casas = 1) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(casas)}%`;
}

/**
 * Tabela genérica usada em todas as demonstrações (DRE, Balanço, DFC,
 * DMPL) para mostrar, lado a lado: o valor do período atual, sua análise
 * vertical (% de uma base da própria demonstração), o valor do período
 * de comparação (se houver) e a análise horizontal (variação absoluta e
 * % entre os dois períodos).
 */
export function TabelaComparativa({
  linhas,
  baseAV,
  baseAVAnterior,
  currency,
  comparar,
  labelBaseAV,
}: {
  linhas: LinhaAnalise[];
  baseAV: number;
  baseAVAnterior: number;
  currency: string;
  comparar: boolean;
  labelBaseAV: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Conta</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-right px-4 py-2" title={`% sobre ${labelBaseAV}`}>
                AV %
              </th>
              {comparar && (
                <>
                  <th className="text-right px-4 py-2">Período anterior</th>
                  <th className="text-right px-4 py-2" title={`% sobre ${labelBaseAV} do período anterior`}>
                    AV % ant.
                  </th>
                  <th className="text-right px-4 py-2">Variação</th>
                  <th className="text-right px-4 py-2">AH %</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l, i) => {
              const av = l.semAV ? null : calcAV(l.valor, baseAV);
              const avAnterior = l.semAV ? null : calcAV(l.valorAnterior ?? 0, baseAVAnterior);
              const variacao = comparar ? calcVariacao(l.valor, l.valorAnterior) : null;

              const negrito = l.subtotal || l.destaque;

              return (
                <tr key={l.key ?? `${l.label}-${i}`} className={l.destaque ? "bg-slate-50" : ""}>
                  <td
                    className={`px-4 py-2.5 ${l.indent ? "pl-8 text-slate-500" : "text-slate-800"} ${
                      negrito ? "font-medium" : ""
                    } ${l.destaque ? "text-slate-900" : ""}`}
                  >
                    {l.href ? (
                      <Link href={l.href} className="hover:underline">
                        {l.label}
                      </Link>
                    ) : (
                      l.label
                    )}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono whitespace-nowrap ${
                      l.valor < 0 ? "text-red-600" : "text-slate-900"
                    } ${negrito ? "font-semibold" : ""}`}
                  >
                    {fmtMoney(l.valor, currency)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{fmtPct(av)}</td>
                  {comparar && (
                    <>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-500 whitespace-nowrap">
                        {l.valorAnterior == null ? "—" : fmtMoney(l.valorAnterior, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-400 whitespace-nowrap">{fmtPct(avAnterior)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono whitespace-nowrap ${
                          variacao == null
                            ? "text-slate-400"
                            : variacao.absoluta > 0
                              ? "text-emerald-600"
                              : variacao.absoluta < 0
                                ? "text-red-600"
                                : "text-slate-500"
                        }`}
                      >
                        {variacao == null ? "—" : fmtMoney(variacao.absoluta, currency)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right whitespace-nowrap ${
                          variacao?.pct == null
                            ? "text-slate-400"
                            : variacao.pct > 0
                              ? "text-emerald-600"
                              : variacao.pct < 0
                                ? "text-red-600"
                                : "text-slate-500"
                        }`}
                      >
                        {variacao == null ? "—" : fmtPct(variacao.pct)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 px-4 py-2 border-t border-slate-100">
        AV % = análise vertical (peso de cada linha sobre {labelBaseAV}). AH % = análise horizontal (variação
        percentual desta linha entre o período de comparação e o período atual).
      </p>
    </div>
  );
}
