import { requireOrgContext, canWrite } from "@/lib/org";
import { deleteAjusteAction } from "./actions";
import { NovoAjusteForm } from "./novo-ajuste-form";
import { fmtMoney } from "@/lib/format";

export default async function AjustesPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const podeEscrever = canWrite(currentMembership.role);

  const [{ data: contasData }, { data: ativosData }, { data: ajustesData }] = await Promise.all([
    supabase.from("plano_de_contas").select("code, name").eq("org_id", currentOrgId).order("code"),
    supabase
      .from("ativos")
      .select("id, nome, taxa_cupom, conta_code")
      .eq("org_id", currentOrgId)
      .order("nome"),
    supabase
      .from("ajustes_acruo")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("data_base", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const contas = contasData ?? [];
  const ativos = ativosData ?? [];
  const ajustes = ajustesData ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ajustes de Acruamento</h1>
        <p className="text-sm text-slate-500 mt-1">
          Reconhecimento de receitas e despesas acruadas — compare o saldo já lançado na
          contabilidade com o valor informado pelo extrato/valuation statement do banco ou
          custodiante e, opcionalmente, com uma estimativa interna, gerando automaticamente o
          lançamento de ajuste (variação do acruo) quando houver diferença.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-2">
        <p className="font-medium text-slate-700">Política de reconhecimento adotada</p>
        <p>
          O valor reportado pelo banco/custodiante na data-base é a fonte oficial do acruo — é ele
          que é registrado na contabilidade (não um cálculo interno). O lançamento gerado reflete a
          <strong> variação</strong> do acruo no período (diferença entre o saldo contábil atual da
          conta de acruo e o valor informado pelo extrato), líquida de eventuais recebimentos.
        </p>
        <p>
          Quando o ativo tiver uma taxa de cupom cadastrada, esta tela também calcula, apenas para
          fins de comparação/justificativa da política, uma estimativa interna simplificada
          (regime de competência, base 360 dias corridos: principal × taxa de cupom anual × dias
          corridos desde a última apuração ÷ 360). Essa estimativa é aproximada e não substitui o
          valor do extrato.
        </p>
      </div>

      {podeEscrever && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Nova apuração</h2>
          <NovoAjusteForm contas={contas} ativos={ativos} />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Data-base</th>
              <th className="text-left px-3 py-2">Grupo</th>
              <th className="text-left px-3 py-2">Conta de acruo</th>
              <th className="text-right px-3 py-2">Contábil (antes)</th>
              <th className="text-right px-3 py-2">Banco/extrato</th>
              <th className="text-right px-3 py-2">Cálculo interno</th>
              <th className="text-right px-3 py-2">Diferença lançada</th>
              <th className="text-left px-3 py-2">Fonte</th>
              {podeEscrever && <th></th>}
            </tr>
          </thead>
          <tbody>
            {ajustes.length === 0 && (
              <tr>
                <td colSpan={podeEscrever ? 9 : 8} className="px-3 py-6 text-center text-slate-400">
                  Nenhuma apuração de acruamento registrada ainda.
                </td>
              </tr>
            )}
            {ajustes.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{new Date(`${a.data_base}T00:00:00Z`).toLocaleDateString("pt-BR")}</td>
                <td className="px-3 py-2">{a.nome_grupo}</td>
                <td className="px-3 py-2 text-slate-500">{a.conta_acruo_code}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(a.saldo_contabil_antes)}</td>
                <td className="px-3 py-2 text-right">{fmtMoney(a.valor_reportado_banco)}</td>
                <td className="px-3 py-2 text-right text-slate-500">
                  {a.acruo_calculado_interno != null ? fmtMoney(a.acruo_calculado_interno) : "—"}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${a.diferenca >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtMoney(a.diferenca)}
                </td>
                <td className="px-3 py-2 text-slate-500">{a.fonte || "—"}</td>
                {podeEscrever && (
                  <td className="px-3 py-2 text-right">
                    <form action={deleteAjusteAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        excluir
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
