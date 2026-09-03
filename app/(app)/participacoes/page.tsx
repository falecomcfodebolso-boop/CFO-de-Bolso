import Link from "next/link";
import { requireOrgContext, canManageMembers } from "@/lib/org";
import { getParticipacoes } from "@/lib/accounting/consolidacao";
import { fmtDate } from "@/lib/format";
import { NovaParticipacaoForm } from "./nova-participacao-form";
import { ExcluirParticipacaoButton } from "./excluir-participacao-button";

export default async function ParticipacoesPage() {
  const { supabase, currentOrgId, currentMembership, memberships } = await requireOrgContext();

  const [participacoesComoInvestidora, { data: participacoesComoInvestida }] = await Promise.all([
    getParticipacoes(supabase, currentOrgId),
    supabase
      .from("participacoes_societarias")
      .select("id, percentual, data_referencia, organizations!investidora_org_id(name)")
      .eq("investida_org_id", currentOrgId),
  ]);

  const outrasEmpresas = memberships
    .filter((m) => m.org_id !== currentOrgId)
    .map((m) => ({ id: m.org_id, nome: m.organizations?.name ?? "(empresa)" }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Participações Societárias</h1>
        <p className="text-sm text-slate-500 mt-1">
          Registre aqui quando esta empresa ({currentMembership.organizations?.name}) é dona de uma
          participação em outra empresa cadastrada no seu login. Participações acima de 50% são
          tratadas como controle (consolidação integral em{" "}
          <Link href="/consolidado" className="underline">
            Consolidado
          </Link>
          ); 50% ou menos, como equivalência patrimonial (MEP).
        </p>
      </div>

      {canManageMembers(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Nova participação</h2>
          {outrasEmpresas.length === 0 ? (
            <p className="text-sm text-slate-500">
              Você ainda só tem uma empresa cadastrada no seu login. Cadastre outra em{" "}
              <Link href="/signup/organizacao" className="underline">
                Configurações → + Cadastrar nova empresa
              </Link>{" "}
              pra poder registrar uma participação.
            </p>
          ) : (
            <NovaParticipacaoForm outrasEmpresas={outrasEmpresas} />
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
          Empresas em que {currentMembership.organizations?.name} tem participação
        </div>
        {participacoesComoInvestidora.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-4">Nenhuma participação registrada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {participacoesComoInvestidora.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {p.investida_nome}{" "}
                    <span className="text-xs text-slate-400">
                      ({(p.percentual * 100).toFixed(2)}% ·{" "}
                      {p.tipo === "CONTROLADA" ? "controlada" : "coligada (MEP)"})
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">desde {fmtDate(p.data_referencia)}</div>
                </div>
                {canManageMembers(currentMembership.role) && <ExcluirParticipacaoButton participacaoId={p.id} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {participacoesComoInvestida && participacoesComoInvestida.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
            Empresas que têm participação em {currentMembership.organizations?.name}
          </div>
          <div className="divide-y divide-slate-100">
            {participacoesComoInvestida.map((p) => {
              const org = p.organizations as unknown as { name: string } | null;
              return (
                <div key={p.id} className="px-4 py-3 text-sm text-slate-700">
                  {org?.name ?? "(empresa)"} — {(Number(p.percentual) * 100).toFixed(2)}%
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
