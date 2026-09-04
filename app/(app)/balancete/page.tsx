import { requireOrgContext } from "@/lib/org";
import { getSaldosPorContaAteData, totalPorNatureza, type SaldoConta } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { dataComparacaoPadrao, type LinhaAnalise } from "@/lib/accounting/analise";
import { fmtMoney, fmtDate } from "@/lib/format";
import { ExportButtons } from "../demonstracoes/export-buttons";
import { TabelaComparativa } from "../demonstracoes/tabela-comparativa";

const GRUPOS: { natureza: SaldoConta["natureza"]; label: string }[] = [
  { natureza: "ATIVO", label: "1 · Ativo" },
  { natureza: "PASSIVO", label: "2 · Passivo" },
  { natureza: "PL", label: "3 · Patrimônio Líquido" },
  { natureza: "RECEITA", label: "4 · Receitas" },
  { natureza: "DESPESA", label: "5 · Despesas" },
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function linhasDoGrupo(
  saldos: SaldoConta[],
  saldosAnt: SaldoConta[],
  natureza: SaldoConta["natureza"]
): { linhas: LinhaAnalise[]; total: number; totalAnt: number } {
  const contas = saldos.filter((s) => s.natureza === natureza);
  const antPorCodigo = new Map(saldosAnt.filter((s) => s.natureza === natureza).map((s) => [s.conta_code, s]));
  const total = totalPorNatureza(saldos, natureza);
  const totalAnt = totalPorNatureza(saldosAnt, natureza);
  const linhas: LinhaAnalise[] = contas.map((c) => ({
    key: c.conta_code,
    label: `${c.conta_code} — ${c.conta_name}`,
    valor: Number(c.saldo),
    valorAnterior: antPorCodigo.has(c.conta_code) ? Number(antPorCodigo.get(c.conta_code)!.saldo) : null,
    indent: true,
  }));
  return { linhas, total, totalAnt };
}

export default async function BalancetePage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; dataAnt?: string; comparar?: string }>;
}) {
  const { data: dataParam, dataAnt: dataAntParam, comparar: compararParam } = await searchParams;
  const dataEscolhida = dataParam || hoje();
  const comparar = compararParam === "1";
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

  const [saldos, saldosAnt] = await Promise.all([
    getSaldosPorContaAteData(supabase, currentOrgId, data),
    comparar ? getSaldosPorContaAteData(supabase, currentOrgId, dataAnt) : Promise.resolve([] as SaldoConta[]),
  ]);

  const ativo = totalPorNatureza(saldos, "ATIVO");
  const passivo = totalPorNatureza(saldos, "PASSIVO");
  const pl = totalPorNatureza(saldos, "PL");
  const receita = totalPorNatureza(saldos, "RECEITA");
  const despesa = totalPorNatureza(saldos, "DESPESA");
  const resultado = receita - despesa;
  const fechamentoContabil = ativo - (passivo + pl + resultado);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Balancete</h1>
          <p className="text-sm text-slate-500">Posição consolidada por grupo de contas, na data de referência.</p>
        </div>
        <ExportButtons hrefBase="/api/export/balancete" query={{ data, comparar: comparar ? "1" : "0", dataAnt }} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Data de referência</label>
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
              Não há dados contábeis para {fmtDate(dataOriginal)}
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
        const { linhas, total, totalAnt } = linhasDoGrupo(saldos, saldosAnt, g.natureza);
        if (linhas.length === 0) {
          return (
            <div key={g.natureza} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between text-sm font-medium text-slate-700">
                <span>{g.label}</span>
                <span>{fmtMoney(0, currency)}</span>
              </div>
              <p className="text-sm text-slate-400 px-4 py-3">Sem movimentação.</p>
            </div>
          );
        }
        const linhasComTotal: LinhaAnalise[] = [
          ...linhas.map((l) => ({ ...l, href: `/razoes/${encodeURIComponent(String(l.key))}` })),
          { key: `${g.natureza}-total`, label: `Total ${g.label}`, valor: total, valorAnterior: comparar ? totalAnt : null, subtotal: true },
        ];
        return (
          <div key={g.natureza}>
            <h2 className="text-sm font-medium text-slate-700 mb-2">{g.label}</h2>
            <TabelaComparativa
              linhas={linhasComTotal}
              baseAV={total || 1}
              baseAVAnterior={totalAnt || 1}
              currency={currency}
              comparar={comparar}
              labelBaseAV={`o total de ${g.label}`}
            />
          </div>
        );
      })}
    </div>
  );
}
