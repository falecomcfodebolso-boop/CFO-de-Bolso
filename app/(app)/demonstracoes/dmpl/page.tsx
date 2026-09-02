import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDMPL } from "@/lib/accounting/demonstrativos";
import { fmtMoney } from "@/lib/format";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DmplPage({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string }>;
}) {
  const { inicio: inicioParam, fim: fimParam } = await searchParams;
  const inicio = inicioParam || inicioDoAno();
  const fim = fimParam || hoje();

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const dmpl = await getDMPL(supabase, currentOrgId, inicio, fim);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/demonstracoes" className="text-sm text-slate-500 hover:underline">
          ← Demonstrações
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">DMPL — Mutações do Patrimônio Líquido</h1>
        <p className="text-sm text-slate-500">Como o Patrimônio Líquido mudou entre o início e o fim do período.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Início</label>
          <input
            type="date"
            name="inicio"
            defaultValue={inicio}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Fim</label>
          <input
            type="date"
            name="fim"
            defaultValue={fim}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="px-4 py-2.5 text-slate-800">Saldo Inicial</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-900">
                {fmtMoney(dmpl.saldoInicial, currency)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-500 pl-8">(+) Aportes de Capital</td>
              <td className="px-4 py-2.5 text-right font-mono text-slate-900">{fmtMoney(dmpl.aportes, currency)}</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-500 pl-8">(–) Distribuições / Retiradas</td>
              <td className="px-4 py-2.5 text-right font-mono text-red-600">
                {fmtMoney(dmpl.distribuicoes, currency)}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-slate-500 pl-8">(+/–) Resultado do Período</td>
              <td
                className={`px-4 py-2.5 text-right font-mono ${
                  dmpl.resultadoPeriodo < 0 ? "text-red-600" : "text-slate-900"
                }`}
              >
                {fmtMoney(dmpl.resultadoPeriodo, currency)}
              </td>
            </tr>
            <tr className="bg-slate-50">
              <td className="px-4 py-2.5 text-slate-900 font-semibold">Saldo Final</td>
              <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                {fmtMoney(dmpl.saldoFinal, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
          Movimentação por conta do Patrimônio Líquido
        </div>
        {dmpl.contas.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-3">Nenhuma movimentação em contas de PL nesse período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Conta</th>
                <th className="text-right px-4 py-2">Saldo Inicial</th>
                <th className="text-right px-4 py-2">Movimento</th>
                <th className="text-right px-4 py-2">Saldo Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dmpl.contas.map((c) => (
                <tr key={c.code} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-800">
                    <span className="font-mono text-xs text-slate-400 mr-2">{c.code}</span>
                    {c.name}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-slate-700">
                    {fmtMoney(c.saldoInicial, currency)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${c.movimento < 0 ? "text-red-600" : "text-slate-700"}`}>
                    {fmtMoney(c.movimento, currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium text-slate-900">
                    {fmtMoney(c.saldoFinal, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
