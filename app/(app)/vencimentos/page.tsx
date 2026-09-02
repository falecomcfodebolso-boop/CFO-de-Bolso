import { requireOrgContext, canManageMembers } from "@/lib/org";
import { AlertConfigForm } from "./alert-config-form";
import { fmtMoney, fmtDate } from "@/lib/format";
import { diasParaVencimento } from "@/lib/portfolio/indices";

export default async function VencimentosPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const [{ data: ativos, error }, { data: config }] = await Promise.all([
    supabase
      .from("ativos")
      .select("id, nome, custodiante, valor_atual, taxa_cupom, data_vencimento")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null)
      .order("data_vencimento", { ascending: true }),
    supabase.from("alert_configs").select("*").eq("org_id", currentOrgId).maybeSingle(),
  ]);
  if (error) throw error;

  const hoje = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Agenda de Vencimentos</h1>
        <p className="text-sm text-slate-500">
          Ativos com data de vencimento cadastrada, ordenados por proximidade.
        </p>
      </div>

      {canManageMembers(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-1">Alertas automáticos</h2>
          <p className="text-xs text-slate-500 mb-3">
            Um job agendado no backend (rodando com a service role, fora do fluxo do usuário) varre a tabela de ativos de
            todas as organizações diariamente e dispara notificação para quem estiver a N dias do vencimento.
          </p>
          <AlertConfigForm config={config} />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Vencimento</th>
              <th className="text-left px-4 py-2">Ativo</th>
              <th className="text-left px-4 py-2">Custodiante</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-right px-4 py-2">Dias restantes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(ativos ?? []).map((a) => {
              const dias = diasParaVencimento(a.data_vencimento as string, hoje);
              const urgente = dias <= 30;
              return (
                <tr key={a.id} className={urgente ? "bg-amber-50" : "hover:bg-slate-50"}>
                  <td className="px-4 py-2">{fmtDate(a.data_vencimento as string)}</td>
                  <td className="px-4 py-2 text-slate-800">{a.nome}</td>
                  <td className="px-4 py-2 text-slate-500">{a.custodiante ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(Number(a.valor_atual), currency)}</td>
                  <td className={`px-4 py-2 text-right font-medium ${urgente ? "text-amber-700" : "text-slate-700"}`}>
                    {dias} dias
                  </td>
                </tr>
              );
            })}
            {(!ativos || ativos.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                  Nenhum ativo com vencimento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
