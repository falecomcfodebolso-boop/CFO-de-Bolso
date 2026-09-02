import { requireOrgContext } from "@/lib/org";
import { getSaldosPorConta } from "@/lib/accounting/queries";
import { fmtMoney } from "@/lib/format";
import Link from "next/link";

export default async function RazoesPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const saldos = await getSaldosPorConta(supabase, currentOrgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Razões</h1>
        <p className="text-sm text-slate-500">Selecione uma conta para ver o extrato completo (razão).</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Código</th>
              <th className="text-left px-4 py-2">Conta</th>
              <th className="text-right px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {saldos.map((s) => (
              <tr key={s.conta_code} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{s.conta_code}</td>
                <td className="px-4 py-2">
                  <Link href={`/razoes/${encodeURIComponent(s.conta_code)}`} className="text-slate-800 hover:underline">
                    {s.conta_name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right font-medium text-slate-900">
                  {fmtMoney(Number(s.saldo), currency)}
                </td>
              </tr>
            ))}
            {saldos.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-slate-400">
                  Nenhuma movimentação lançada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
