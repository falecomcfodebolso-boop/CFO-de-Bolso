import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDFC } from "@/lib/accounting/demonstrativos";
import { fmtMoney } from "@/lib/format";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DfcPage({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string }>;
}) {
  const { inicio: inicioParam, fim: fimParam } = await searchParams;
  const inicio = inicioParam || inicioDoAno();
  const fim = fimParam || hoje();

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const dfc = await getDFC(supabase, currentOrgId, inicio, fim);

  const linhas = [
    { label: "Saldo Inicial de Caixa", valor: dfc.saldoInicialCaixa, destaque: true },
    { label: "(+/–) Atividades Operacionais", valor: dfc.operacional },
    { label: "(+/–) Atividades de Investimento", valor: dfc.investimento },
    { label: "(+/–) Atividades de Financiamento", valor: dfc.financiamento },
    { label: "= Variação de Caixa no Período", valor: dfc.variacaoCaixa, subtotal: true },
    { label: "Saldo Final de Caixa", valor: dfc.saldoFinalCaixa, destaque: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/demonstracoes" className="text-sm text-slate-500 hover:underline">
          ← Demonstrações
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">DFC — Demonstração do Fluxo de Caixa</h1>
        <p className="text-sm text-slate-500">
          Calculada pelo método direto: cada entrada ou saída de caixa é classificada pela natureza da
          contrapartida no mesmo lançamento.
        </p>
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
            {linhas.map((l) => (
              <tr key={l.label} className={l.destaque ? "bg-slate-50" : ""}>
                <td className={`px-4 py-2.5 text-slate-800 ${l.subtotal || l.destaque ? "font-medium" : ""}`}>
                  {l.label}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono ${l.valor < 0 ? "text-red-600" : "text-slate-900"} ${
                    l.subtotal || l.destaque ? "font-semibold" : ""
                  }`}
                >
                  {fmtMoney(l.valor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Contas de caixa são identificadas automaticamente pelo nome (ex: &ldquo;Caixa&rdquo;, &ldquo;Banco&rdquo;,
        &ldquo;Conta Corrente&rdquo;). Se alguma conta de caixa não estiver sendo reconhecida, ajuste sua
        classificação no Plano de Contas.
      </p>
    </div>
  );
}
