import { requireOrgContext, canWrite } from "@/lib/org";
import { NovoLancamentoForm } from "./novo-lancamento-form";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function DiarioPage() {
  const { supabase, currentOrgId, currentMembership, memberships } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const [{ data: contas }, { data: lancamentos, error }] = await Promise.all([
    supabase.from("plano_de_contas").select("code, name").eq("org_id", currentOrgId).order("code"),
    supabase
      .from("lancamentos")
      .select("id, numero, data, historico, lancamento_linhas(conta_code, tipo, valor)")
      .eq("org_id", currentOrgId)
      .order("numero", { ascending: false })
      .limit(50),
  ]);

  if (error) throw error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Diário</h1>
        <p className="text-sm text-slate-500">
          Lançamentos em partida dobrada. O banco valida automaticamente que débitos = créditos.
        </p>
      </div>

      {canWrite(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Novo lançamento</h2>
          <NovoLancamentoForm
            contas={contas ?? []}
            outrasEmpresas={memberships
              .filter((m) => m.org_id !== currentOrgId)
              .map((m) => ({ id: m.org_id, nome: m.organizations?.name ?? "(empresa)" }))}
          />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
          Últimos lançamentos
        </div>
        {!lancamentos || lancamentos.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-4">Nenhum lançamento ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {lancamentos.map((l) => (
              <div key={l.id} className="px-4 py-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-slate-900">
                    Lçto #{l.numero} — {l.historico}
                  </span>
                  <span className="text-slate-500">{fmtDate(l.data)}</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-0.5 ml-2">
                  {(l.lancamento_linhas as { conta_code: string; tipo: string; valor: number }[])
                    .sort((a) => (a.tipo === "D" ? -1 : 1))
                    .map((ln, i) => (
                      <li key={i}>
                        {ln.tipo === "D" ? "D" : "  C"} {ln.conta_code} — {fmtMoney(ln.valor, currency)}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
