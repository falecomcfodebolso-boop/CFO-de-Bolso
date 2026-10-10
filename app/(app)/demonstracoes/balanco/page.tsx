import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getBalanco, type GrupoContas, type ContaSaldo } from "@/lib/accounting/demonstrativos";
import { dataComparacaoPadrao, type LinhaAnalise } from "@/lib/accounting/analise";
import { fmtMoney, fmtDate, fmtDateNumerica } from "@/lib/format";
import { ExportButtons } from "../export-buttons";
import { TabelaComparativa } from "../tabela-comparativa";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Envolve uma lista flat de contas (ex: Patrimônio Líquido, que não tem
 * subgrupos reais) em "grupos" de uma conta só, pra poder reaproveitar
 * `linhasDoBloco` sem gerar linhas de subtotal redundantes.
 */
function comoGruposFlat(contas: ContaSaldo[]): GrupoContas[] {
  return contas.map((c) => ({ code: c.code, name: c.name, subtotal: c.saldo, contas: [c] }));
}

/**
 * Monta as linhas de um bloco do Balanço (ex: "Ativo Circulante") a partir
 * das contas já agrupadas por "conta mãe" (ver `agrupar` em
 * lib/accounting/demonstrativos.ts). Quando um grupo tem mais de uma
 * conta-filha, mostra uma linha de subtotal pro grupo (nível de indentação
 * 1) antes das contas-filha (nível 2) — grupos com uma única conta pulam
 * a linha de subtotal redundante e mostram a conta direto no nível 1.
 */
function linhasDoBloco(
  titulo: string,
  grupos: GrupoContas[],
  total: number,
  gruposAnt: GrupoContas[],
  totalAnt: number | null
): LinhaAnalise[] {
  const grupoAntPorCodigo = new Map(gruposAnt.map((g) => [g.code, g]));
  const contaAntPorCodigo = new Map(gruposAnt.flatMap((g) => g.contas.map((c) => [c.code, c])));

  const linhas: LinhaAnalise[] = [];
  for (const g of grupos) {
    const temSubtotalProprio = g.contas.length > 1;
    if (temSubtotalProprio) {
      linhas.push({
        key: `grupo-${g.code}`,
        label: `${g.code} — ${g.name}`,
        valor: g.subtotal,
        valorAnterior: grupoAntPorCodigo.get(g.code)?.subtotal ?? null,
        indentLevel: 1,
        subtotal: true,
      });
    }
    for (const c of g.contas) {
      linhas.push({
        key: c.code,
        label: `${c.code} — ${c.name}`,
        valor: c.saldo,
        valorAnterior: contaAntPorCodigo.get(c.code)?.saldo ?? null,
        indentLevel: temSubtotalProprio ? 2 : 1,
      });
    }
  }
  linhas.push({ key: `${titulo}-total`, label: `Total ${titulo}`, valor: total, valorAnterior: totalAnt, subtotal: true });
  return linhas;
}

export default async function BalancoPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; dataAnt?: string; comparar?: string }>;
}) {
  const { data: dataParam, dataAnt: dataAntParam, comparar: compararParam } = await searchParams;
  const dataEscolhida = dataParam || hoje();
  const comparar = compararParam !== "0";
  const dataAntEscolhida = dataAntParam || dataComparacaoPadrao(dataEscolhida);

  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const intervalo = await getIntervaloDeLancamentos(supabase, currentOrgId);
  const { data, ajustada: dataAjustada, dataOriginal } = resolverDataReferencia(dataEscolhida, intervalo);
  const {
    data: dataAnt,
    ajustada: dataAntAjustada,
    dataOriginal: dataAntOriginal,
  } = resolverDataReferencia(dataAntEscolhida, intervalo);

  const [b, bAnt] = await Promise.all([
    getBalanco(supabase, currentOrgId, data),
    comparar ? getBalanco(supabase, currentOrgId, dataAnt) : Promise.resolve(null),
  ]);

  const fecha = Math.abs(b.diferenca) < 0.01;

  const linhasAtivo: LinhaAnalise[] = [
    ...linhasDoBloco(
      "Ativo Circulante",
      b.gruposAtivoCirculante,
      b.ativoCirculante,
      bAnt?.gruposAtivoCirculante ?? [],
      bAnt?.ativoCirculante ?? null
    ),
    ...linhasDoBloco(
      "Ativo Não Circulante",
      b.gruposAtivoNaoCirculante,
      b.ativoNaoCirculante,
      bAnt?.gruposAtivoNaoCirculante ?? [],
      bAnt?.ativoNaoCirculante ?? null
    ),
    { key: "ativo-total", label: "= ATIVO TOTAL", valor: b.ativoTotal, valorAnterior: bAnt?.ativoTotal, destaque: true },
  ];

  const linhasPassivoPl: LinhaAnalise[] = [
    ...linhasDoBloco(
      "Passivo Circulante",
      b.gruposPassivoCirculante,
      b.passivoCirculante,
      bAnt?.gruposPassivoCirculante ?? [],
      bAnt?.passivoCirculante ?? null
    ),
    ...linhasDoBloco(
      "Passivo Não Circulante",
      b.gruposPassivoNaoCirculante,
      b.passivoNaoCirculante,
      bAnt?.gruposPassivoNaoCirculante ?? [],
      bAnt?.passivoNaoCirculante ?? null
    ),
    ...linhasDoBloco(
      "Patrimônio Líquido",
      comoGruposFlat(b.contasPl),
      b.capitalEReservas,
      comoGruposFlat(bAnt?.contasPl ?? []),
      bAnt?.capitalEReservas ?? null
    ),
    {
      key: "resultado-exercicio",
      label: "Resultado do Exercício (ainda não fechado)",
      valor: b.resultadoDoExercicio,
      valorAnterior: bAnt?.resultadoDoExercicio,
      indent: true,
    },
    {
      key: "passivo-pl-total",
      label: "= PASSIVO + PATRIMÔNIO LÍQUIDO",
      valor: b.passivoMaisPl,
      valorAnterior: bAnt?.passivoMaisPl,
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
          <h1 className="text-xl font-semibold text-slate-900 mt-1">Balanço Patrimonial</h1>
          <p className="text-sm text-slate-500">Posição do Ativo, Passivo e Patrimônio Líquido em uma data.</p>
        </div>
        <ExportButtons hrefBase="/api/export/balanco" query={{ data }} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Período atual</label>
          <input type="date" name="data" defaultValue={data} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="w-full h-px bg-slate-100 my-1" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="rounded border-slate-300" />
          Comparar com período anterior (análise horizontal)
        </label>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Período anterior</label>
          <input type="date" name="dataAnt" defaultValue={dataAnt} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
      </form>

      {(dataAjustada || dataAntAjustada) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3 space-y-1">
          {dataAjustada && dataOriginal && (
            <p>
              Não há dados contábeis para {fmtDate(dataOriginal)} no período atual
              {dataOriginal > data ? " (é depois do último lançamento registrado)" : " (é antes do primeiro lançamento registrado)"}
              . Mostrando o {dataOriginal > data ? "último" : "primeiro"} período disponível: <strong>{fmtDate(data)}</strong>.
            </p>
          )}
          {dataAntAjustada && dataAntOriginal && (
            <p>
              Não há dados contábeis para {fmtDate(dataAntOriginal)} no período anterior
              {dataAntOriginal > dataAnt ? " (é depois do último lançamento registrado)" : " (é antes do primeiro lançamento registrado)"}
              . Mostrando o {dataAntOriginal > dataAnt ? "último" : "primeiro"} período disponível: <strong>{fmtDate(dataAnt)}</strong>.
            </p>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">Ativo</h2>
        <TabelaComparativa
          linhas={linhasAtivo}
          baseAV={b.ativoTotal}
          baseAVAnterior={bAnt?.ativoTotal ?? 0}
          currency={currency}
          comparar={comparar}
          labelBaseAV="o Ativo Total"
          labelAtual={fmtDateNumerica(data)}
          labelAnterior={fmtDateNumerica(dataAnt)}
        />
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">Passivo + Patrimônio Líquido</h2>
        <TabelaComparativa
          linhas={linhasPassivoPl}
          baseAV={b.passivoMaisPl}
          baseAVAnterior={bAnt?.passivoMaisPl ?? 0}
          currency={currency}
          comparar={comparar}
          labelBaseAV="o Ativo Total"
          labelAtual={fmtDateNumerica(data)}
          labelAnterior={fmtDateNumerica(dataAnt)}
        />
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm flex justify-between ${
          fecha ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
        }`}
      >
        <span>{fecha ? "Balanço fechado (Ativo = Passivo + PL)" : "Atenção: o balanço não fechou"}</span>
        <span className="font-mono">{fmtMoney(b.diferenca, currency)}</span>
      </div>
    </div>
  );
}
