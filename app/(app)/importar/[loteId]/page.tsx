import { requireOrgContext } from "@/lib/org";
import { notFound } from "next/navigation";
import Link from "next/link";
import { TransacaoRow, type TransacaoImportada } from "./transacao-row";

export default async function LoteImportacaoPage({
  params,
}: {
  params: Promise<{ loteId: string }>;
}) {
  const { loteId } = await params;
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const { data: lote } = await supabase
    .from("import_lotes")
    .select("id, nome_arquivo, tipo_arquivo, conta_bancaria_code, total_transacoes, created_at")
    .eq("id", loteId)
    .eq("org_id", currentOrgId)
    .maybeSingle();

  if (!lote) notFound();

  const { data: transacoes } = await supabase
    .from("import_transacoes")
    .select("id, data, descricao, valor, status, conta_sugerida, confianca_sugestao, conta_confirmada")
    .eq("lote_id", loteId)
    .eq("org_id", currentOrgId)
    .order("data", { ascending: true })
    .returns<TransacaoImportada[]>();

  const { data: contas } = await supabase
    .from("plano_de_contas")
    .select("code, name")
    .eq("org_id", currentOrgId)
    .eq("is_leaf", true)
    .neq("code", lote.conta_bancaria_code)
    .order("code");

  const lista = transacoes ?? [];
  const pendentes = lista.filter((t) => t.status === "pendente").length;
  const conciliadas = lista.filter((t) => t.status === "conciliado").length;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/importar" className="text-sm text-slate-500 hover:underline">
          ← Voltar para Importar extrato
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">{lote.nome_arquivo}</h1>
        <p className="text-sm text-slate-500 font-mono">
          Conta bancária: {lote.conta_bancaria_code} · {lote.total_transacoes} transações · {pendentes}{" "}
          pendentes · {conciliadas} lançadas
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Data</th>
              <th className="text-left px-4 py-2">Descrição</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-left px-4 py-2">Contrapartida</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((t) => (
              <TransacaoRow key={t.id} transacao={t} loteId={loteId} contas={contas ?? []} currency={currency} />
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                  Nenhuma transação neste lote.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
