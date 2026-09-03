import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDRE } from "@/lib/accounting/demonstrativos";
import { periodoAnterior, type LinhaAnalise } from "@/lib/accounting/analise";
import { ExportButtons } from "../export-buttons";
import { TabelaComparativa } from "../tabela-comparativa";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ inicio?: string; fim?: string; inicioAnt?: string; fimAnt?: string; comparar?: string }>;
}) {
  const { inicio: inicioParam, fim: fimParam, inicioAnt: inicioAntParam, fimAnt: fimAntParam, comparar: compararParam } =
    await searchParams;
  const inicio = inicioParam || inicioDoAno();
  const fim = fimParam || hoje();
  const comparar = compararParam !== "0";

  const anteriorPadrao = periodoAnterior(inicio, fim);
  const inicioAnt = inicioAntParam || anteriorPadrao.inicio;
  const fimAnt = fimAntParam || anteriorPadrao.fim;

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const [dre, dreAnt] = await Promise.all([
    getDRE(supabase, currentOrgId, inicio, fim),
    comparar ? getDRE(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
  ]);

  const linhas: LinhaAnalise[] = [
    { label: "Receita Bruta", valor: dre.receitaBruta, valorAnterior: dreAnt?.receitaBruta },
    { label: "(–) Deduções da Receita", valor: -dre.deducoes, valorAnterior: dreAnt ? -dreAnt.deducoes : null, indent: true },
    { label: "= Receita Líquida", valor: dre.receitaLiquida, valorAnterior: dreAnt?.receitaLiquida, subtotal: true },
    { label: "(–) Custos", valor: -dre.custos, valorAnterior: dreAnt ? -dreAnt.custos : null, indent: true },
    { label: "= Lucro Bruto", valor: dre.lucroBruto, valorAnterior: dreAnt?.lucroBruto, subtotal: true },
    {
      label: "(–) Despesas Operacionais",
      valor: -dre.despesasOperacionais,
      valorAnterior: dreAnt ? -dreAnt.despesasOperacionais : null,
      indent: true,
    },
    { label: "= Resultado Operacional", valor: dre.resultadoOperacional, valorAnterior: dreAnt?.resultadoOperacional, subtotal: true },
    { label: "(+) Receitas Financeiras", valor: dre.receitasFinanceiras, valorAnterior: dreAnt?.receitasFinanceiras, indent: true },
    {
      label: "(–) Despesas Financeiras",
      valor: -dre.despesasFinanceiras,
      valorAnterior: dreAnt ? -dreAnt.despesasFinanceiras : null,
      indent: true,
    },
    { label: "(+/–) Outras Receitas/Despesas", valor: dre.outras, valorAnterior: dreAnt?.outras, indent: true },
    {
      label: "= Resultado Antes dos Impostos",
      valor: dre.resultadoAntesImpostos,
      valorAnterior: dreAnt?.resultadoAntesImpostos,
      subtotal: true,
    },
    {
      label: "(–) Impostos sobre o Lucro",
      valor: -dre.impostosSobreLucro,
      valorAnterior: dreAnt ? -dreAnt.impostosSobreLucro : null,
      indent: true,
    },
    {
      label: "= Lucro/Prejuízo Líquido do Período",
      valor: dre.lucroLiquido,
      valorAnterior: dreAnt?.lucroLiquido,
      destaque: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/demonstracoes" className="text-sm text-slate-500 hover:underline">
            ← Demonstrações
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">DRE — Demonstração do Resultado</h1>
          <p className="text-sm text-slate-500">Receitas, custos e despesas do período selecionado.</p>
        </div>
        <ExportButtons hrefBase="/api/export/dre" query={{ inicio, fim }} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <span className="w-full text-xs font-semibold text-slate-600">Período atual</span>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Início</label>
            <input type="date" name="inicio" defaultValue={inicio} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fim</label>
            <input type="date" name="fim" defaultValue={fim} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
        </div>
        <div className="w-full h-px bg-slate-100 my-1" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="rounded border-slate-300" />
          Comparar com período anterior (análise horizontal)
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <span className="w-full text-xs font-semibold text-slate-600">Período anterior</span>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Início</label>
            <input type="date" name="inicioAnt" defaultValue={inicioAnt} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fim</label>
            <input type="date" name="fimAnt" defaultValue={fimAnt} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          </div>
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

      <TabelaComparativa
        linhas={linhas}
        baseAV={dre.receitaLiquida}
        baseAVAnterior={dreAnt?.receitaLiquida ?? 0}
        currency={currency}
        comparar={comparar}
        labelBaseAV="a Receita Líquida"
      />
    </div>
  );
}
