import { requireOrgContext, canWrite } from "@/lib/org";
import { NovaContaForm } from "./nova-conta-form";
import Link from "next/link";
import { Sparkles } from "lucide-react";

const NATUREZA_LABEL: Record<string, string> = {
  ATIVO: "1 · Ativo",
  PASSIVO: "2 · Passivo",
  PL: "3 · Patrimônio Líquido",
  RECEITA: "4 · Receita",
  DESPESA: "5 · Despesa",
  CONTROLE: "9 · Controle",
};

export default async function PlanoDeContasPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();

  const { data: contas, error } = await supabase
    .from("plano_de_contas")
    .select("code, name, natureza, parent_code")
    .eq("org_id", currentOrgId)
    .order("code");

  if (error) throw error;

  const grupos = Object.keys(NATUREZA_LABEL).map((nat) => ({
    natureza: nat,
    label: NATUREZA_LABEL[nat],
    contas: (contas ?? []).filter((c) => c.natureza === nat),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Plano de Contas</h1>
          <p className="text-sm text-slate-500">
            Uma subconta por ativo/conta facilita a conferência linha a linha com o Diário.
          </p>
        </div>
        {canWrite(currentMembership.role) && (
          <Link
            href="/plano-de-contas/estruturar"
            className="shrink-0 inline-flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-md px-3 py-2 hover:bg-slate-800"
          >
            <Sparkles className="h-4 w-4" />
            Estruturar com IA
          </Link>
        )}
      </div>

      {canWrite(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Nova conta</h2>
          <NovaContaForm />
        </div>
      )}

      <div className="space-y-4">
        {grupos.map((g) => (
          <div key={g.natureza} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
              {g.label} <span className="text-slate-400">({g.contas.length})</span>
            </div>
            {g.contas.length === 0 ? (
              <p className="text-sm text-slate-400 px-4 py-3">Nenhuma conta cadastrada.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {g.contas.map((c) => (
                    <tr key={c.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs text-slate-500 w-32">{c.code}</td>
                      <td className="px-4 py-2 text-slate-800">
                        <Link href={`/razoes/${encodeURIComponent(c.code)}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
