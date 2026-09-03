import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import { MigrarAtivosForm } from "./migrar-form";

export default async function MigrarAtivosPage() {
  const { currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) redirect("/carteira");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Migrar carteira de outra planilha</h1>
        <p className="text-sm text-slate-500 mt-1">
          Suba qualquer CSV/XLS/XLSX com a composição da sua carteira (nome do ativo, custodiante,
          valor, cupom, vencimento) — sem precisar seguir um modelo fixo.
        </p>
      </div>

      <MigrarAtivosForm />
    </div>
  );
}
