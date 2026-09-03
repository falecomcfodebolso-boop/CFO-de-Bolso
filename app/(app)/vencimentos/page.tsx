import { requireOrgContext, canManageMembers } from "@/lib/org";
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
};

export default async function VencimentosPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const [{ data: ativos, error: errAtivos }, { data: dividas, error: errDividas }, { data: config }] = await Promise.all([
    supabase
      .from("ativos")
      .select("id, nome, custodiante, valor_atual, taxa_cupom, data_vencimento")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null),
    supabase
      .from("dividas")
      .select("id, nome, credor, valor_atual, data_vencimento")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null),
    supabase.from("alert_configs").select("*").eq("org_id", currentOrgId).maybeSingle(),
  ]);
  if (errAtivos) throw errAtivos;
  if (errDividas) throw errDividas;

  const hoje = new Date();

  const itens: ItemAgenda[] = [
    ...(ativos ?? []).map((a) => ({
      id: a.id,
      origem: "ativo" as const,
      nome: a.nome,
      contraparte: a.custodiante,
      valor: Number(a.valor_atual),
      data_vencimento: a.data_vencimento as string,
    })),
    ...(dividas ?? []).map((d) => ({
      id: d.id,
      origem: "divida" as const,
      nome: d.nome,
      contraparte: d.credor,
      valor: Number(d.valor_atual),
      data_vencimento: d.data_vencimento as string,
    })),
  ].sort((a, b) => (a.data_vencimento < b.data_vencimento ? -1 : 1));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Agenda de Vencimentos</h1>
        <p className="text-sm text-slate-500">
          Ativos (Carteira) e dívidas (Dívidas &amp; Passivos) com data de vencimento cadastrada, juntos numa única
          agenda, ordenados por proximidade.
        </p>
      </div>

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
                  <td className={`px-4 py-2 text-right font-medium ${urgente ? "text-amber-700" : "text-slate-700"}`}>
                    {dias} dias
                  </td>
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-slate-400">
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
