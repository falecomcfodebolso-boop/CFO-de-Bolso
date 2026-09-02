import { requireOrgContext } from "@/lib/org";
import { getSaldosPorConta, totalPorNatureza } from "@/lib/accounting/queries";
import { fmtMoney } from "@/lib/format";
import Link from "next/link";

const GRUPOS: { natureza: "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA"; label: string }[] = [
  { natureza: "ATIVO", label: "1 · Ativo" },
  { natureza: "PASSIVO", label: "2 · Passivo" },
  { natureza: "PL", label: "3 · Patrimônio Líquido" },
  { natureza: "RECEITA", label: "4 · Receitas" },
  { natureza: "DESPESA", label: "5 · Despesas" },
];

export default async function BalancetePage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const saldos = await getSaldosPorConta(supabase, currentOrgId);

  const ativo = totalPorNatureza(saldos, "ATIVO");
  const passivo = totalPorNatureza(saldos, "PASSIVO");
  const pl = totalPorNatureza(saldos, "PL");
  const receita = totalPorNatureza(saldos, "RECEITA");
  const despesa = totalPorNatureza(saldos, "DESPESA");
  const resultado = receita - despesa;
  const fechamentoContabil = ativo - (passivo + pl + resultado);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Balancete</h1>
        <p className="text-sm text-slate-500">Posição consolidada por grupo de contas.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Resultado do período</p>
          <p className={`text-2xl font-semibold mt-1 ${resultado >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {fmtMoney(resultado, currency)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Ativo Total</p>
          <p className="text-2xl font-semibold mt-1 text-slate-900">{fmtMoney(ativo, currency)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Verificação de fechamento (deve ser 0)</p>
          <p className={`text-2xl font-semibold mt-1 ${Math.abs(fechamentoContabil) < 0.01 ? "text-emerald-600" : "text-red-600"}`}>
            {fmtMoney(fechamentoContabil, currency)}
          </p>
        </div>
      </div>

      {GRUPOS.map((g) => {
        const contas = saldos.filter((s) => s.natureza === g.natureza);
        const total = totalPorNatureza(saldos, g.natureza);
        return (
          <div key={g.natureza} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between text-sm font-medium text-slate-700">
              <span>{g.label}</span>
              <span>{fmtMoney(total, currency)}</span>
            </div>
            {contas.length === 0 ? (
              <p className="text-sm text-slate-400 px-4 py-3">Sem movimentação.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {contas.map((c) => (
                    <tr key={c.conta_code} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-500 w-32">{c.conta_code}</td>
                      <td className="px-4 py-2 text-slate-800">
                        <Link href={`/razoes/${encodeURIComponent(c.conta_code)}`} className="hover:underline">
                          {c.conta_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-900">{fmtMoney(Number(c.saldo), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
