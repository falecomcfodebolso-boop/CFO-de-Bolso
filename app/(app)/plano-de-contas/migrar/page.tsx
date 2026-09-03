import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import { MigrarForm } from "./migrar-form";

export default async function MigrarDadosPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) redirect("/plano-de-contas");

  const { data: contas } = await supabase
    .from("plano_de_contas")
    .select("code, name, natureza")
    .eq("org_id", currentOrgId)
    .order("code");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Migração de dados contábeis</h1>
        <p className="text-sm text-slate-500 mt-1">
          Traga o plano de contas, os saldos de abertura e/ou o histórico de lançamentos de um
          sistema anterior, a partir de uma planilha ou CSV — sem precisar seguir um modelo fixo:
          você mesma indica qual coluna do seu arquivo corresponde a cada campo.
        </p>
      </div>

      <MigrarForm contasExistentes={contas ?? []} />
    </div>
  );
}
