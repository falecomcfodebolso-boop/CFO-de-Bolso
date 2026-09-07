import { requireOrgContext, canWrite } from "@/lib/org";
import { NovoLancamentoForm } from "./novo-lancamento-form";
import { fmtDate, fmtMoney } from "@/lib/format";
import { ExportButtons } from "../demonstracoes/export-buttons";

const LIMITE = 500;

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ dataInicio?: string; dataFim?: string }>;
}) {
  const { dataInicio: dataInicioParam, dataFim: dataFimParam } = await searchParams;
  const dataInicio = dataInicioParam || inicioDoAno();
  const dataFim = dataFimParam || hoje();

  const { supabase, currentOrgId, currentMembership, memberships } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const [{ data: contas }, { data: lancamentos, error }] = await Promise.all([
    supabase.from("plano_de_contas").select("code, name").eq("org_id", currentOrgId).order("code"),
    supabase
      .from("lancamentos")
      .select("id, numero, data, historico, lancamento_linhas(conta_code, tipo, valor)")
      .eq("org_id", currentOrgId)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: false })
      .order("numero", { ascending: false })
      .limit(LIMITE),
  ]);

  if (error) throw error;

  const truncado = (lancamentos?.length ?? 0) >= LIMITE;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Diário</h1>
          <p className="text-sm text-slate-500">
            Lançamentos em partida dobrada. O banco valida automaticamente que débitos = créditos.
          </p>
        </div>
        <ExportButtons hrefBase="/api/export/diario" query={{ dataInicio, dataFim }} />
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

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">De</label>
          <input
            type="date"
            name="dataInicio"
            defaultValue={dataInicio}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Até</label>
          <input type="date" name="dataFim" defaultValue={dataFim} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Filtrar
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700 flex items-center justify-between">
          <span>
            Lançamentos de {fmtDate(dataInicio)} a {fmtDate(dataFim)}
          </span>
          <span className="text-xs text-slate-500 font-normal">{lancamentos?.length ?? 0} lançamento(s)</span>
        </div>
        {truncado && (
          <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
            Mostrando os {LIMITE} lançamentos mais recentes do período selecionado. Estreite o período (De/Até) acima
            para ver os demais.
          </div>
        )}
        {!lancamentos || lancamentos.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-4">Nenhum lançamento neste período.</p>
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
