import { Fragment } from "react";
import { requireOrgContext } from "@/lib/org";
import { fmtMoney, fmtDate } from "@/lib/format";
import {
  gerarPrevisaoPagamentos,
  resumoPorMes,
  type AtivoProjecao,
} from "@/lib/accounting/projecao-pagamentos";

function addMesesISO(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(y, m - 1 + meses, d));
  return data.toISOString().slice(0, 10);
}

function fmtMesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const data = new Date(Date.UTC(y, m - 1, 1));
  return data.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "jan/26" — abreviado, pra caber como cabeçalho de coluna na matriz ativo x mês. */
function fmtMesCurto(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const data = new Date(Date.UTC(y, m - 1, 1));
  return data.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
}

type LinhaMatrizAtivo = {
  ativoId: string;
  nome: string;
  cupons: Record<string, number>;
  principal: Record<string, number>;
};

/** Monta a matriz Ativo x Mês (cada ativo vira duas linhas: Cupom/Juros e Principal), com os 12
 *  meses de calendário a partir do mês atual — mesmo quando um mês não tem pagamento nenhum, a
 *  coluna aparece em branco em vez de sumir, pra manter a grade sempre com 12 colunas. */
function montarMatrizAtivoMes(
  pagamentos: ReturnType<typeof gerarPrevisaoPagamentos>,
  hojeISO: string
): { meses: string[]; linhas: LinhaMatrizAtivo[] } {
  const [y, m] = hojeISO.split("-").map(Number);
  const meses: string[] = [];
  for (let i = 0; i < 12; i++) {
    const data = new Date(Date.UTC(y, m - 1 + i, 1));
    meses.push(`${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const porAtivo = new Map<string, LinhaMatrizAtivo>();
  for (const p of pagamentos) {
    const mesKey = p.data.slice(0, 7);
    if (!meses.includes(mesKey)) continue;
    if (!porAtivo.has(p.ativoId)) {
      porAtivo.set(p.ativoId, { ativoId: p.ativoId, nome: p.nome, cupons: {}, principal: {} });
    }
    const linha = porAtivo.get(p.ativoId)!;
    if (p.valorCupom != null) linha.cupons[mesKey] = (linha.cupons[mesKey] ?? 0) + p.valorCupom;
    if (p.valorPrincipal != null) linha.principal[mesKey] = (linha.principal[mesKey] ?? 0) + p.valorPrincipal;
  }

  const linhas = [...porAtivo.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  return { meses, linhas };
}

export default async function PrevisaoCaixaPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const hojeISO = new Date().toISOString().slice(0, 10);
  const horizonteISO = addMesesISO(hojeISO, 12);

  const { data: ativos, error } = await supabase
    .from("ativos")
    .select(
      "id, nome, custodiante, valor_atual, valor_face, taxa_cupom, categoria_acruo, tipo_taxa, spread_taxa, taxa_referencia_atual, periodicidade_cupom, data_pagamento_anterior, data_vencimento"
    )
    .eq("org_id", currentOrgId)
    .not("data_vencimento", "is", null)
    .gte("data_vencimento", hojeISO);
  if (error) throw error;

  const pagamentos = gerarPrevisaoPagamentos((ativos ?? []) as AtivoProjecao[], hojeISO, horizonteISO);
  const resumo = resumoPorMes(pagamentos);
  const totalGeral = resumo.reduce((acc, r) => acc + r.total, 0);
  const matriz = montarMatrizAtivoMes(pagamentos, hojeISO);

  const pendentesPeriodicidade = (ativos ?? []).filter(
    (a) => a.categoria_acruo === "periodico" && !a.periodicidade_cupom
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Previsão de Pagamentos</h1>
        <p className="text-sm text-slate-500">
          Projeção de caixa dos próximos 12 meses ({fmtDate(hojeISO)} a {fmtDate(horizonteISO)}): cupons de
          juros esperados e principal no vencimento de cada título de renda fixa da Carteira. Puramente
          informativo — não gera nenhum lançamento contábil.
        </p>
      </div>

      {pendentesPeriodicidade.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 text-sm text-amber-800 space-y-1">
          <p className="font-medium">
            {pendentesPeriodicidade.length}{" "}
            {pendentesPeriodicidade.length === 1 ? "título sem periodicidade de cupom cadastrada" : "títulos sem periodicidade de cupom cadastrada"}
            :
          </p>
          <p>
            {pendentesPeriodicidade.map((a) => a.nome).join("; ")}. Para esses, a tabela abaixo mostra só o
            valor total no vencimento, sem separar os cupons intermediários. Peça pra eu rodar o SQL que
            cadastra a periodicidade (mensal/trimestral/semestral/anual) de cada um, se você souber.
          </p>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-900">Resumo por mês</h2>
          <span className="text-sm text-slate-500">
            Total 12 meses: <strong className="text-slate-900">{fmtMoney(totalGeral, currency)}</strong>
          </span>
        </div>
        {resumo.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-6 text-center text-sm text-slate-400">
            Nenhum pagamento previsto nos próximos 12 meses.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {resumo.map((r) => (
              <div
                key={r.mes}
                className={`rounded-xl border px-4 py-3 ${
                  r.totalPrincipal > 0
                    ? "bg-blue-50/60 border-blue-200"
                    : "bg-white border-slate-200"
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 capitalize">
                  {fmtMesLabel(r.mes)}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{fmtMoney(r.total, currency)}</p>
                <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                  <div className="flex justify-between">
                    <span>Cupons/juros</span>
                    <span>{fmtMoney(r.totalCupons, currency)}</span>
                  </div>
                  {r.totalPrincipal > 0 && (
                    <div className="flex justify-between font-medium text-blue-700">
                      <span>Principal</span>
                      <span>{fmtMoney(r.totalPrincipal, currency)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-medium text-slate-900">Ativo x mês</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Cada título em duas linhas (cupom/juros e principal), uma coluna por mês dos próximos 12 meses.
          </p>
        </div>
        {matriz.linhas.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhum pagamento previsto nos próximos 12 meses.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2 sticky left-0 bg-slate-50 whitespace-nowrap">Ativo</th>
                  {matriz.meses.map((mes) => (
                    <th key={mes} className="text-right px-3 py-2 whitespace-nowrap capitalize">
                      {fmtMesCurto(mes)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matriz.linhas.map((linha) => (
                  <Fragment key={linha.ativoId}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-1.5 sticky left-0 bg-white whitespace-nowrap text-slate-800">
                        {linha.nome}
                        <span className="block text-xs text-slate-400 font-normal">Cupom/Juros</span>
                      </td>
                      {matriz.meses.map((mes) => (
                        <td key={mes} className="px-3 py-1.5 text-right text-slate-700 whitespace-nowrap">
                          {linha.cupons[mes] ? fmtMoney(linha.cupons[mes], currency) : ""}
                        </td>
                      ))}
                    </tr>
                    <tr className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="px-4 py-1.5 sticky left-0 bg-white whitespace-nowrap text-slate-500 text-xs">
                        Principal
                      </td>
                      {matriz.meses.map((mes) => (
                        <td key={mes} className="px-3 py-1.5 text-right text-blue-700 font-medium whitespace-nowrap">
                          {linha.principal[mes] ? fmtMoney(linha.principal[mes], currency) : ""}
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-medium text-slate-900">Detalhe por pagamento</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Data</th>
              <th className="text-left px-4 py-2">Título</th>
              <th className="text-left px-4 py-2">Custodiante</th>
              <th className="text-left px-4 py-2">Tipo</th>
              <th className="text-right px-4 py-2">Cupom</th>
              <th className="text-right px-4 py-2">Principal</th>
              <th className="text-right px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pagamentos.map((p, i) => (
              <tr key={`${p.ativoId}-${p.data}-${i}`} className="hover:bg-slate-50 align-top">
                <td className="px-4 py-2 whitespace-nowrap">{fmtDate(p.data)}</td>
                <td className="px-4 py-2 text-slate-800">
                  {p.nome}
                  {p.observacao && (
                    <div className="text-xs text-amber-600 mt-0.5">{p.observacao}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-slate-500">{p.custodiante ?? "—"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 ${
                      p.tipo === "cupom"
                        ? "bg-emerald-50 text-emerald-700"
                        : p.tipo === "cupom_final"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.tipo === "cupom"
                      ? "Cupom"
                      : p.tipo === "cupom_final"
                        ? "Cupom final + principal"
                        : "Vencimento"}
                  </span>
                  {p.estimado && <span className="ml-1 text-xs text-amber-600">(estimado)</span>}
                </td>
                <td className="px-4 py-2 text-right">{p.valorCupom != null ? fmtMoney(p.valorCupom, currency) : "—"}</td>
                <td className="px-4 py-2 text-right">{p.valorPrincipal != null ? fmtMoney(p.valorPrincipal, currency) : "—"}</td>
                <td className="px-4 py-2 text-right font-medium text-slate-900">{fmtMoney(p.valorTotal, currency)}</td>
              </tr>
            ))}
            {pagamentos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-slate-400">
                  Nenhum pagamento previsto nos próximos 12 meses.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Os cupons são simulados a partir da data do último pagamento (data_pagamento_anterior) e da
        periodicidade cadastrada de cada título — se algum título tiver essa data desatualizada, a agenda
        simulada também fica desatualizada. Títulos com taxa flutuante (ex.: SOFR + spread) usam a última
        taxa de referência conhecida, que pode variar até a data real do pagamento.
      </p>
    </div>
  );
}
