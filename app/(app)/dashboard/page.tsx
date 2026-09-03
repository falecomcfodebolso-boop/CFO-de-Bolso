import { requireOrgContext } from "@/lib/org";
import { getSaldosPorConta, totalPorNatureza } from "@/lib/accounting/queries";
import { fmtMoney, fmtDate } from "@/lib/format";
import Link from "next/link";

export default async function DashboardPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const saldos = await getSaldosPorConta(supabase, currentOrgId);
  const ativo = totalPorNatureza(saldos, "ATIVO");
  const passivo = totalPorNatureza(saldos, "PASSIVO");
  const receita = totalPorNatureza(saldos, "RECEITA");
  const despesa = totalPorNatureza(saldos, "DESPESA");
  const resultado = receita - despesa;

  const [{ data: ativosVencendo }, { data: dividasVencendo }] = await Promise.all([
    supabase
      .from("ativos")
      .select("id, nome, data_vencimento")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null),
    supabase
      .from("dividas")
      .select("id, nome, data_vencimento")
      .eq("org_id", currentOrgId)
      .not("data_vencimento", "is", null),
  ]);

  const proximosVencimentos = [...(ativosVencendo ?? []), ...(dividasVencendo ?? [])]
    .sort((a, b) => (a.data_vencimento! < b.data_vencimento! ? -1 : 1))
    .slice(0, 5);

  const cards = [
    { label: "Ativo Total", value: ativo, tone: "text-slate-900" },
    { label: "Passivo Total", value: passivo, tone: "text-slate-900" },
    { label: "Resultado do Período", value: resultado, tone: resultado >= 0 ? "text-emerald-600" : "text-red-600" },
    { label: "Patrimônio (Ativo - Passivo)", value: ativo - passivo, tone: "text-slate-900" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Visão geral de {currentMembership.organizations?.name}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-2xl font-semibold mt-1 ${c.tone}`}>{fmtMoney(c.value, currency)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="font-medium text-slate-900 mb-3">Próximos vencimentos</h2>
          {!proximosVencimentos || proximosVencimentos.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum ativo ou dívida com vencimento cadastrado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {proximosVencimentos.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{a.nome}</span>
                  <span className="text-slate-500">
                    {a.data_vencimento ? fmtDate(a.data_vencimento) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/vencimentos" className="text-sm text-slate-900 underline mt-3 inline-block">
            Ver agenda completa
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="font-medium text-slate-900 mb-3">Atalhos</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link href="/diario" className="rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              Novo lançamento →
            </Link>
            <Link href="/cfo-bolso" className="rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              Perguntar ao CFO de Bolso →
            </Link>
            <Link href="/balancete" className="rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              Ver Balancete →
            </Link>
            <Link href="/carteira" className="rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              Índices da carteira →
            </Link>
            <Link href="/dividas" className="rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50">
              Dívidas &amp; Passivos →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
