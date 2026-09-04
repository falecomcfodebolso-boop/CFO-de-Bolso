import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ImportarApuracaoForm } from "./importar-form";

export default async function ImportarApuracaoPage() {
  const { currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) redirect("/ajustes");

  return (
    <div className="space-y-4">
      <div>
        <Link href="/ajustes" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Ajustes
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">Importar apurações de um PDF do banco</h1>
        <p className="text-sm text-slate-500 mt-1">
          Envie o &ldquo;Statement&rdquo; mensal do Itaú Private Bank. O sistema lê a seção de renda fixa,
          casa cada papel com os Ativos já cadastrados (pelo ISIN) e soma os juros acruados por grupo —
          você revisa os valores sugeridos e confirma antes de qualquer coisa ser gravada. O lançamento
          contábil continua exigindo aprovação separada (&ldquo;Lançar no Diário&rdquo;, na tela de
          Ajustes).
        </p>
      </div>

      <ImportarApuracaoForm />
    </div>
  );
}
