import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDRE } from "@/lib/accounting/demonstrativos";
import { fmtMoney } from "@/lib/format";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string }>;
}) {
  const { inicio: inicioParam, fim: fimParam } = await searchParams;
  const inicio = inicioParam || inicioDoAno();
  const fim = fimParam || hoje();

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const dre = await getDRE(supabase, currentOrgId, inicio, fim);

  const linhas: { label: string; valor: number; destaque?: boolean; subtotal?: boolean; indent?: boolean }[] = [
    { label: "Receita Bruta", valor: dre.receitaBruta },
    { label: "(–) Deduções da Receita", valor: -dre.deducoes, indent: true },
    { label: "= Receita Líquida", valor: dre.receitaLiquida, subtotal: true },
    { label: "(–) Custos", valor: -dre.custos, indent: true },
    { label: "= Lucro Bruto", valor: dre.lucroBruto, subtotal: true },
    { label: "(–) Despesas Operacionais", valor: -dre.despesasOperacionais, indent: true },
    { label: "= Resultado Operacional", valor: dre.resultadoOperacional, subtotal: true },
    { label: "(+) Receitas Financeiras", valor: dre.receitasFinanceiras, indent: true },
    { label: "(–) Despesas Financeiras", valor: -dre.despesasFinanceiras, indent: true },
    { label: "(+/–) Outras Receitas/Despesas", valor: dre.outras, indent: true },
    { label: "= Resultado Antes dos Impostos", valor: dre.resultadoAntesImpostos, subtotal: true },
    { label: "(–) Impostos sobre o Lucro", valor: -dre.impostosSobreLucro, indent: true },
    { label: "= Lucro/Prejuízo Líquido do Período", valor: dre.lucroLiquido, destaque: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/demonstracoes" className="text-sm text-slate-500 hover:underline">
          ← Demonstrações
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">DRE — Demonstração do Resultado</h1>
        <p className="text-sm text-slate-500">Receitas, custos e despesas do período selecionado.</p>
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

      {!dre.temMovimento && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Nenhum lançamento de Receita ou Despesa encontrado nesse período.
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.label} className={l.destaque ? "bg-slate-50" : ""}>
                <td
                  className={`px-4 py-2.5 ${l.indent ? "pl-8 text-slate-500" : "text-slate-800"} ${
                    l.subtotal || l.destaque ? "font-medium" : ""
                  } ${l.destaque ? "text-slate-900" : ""}`}
                >
                  {l.label}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono ${
                    l.valor < 0 ? "text-red-600" : "text-slate-900"
                  } ${l.subtotal || l.destaque ? "font-semibold" : ""}`}
                >
                  {fmtMoney(l.valor, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
