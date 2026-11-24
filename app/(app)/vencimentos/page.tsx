import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { requireOrgContext, canManageMembers, canWrite } from "@/lib/org";
import { getSaldosPorContaAteData } from "@/lib/accounting/queries";
import { proximoCupom } from "@/lib/portfolio/conciliar-posicoes-nucleo";
import { AlertConfigForm } from "./alert-config-form";
import { fmtMoney, fmtDate } from "@/lib/format";
import { diasParaVencimento } from "@/lib/portfolio/indices";

type ItemAgenda = {
  id: string;
  origem: "ativo" | "divida";
  nome: string;
  contraparte: string | null;
  valor: number;
  data_vencimento: string;
  valorMercado: number | null;
  dataPosicao: string | null;
  proximoCupom: string | null;
};

export default async function VencimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  // Agenda so faz sentido para vencimentos futuros - sem esse filtro, um
  // ativo ja resgatado/vencido (ex.: um CD que ja pagou, ou uma posicao ja
  // liquidada que ainda tem data_vencimento cadastrada) aparecia aqui como
  // se estivesse pendente, com "dias restantes" negativo.
  // Data de corte da agenda: hoje (fuso de Brasília) por padrão, ajustável no seletor.
  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const { data: dataParam } = await searchParams;
  const dataRef = dataParam && /^\d{4}-\d{2}-\d{2}$/.test(dataParam) ? dataParam : hojeISO;
  const ehHoje = dataRef === hojeISO;

  const [{ data: ativos, error: errAtivos }, { data: dividas, error: errDividas }, { data: config }] = await Promise.all([
    supabase
      .from("ativos")
      .select("id, nome, custodiante, conta_code, valor_atual, taxa_cupom, data_vencimento, data_pagamento_anterior, periodicidade_cupom, valor_mercado, data_posicao")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null)
      .gte("data_vencimento", dataRef),
    supabase
      .from("dividas")
      .select("id, nome, credor, valor_atual, data_vencimento")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null)
      .gte("data_vencimento", dataRef),
    supabase.from("alert_configs").select("*").eq("org_id", currentOrgId).maybeSingle(),
  ]);
  if (errAtivos) throw errAtivos;
  if (errDividas) throw errDividas;

  const hoje = new Date(`${dataRef}T00:00:00Z`);
  // Valor = saldo contábil da conta vinculada na data de corte (o mesmo da Carteira); sem conta, o cadastro.
  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, dataRef);
  const saldoPorConta = new Map(saldos.map((s) => [s.conta_code, Number(s.saldo)]));
  const datasPosicao = (ativos ?? []).map((a) => a.data_posicao as string | null).filter(Boolean) as string[];
  const ultimaPosicao = datasPosicao.sort().at(-1) ?? null;

  const itens: ItemAgenda[] = [
    ...(ativos ?? []).map((a) => ({
      id: a.id,
      origem: "ativo" as const,
      nome: a.nome,
      contraparte: a.custodiante,
      valor:
        a.conta_code && saldoPorConta.has(a.conta_code)
          ? Math.abs(saldoPorConta.get(a.conta_code)!)
          : Number(a.valor_atual),
      data_vencimento: a.data_vencimento as string,
      valorMercado: a.valor_mercado != null ? Number(a.valor_mercado) : null,
      dataPosicao: (a.data_posicao as string | null) ?? null,
      proximoCupom: proximoCupom(
        a.data_pagamento_anterior as string | null,
        a.periodicidade_cupom as string | null,
        a.data_vencimento as string,
        dataRef
      ),
    })),
    ...(dividas ?? []).map((d) => ({
      id: d.id,
      origem: "divida" as const,
      nome: d.nome,
      contraparte: d.credor,
      valor: Number(d.valor_atual),
      data_vencimento: d.data_vencimento as string,
      valorMercado: null,
      dataPosicao: null,
      proximoCupom: null,
    })),
  ].sort((a, b) => (a.data_vencimento < b.data_vencimento ? -1 : 1));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Agenda de Vencimentos</h1>
        <p className="text-sm text-slate-500">
          Ativos (Carteira) e dívidas (Dívidas &amp; Passivos) com data de vencimento cadastrada, juntos numa única
          agenda, ordenados por proximidade.
        </p>
        <p className="text-xs mt-1 text-slate-500">
          Valor = saldo contábil em {fmtDate(dataRef)}.{" "}
          {ultimaPosicao
            ? `Mercado e próximo cupom conforme o extrato do custodiante (posição mais recente: ${fmtDate(ultimaPosicao)}).`
            : "Posições ainda não conferidas com o extrato do custodiante."}
        </p>
      </div>
      {canWrite(currentMembership.role) && (
        <Link
          href="/carteira/posicoes"
          className="shrink-0 inline-flex items-center gap-1.5 text-sm border border-emerald-300 text-emerald-700 rounded-md px-3 py-2 hover:bg-emerald-50"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar posições pelo extrato
        </Link>
      )}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Data de corte</label>
          <input
            type="date"
            name="data"
            defaultValue={dataRef}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
        {!ehHoje && (
          <Link href="/vencimentos" className="text-sm text-slate-500 hover:underline py-1.5">
            Voltar para hoje
          </Link>
        )}
        <span className="text-xs text-slate-400">
          Agenda a partir de <strong className="text-slate-600">{fmtDate(dataRef)}</strong>
          {ehHoje ? " (hoje)" : ""}: vencimentos e próximos cupons a partir desta data, dias restantes contados dela e
          valor contábil nesta data.
        </span>
      </form>

      {canManageMembers(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-1">Alertas automáticos</h2>
          <p className="text-xs text-slate-500 mb-3">
            Um job agendado no backend (rodando com a service role, fora do fluxo do usuário) varre os ativos e as
            dívidas de todas as organizações diariamente e dispara notificação para quem estiver a N dias do
            vencimento.
          </p>
          <AlertConfigForm config={config} />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Vencimento</th>
              <th className="text-left px-4 py-2">Origem</th>
              <th className="text-left px-4 py-2">Nome</th>
              <th className="text-left px-4 py-2">Contraparte</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-right px-4 py-2">Mercado (extrato)</th>
              <th className="text-right px-4 py-2">Próximo cupom</th>
              <th className="text-right px-4 py-2">Dias restantes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map((item) => {
              const dias = diasParaVencimento(item.data_vencimento, hoje);
              const urgente = dias <= 30;
              return (
                <tr key={`${item.origem}-${item.id}`} className={urgente ? "bg-amber-50" : "hover:bg-slate-50"}>
                  <td className="px-4 py-2">{fmtDate(item.data_vencimento)}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 ${
                        item.origem === "ativo" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"
                      }`}
                    >
                      {item.origem === "ativo" ? "Ativo" : "Dívida"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-800">{item.nome}</td>
                  <td className="px-4 py-2 text-slate-500">{item.contraparte ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(item.valor, currency)}</td>
                  <td
                    className="px-4 py-2 text-right text-slate-500"
                    title={item.dataPosicao ? `Posição em ${fmtDate(item.dataPosicao)}` : undefined}
                  >
                    {item.valorMercado != null ? fmtMoney(item.valorMercado, currency) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">
                    {item.proximoCupom ? fmtDate(item.proximoCupom) : "—"}
                  </td>
                  <td className={`px-4 py-2 text-right font-medium ${urgente ? "text-amber-700" : "text-slate-700"}`}>
                    {dias} dias
                  </td>
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-center text-slate-400">
                  Nenhum ativo ou dívida com vencimento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
