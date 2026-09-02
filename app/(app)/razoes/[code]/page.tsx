import { requireOrgContext } from "@/lib/org";
import { getMovimentoConta } from "@/lib/accounting/queries";
import { fmtDate, fmtMoney } from "@/lib/format";
import Link from "next/link";

export default async function RazaoDetalhePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const contaCode = decodeURIComponent(code);
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

  return (
    <div className="space-y-4">
      <div>
        <Link href="/razoes" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Razões
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">
          {movimentos[0]?.conta_name ?? contaCode}
        </h1>
        <p className="text-sm text-slate-500 font-mono">{contaCode}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Data</th>
              <th className="text-left px-4 py-2">Nº Lçto</th>
              <th className="text-left px-4 py-2">Histórico</th>
              <th className="text-center px-4 py-2">Natureza</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-right px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {movimentosComSaldo.map((m, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{fmtDate(m.data)}</td>
                <td className="px-4 py-2 text-slate-500">#{m.lancamento_numero}</td>
                <td className="px-4 py-2 text-slate-800">{m.historico}</td>
                <td className="px-4 py-2 text-center text-slate-500">{m.tipo === "D" ? "Débito" : "Crédito"}</td>
                <td className="px-4 py-2 text-right text-slate-700">{fmtMoney(Number(m.valor), currency)}</td>
                <td className="px-4 py-2 text-right font-medium text-slate-900">
                  {fmtMoney(m.saldoCorrido, currency)}
                </td>
              </tr>
            ))}
            {movimentos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-slate-400">
                  Nenhuma movimentação nesta conta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
