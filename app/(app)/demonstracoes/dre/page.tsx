import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDRE, type GrupoContas } from "@/lib/accounting/demonstrativos";
import { periodoAnterior, juntarGruposComAnterior, linhasDeGrupos, type LinhaAnalise } from "@/lib/accounting/analise";
import { fmtDateNumerica } from "@/lib/format";
import { ExportButtons } from "../export-buttons";
import { TabelaComparativa } from "../tabela-comparativa";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/** Inverte o sinal de um `GrupoContas[]` — usado pras categorias de despesa/dedução da DRE, cujas contas vêm agrupadas em valor absoluto mas são exibidas com sinal negativo (subtraindo da receita). */
function negarGrupos(grupos: GrupoContas[]): GrupoContas[] {
  return grupos.map((g) => ({
    ...g,
    subtotal: -g.subtotal,
    contas: g.contas.map((c) => ({ ...c, saldo: -c.saldo })),
  }));
}

/**
 * Monta a linha de uma categoria da DRE (ex: "Receita Bruta") seguida do
 * detalhamento por conta mãe/conta (ver `linhasDeGrupos`), indentado um
 * nível abaixo da própria categoria.
 */
function linhasCategoria(
  label: string,
  valor: number,
  valorAnterior: number | null | undefined,
  grupos: GrupoContas[],
  gruposAnt: GrupoContas[],
  nivelCategoria: 0 | 1 = 0
): LinhaAnalise[] {
  return [
    { label, valor, valorAnterior, indent: nivelCategoria === 1 },
    ...linhasDeGrupos(juntarGruposComAnterior(grupos, gruposAnt), nivelCategoria + 1),
  ];
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
    ...linhasCategoria("Receita Bruta", dre.receitaBruta, dreAnt?.receitaBruta, dre.gruposReceitaBruta, dreAnt?.gruposReceitaBruta ?? [], 0),
    ...linhasCategoria(
      "(–) Deduções da Receita",
      -dre.deducoes,
      dreAnt ? -dreAnt.deducoes : null,
      negarGrupos(dre.gruposDeducoes),
      negarGrupos(dreAnt?.gruposDeducoes ?? []),
      1
    ),
    { label: "= Receita Líquida", valor: dre.receitaLiquida, valorAnterior: dreAnt?.receitaLiquida, subtotal: true },
    ...linhasCategoria(
      "(–) Custos",
      -dre.custos,
      dreAnt ? -dreAnt.custos : null,
      negarGrupos(dre.gruposCustos),
      negarGrupos(dreAnt?.gruposCustos ?? []),
      1
    ),
    { label: "= Lucro Bruto", valor: dre.lucroBruto, valorAnterior: dreAnt?.lucroBruto, subtotal: true },
    ...linhasCategoria(
      "(–) Despesas Operacionais",
      -dre.despesasOperacionais,
      dreAnt ? -dreAnt.despesasOperacionais : null,
      negarGrupos(dre.gruposDespesasOperacionais),
      negarGrupos(dreAnt?.gruposDespesasOperacionais ?? []),
      1
    ),
    { label: "= Resultado Operacional", valor: dre.resultadoOperacional, valorAnterior: dreAnt?.resultadoOperacional, subtotal: true },
    ...linhasCategoria(
      "(+) Receitas Financeiras",
      dre.receitasFinanceiras,
      dreAnt?.receitasFinanceiras,
      dre.gruposReceitasFinanceiras,
      dreAnt?.gruposReceitasFinanceiras ?? [],
      1
    ),
    ...linhasCategoria(
      "(–) Despesas Financeiras",
      -dre.despesasFinanceiras,
      dreAnt ? -dreAnt.despesasFinanceiras : null,
      negarGrupos(dre.gruposDespesasFinanceiras),
      negarGrupos(dreAnt?.gruposDespesasFinanceiras ?? []),
      1
    ),
    ...linhasCategoria(
      "(+/–) Outras Receitas/Despesas",
      dre.outras,
      dreAnt?.outras,
      dre.gruposOutras,
      dreAnt?.gruposOutras ?? [],
      1
    ),
    {
      label: "= Resultado Antes dos Impostos",
      valor: dre.resultadoAntesImpostos,
      valorAnterior: dreAnt?.resultadoAntesImpostos,
      subtotal: true,
    },
    ...linhasCategoria(
      "(–) Impostos sobre o Lucro",
      -dre.impostosSobreLucro,
      dreAnt ? -dreAnt.impostosSobreLucro : null,
      negarGrupos(dre.gruposImpostosSobreLucro),
      negarGrupos(dreAnt?.gruposImpostosSobreLucro ?? []),
      1
    ),
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
        labelAtual={`${fmtDateNumerica(inicio)} – ${fmtDateNumerica(fim)}`}
        labelAnterior={`${fmtDateNumerica(inicioAnt)} – ${fmtDateNumerica(fimAnt)}`}
      />
    </div>
  );
}
