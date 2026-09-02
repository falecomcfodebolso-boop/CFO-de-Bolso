import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EstruturarForm } from "./estruturar-form";

export default async function EstruturarPlanoDeContasPage() {
  const { currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) redirect("/plano-de-contas");

  const moeda = currentMembership.organizations?.base_currency ?? "USD";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/plano-de-contas" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Plano de Contas
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">Estruturar plano de contas com IA</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ideal para quando a empresa nunca teve uma contabilidade organizada. Descreva o perfil do negócio
          abaixo e o CFO de Bolso sugere um plano de contas inicial completo — você revisa e escolhe quais
          contas realmente criar antes de qualquer coisa ser gravada.
        </p>
      </div>

      <EstruturarForm moeda={moeda} />
    </div>
  );
}
