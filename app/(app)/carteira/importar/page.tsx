import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ImportarPortfolioForm } from "./importar-form";

export default async function ImportarPortfolioPage() {
  const { currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) redirect("/carteira");

  const currency = currentMembership.organizations?.base_currency ?? "USD";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/carteira" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Carteira
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">Importar posições de um PDF de custódia</h1>
        <p className="text-sm text-slate-500 mt-1">
          Envie o PDF do extrato da sua conta de investimentos/custódia (ex: Bradesco Bank International). O
          sistema lê a seção &ldquo;Portfolio Holdings&rdquo; e sugere os ativos a cadastrar — você revisa,
          edita e escolhe quais realmente criar antes de qualquer coisa ser gravada. Se o PDF combinar vários
          meses, só o mês mais recente é considerado.
        </p>
      </div>

      <ImportarPortfolioForm moeda={currency} />
    </div>
  );
}
