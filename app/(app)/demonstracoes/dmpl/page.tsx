import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDMPL } from "@/lib/accounting/demonstrativos";
import { periodoAnterior, type LinhaAnalise } from "@/lib/accounting/analise";
import { ExportButtons } from "../export-buttons";
import { TabelaComparativa } from "../tabela-comparativa";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DmplPage({
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
  const [dmpl, dmplAnt] = await Promise.all([
    getDMPL(supabase, currentOrgId, inicio, fim),
    comparar ? getDMPL(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
  ]);

  const linhasResumo: LinhaAnalise[] = [
    { label: "Saldo Inicial", valor: dmpl.saldoInicial, valorAnterior: dmplAnt?.saldoInicial },
    { label: "(+) Aportes de Capital", valor: dmpl.aportes, valorAnterior: dmplAnt?.aportes, indent: true },
    { label: "(–) Distribuições / Retiradas", valor: dmpl.distribuicoes, valorAnterior: dmplAnt?.distribuicoes, indent: true },
    { label: "(+/–) Resultado do Período", valor: dmpl.resultadoPeriodo, valorAnterior: dmplAnt?.resultadoPeriodo, indent: true },
    { label: "Saldo Final", valor: dmpl.saldoFinal, valorAnterior: dmplAnt?.saldoFinal, destaque: true },
  ];

  const contasAntPorCodigo = new Map((dmplAnt?.contas ?? []).map((c) => [c.code, c]));
  const linhasContas: LinhaAnalise[] = dmpl.contas.map((c) => ({
    key: c.code,
    label: `${c.code} — ${c.name}`,
    valor: c.saldoFinal,
    valorAnterior: contasAntPorCodigo.get(c.code)?.saldoFinal ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/demonstracoes" className="text-sm text-slate-500 hover:underline">
            ← Demonstrações
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">DMPL — Mutações do Patrimônio Líquido</h1>
          <p className="text-sm text-slate-500">Como o Patrimônio Líquido mudou entre o início e o fim do período.</p>
        </div>
        <ExportButtons hrefBase="/api/export/dmpl" query={{ inicio, fim }} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Início</label>
          <input type="date" name="inicio" defaultValue={inicio} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Fim</label>
          <input type="date" name="fim" defaultValue={fim} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="w-full h-px bg-slate-100 my-1" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="rounded border-slate-300" />
          Comparar com outro período (análise horizontal)
        </label>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Início (comparação)</label>
          <input type="date" name="inicioAnt" defaultValue={inicioAnt} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Fim (comparação)</label>
          <input type="date" name="fimAnt" defaultValue={fimAnt} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
      </form>

      <TabelaComparativa
        linhas={linhasResumo}
        baseAV={dmpl.saldoFinal}
        baseAVAnterior={dmplAnt?.saldoFinal ?? 0}
        currency={currency}
        comparar={comparar}
        labelBaseAV="o Saldo Final do PL"
      />

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">Movimentação por conta do Patrimônio Líquido</h2>
        {linhasContas.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma movimentação em contas de PL nesse período.</p>
        ) : (
          <TabelaComparativa
            linhas={linhasContas}
            baseAV={dmpl.saldoFinal}
            baseAVAnterior={dmplAnt?.saldoFinal ?? 0}
            currency={currency}
            comparar={comparar}
            labelBaseAV="o Saldo Final do PL"
          />
        )}
      </div>
    </div>
  );
}
