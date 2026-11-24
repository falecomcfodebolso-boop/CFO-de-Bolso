import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrgContext, canWrite } from "@/lib/org";
import { AtualizarPosicoesForm } from "./posicoes-form";

export default async function AtualizarPosicoesPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) redirect("/carteira");
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const { data } = await supabase
    .from("ativos")
    .select("custodiante, data_posicao")
    .eq("org_id", currentOrgId)
    .not("data_posicao", "is", null);
  const ultimas = new Map<string, string>();
  for (const a of data ?? []) {
    const c = a.custodiante ?? "—";
    if (!ultimas.has(c) || (a.data_posicao as string) > ultimas.get(c)!) ultimas.set(c, a.data_posicao as string);
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/carteira" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Carteira
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">Atualizar posições pelo extrato</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Envie o extrato de investimentos do mês (Statement do Itaú Private Bank ou extrato de investimentos do
          Bradesco). O sistema confere cada papel pelo ISIN/CUSIP e atualiza quantidade, valor de mercado, juros
          acruados e a data-base da posição em Carteira e Vencimentos. A contabilidade não é alterada. Os extratos
          que chegam pela importação ou pela automação diária já fazem essa atualização sozinhos.
        </p>
        {ultimas.size > 0 && (
          <p className="text-xs text-slate-500 mt-2">
            Última posição gravada:{" "}
            {[...ultimas.entries()]
              .map(([c, d]) => `${c} em ${new Date(`${d}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`)
              .join(" · ")}
          </p>
        )}
      </div>
      <AtualizarPosicoesForm moeda={currency} />
    </div>
  );
}
