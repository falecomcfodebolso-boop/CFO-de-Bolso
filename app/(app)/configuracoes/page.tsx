import Link from "next/link";
import { requireOrgContext, canManageMembers } from "@/lib/org";
import { RegimeTributarioForm } from "./regime-form";

export default async function ConfiguracoesPage() {
  const { currentMembership } = await requireOrgContext();
  const org = currentMembership.organizations;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500 mt-1">{org?.name}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Outras empresas</h2>
        <p className="text-sm text-slate-500 mb-3">
          Você pode ter várias organizações com o mesmo login, cada uma com dados totalmente isolados.
        </p>
        <Link
          href="/signup/organizacao"
          className="inline-block rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
        >
          + Cadastrar nova empresa
        </Link>
      </div>

      {org?.base_currency === "BRL" ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Regime tributário</h2>
          <p className="text-sm text-slate-500 mb-3">
            Define o que aparece em{" "}
            <Link href="/obrigacoes-fiscais" className="underline">
              Obrigações Fiscais
            </Link>
            .
          </p>
          {canManageMembers(currentMembership.role) ? (
            <RegimeTributarioForm
              regimeAtual={org.regime_tributario}
              atividadeAtual={org.atividade_tributaria}
              aliquotaIssAtual={org.aliquota_iss}
              dataAberturaAtual={org.data_abertura_atividade}
            />
          ) : (
            <p className="text-sm text-slate-400">
              Só o dono ou administrador da organização pode alterar isso.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Regime tributário</h2>
          <p className="text-sm text-slate-500">
            Disponível apenas para organizações com moeda base em Reais (BRL). Esta organização usa{" "}
            {org?.base_currency}.
          </p>
        </div>
      )}
    </div>
  );
}
