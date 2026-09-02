import { requireOrgContext } from "@/lib/org";
import { UploadForm } from "./upload-form";
import { fmtDate } from "@/lib/format";
import Link from "next/link";

export default async function ImportarPage() {
  const { supabase, currentOrgId } = await requireOrgContext();

  const { data: contas } = await supabase
    .from("plano_de_contas")
    .select("code, name")
    .eq("org_id", currentOrgId)
    .eq("natureza", "ATIVO")
    .eq("is_leaf", true)
    .order("code");

  const { data: lotes } = await supabase
    .from("import_lotes")
    .select("id, nome_arquivo, tipo_arquivo, total_transacoes, conta_bancaria_code, created_at")
    .eq("org_id", currentOrgId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Importar extrato</h1>
        <p className="text-sm text-slate-500 mt-1">
          Suba um extrato bancário (OFX, CSV, XLS/XLSX ou PDF) para gerar sugestões de lançamento
          automaticamente. Você revisa e confirma cada transação antes de virar lançamento de verdade no
          Diário — nada é lançado sem sua confirmação.
        </p>
      </div>

      <UploadForm contasBancarias={contas ?? []} />

      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Importações recentes</h2>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Arquivo</th>
                <th className="text-left px-4 py-2">Conta bancária</th>
                <th className="text-right px-4 py-2">Transações</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(lotes ?? []).map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-500">{fmtDate(l.created_at)}</td>
                  <td className="px-4 py-2 text-slate-800">
                    {l.nome_arquivo} <span className="text-xs text-slate-400 uppercase">({l.tipo_arquivo})</span>
                  </td>
                  <td className="px-4 py-2 text-slate-500 font-mono">{l.conta_bancaria_code}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{l.total_transacoes}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/importar/${l.id}`} className="text-slate-600 hover:underline">
                      Revisar →
                    </Link>
                  </td>
                </tr>
              ))}
              {(!lotes || lotes.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-slate-400">
                    Nenhuma importação ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
