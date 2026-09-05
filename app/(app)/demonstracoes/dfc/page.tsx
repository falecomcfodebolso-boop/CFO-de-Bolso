import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDFC } from "@/lib/accounting/demonstrativos";
import { periodoAnterior, type LinhaAnalise } from "@/lib/accounting/analise";
import { fmtDateNumerica } from "@/lib/format";
import { ExportButtons } from "../export-buttons";
import { TabelaComparativa } from "../tabela-comparativa";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DfcPage({
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
  const [dfc, dfcAnt] = await Promise.all([
    getDFC(supabase, currentOrgId, inicio, fim),
    comparar ? getDFC(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
  ]);

  // Base da análise vertical da DFC: soma dos valores absolutos dos três
  // grupos de atividades — não há uma convenção única pra "100%" num
  // fluxo (diferente do Ativo Total no Balanço ou da Receita na DRE), por
  // isso usamos essa base e deixamos isso explícito na legenda da tabela.
  const baseAV = Math.abs(dfc.operacional) + Math.abs(dfc.investimento) + Math.abs(dfc.financiamento);
  const baseAVAnt = dfcAnt ? Math.abs(dfcAnt.operacional) + Math.abs(dfcAnt.investimento) + Math.abs(dfcAnt.financiamento) : 0;

  const linhas: LinhaAnalise[] = [
    { label: "Saldo Inicial de Caixa", valor: dfc.saldoInicialCaixa, valorAnterior: dfcAnt?.saldoInicialCaixa, destaque: true, semAV: true },
    { label: "(+/–) Atividades Operacionais", valor: dfc.operacional, valorAnterior: dfcAnt?.operacional },
    { label: "(+/–) Atividades de Investimento", valor: dfc.investimento, valorAnterior: dfcAnt?.investimento },
    { label: "(+/–) Atividades de Financiamento", valor: dfc.financiamento, valorAnterior: dfcAnt?.financiamento },
    { label: "= Variação de Caixa no Período", valor: dfc.variacaoCaixa, valorAnterior: dfcAnt?.variacaoCaixa, subtotal: true, semAV: true },
    { label: "Saldo Final de Caixa", valor: dfc.saldoFinalCaixa, valorAnterior: dfcAnt?.saldoFinalCaixa, destaque: true, semAV: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
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
        <ExportButtons hrefBase="/api/export/dfc" query={{ inicio, fim }} />
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

      <TabelaComparativa
        linhas={linhas}
        baseAV={baseAV}
        baseAVAnterior={baseAVAnt}
        currency={currency}
        comparar={comparar}
        labelBaseAV="a soma dos três grupos de atividades (em módulo)"
        labelAtual={`${fmtDateNumerica(inicio)} – ${fmtDateNumerica(fim)}`}
        labelAnterior={`${fmtDateNumerica(inicioAnt)} – ${fmtDateNumerica(fimAnt)}`}
      />

      <p className="text-xs text-slate-400">
        Contas de caixa são identificadas automaticamente pelo nome (ex: &ldquo;Caixa&rdquo;, &ldquo;Banco&rdquo;,
        &ldquo;Conta Corrente&rdquo;). Se alguma conta de caixa não estiver sendo reconhecida, ajuste sua
        classificação no Plano de Contas.
      </p>
    </div>
  );
}
