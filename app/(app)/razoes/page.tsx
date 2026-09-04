import { requireOrgContext } from "@/lib/org";
import { getSaldosPorContaAteData, totalPorNatureza, type SaldoConta } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { dataComparacaoPadrao, type LinhaAnalise } from "@/lib/accounting/analise";
import { fmtDate } from "@/lib/format";
import { ExportButtons } from "../demonstracoes/export-buttons";
import { TabelaComparativa } from "../demonstracoes/tabela-comparativa";

const GRUPOS: { natureza: SaldoConta["natureza"]; label: string }[] = [
  { natureza: "ATIVO", label: "1 \u00b7 Ativo" },
  { natureza: "PASSIVO", label: "2 \u00b7 Passivo" },
  { natureza: "PL", label: "3 \u00b7 Patrim\u00f4nio L\u00edquido" },
  { natureza: "RECEITA", label: "4 \u00b7 Receitas" },
  { natureza: "DESPESA", label: "5 \u00b7 Despesas" },
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
    label: `${c.conta_code} \u2014 ${c.conta_name}`,
    valor: Number(c.saldo),
    valorAnterior: antPorCodigo.has(c.conta_code) ? Number(antPorCodigo.get(c.conta_code)!.saldo) : null,
    indent: true,
    href: `/razoes/${encodeURIComponent(c.conta_code)}`,
  }));
  return { linhas, total, totalAnt };
}

export default async function RazoesPage({
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Raz\u00f5es</h1>
          <p className="text-sm text-slate-500">
            Selecione uma conta para ver o extrato completo (raz\u00e3o). Saldos na data de refer\u00eancia.
          </p>
        </div>
        <ExportButtons hrefBase="/api/export/razoes" query={{ data, comparar: comparar ? "1" : "0", dataAnt }} />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Data de refer\u00eancia</label>
          <input type="date" name="data" defaultValue={data} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div className="w-full h-px bg-slate-100 my-1" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="rounded border-slate-300" />
          Comparar com per\u00edodo anterior (an\u00e1lise horizontal)
        </label>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Per\u00edodo anterior</label>
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
              N\u00e3o h\u00e1 dados cont\u00e1beis para {fmtDate(dataOriginal)}
              {dataOriginal > data ? " (\u00e9 depois do \u00faltimo lan\u00e7amento registrado)" : " (\u00e9 antes do primeiro lan\u00e7amento registrado)"}
              . Mostrando o {dataOriginal > data ? "\u00faltimo" : "primeiro"} per\u00edodo dispon\u00edvel: <strong>{fmtDate(data)}</strong>.
            </p>
          )}
          {dataAntAjustada && dataAntOriginal && (
            <p>
              N\u00e3o h\u00e1 dados cont\u00e1beis para {fmtDate(dataAntOriginal)} no per\u00edodo anterior
              {dataAntOriginal > dataAnt ? " (\u00e9 depois do \u00faltimo lan\u00e7amento registrado)" : " (\u00e9 antes do primeiro lan\u00e7amento registrado)"}
              . Mostrando o {dataAntOriginal > dataAnt ? "\u00faltimo" : "primeiro"} per\u00edodo dispon\u00edvel: <strong>{fmtDate(dataAnt)}</strong>.
            </p>
          )}
        </div>
      )}

      {GRUPOS.map((g) => {
        const { linhas, total, totalAnt } = linhasDoGrupo(saldos, saldosAnt, g.natureza);
        if (linhas.length === 0) return null;
        const linhasComTotal: LinhaAnalise[] = [
          ...linhas,
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

      {saldos.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-slate-400">
          Nenhuma movimenta\u00e7\u00e3o lan\u00e7ada ainda.
        </div>
      )}
    </div>
  );
}
