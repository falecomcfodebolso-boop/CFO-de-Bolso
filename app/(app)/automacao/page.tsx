import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { fmtDateNumerica } from "@/lib/format";

type Execucao = {
  id: string;
  created_at: string;
  email_assunto: string | null;
  nome_arquivo: string;
  status: "sucesso" | "revisar" | "erro" | "ignorado";
  periodo_inicio: string | null;
  periodo_fim: string | null;
  lote_id: string | null;
  total_transacoes: number;
  lancamentos_criados: number;
  pendencias: { tipo: string; mensagem: string }[];
  relatorio_path: string | null;
};

type Regra = { id: string; nome: string; identificador: string; conta_bancaria_code: string; ativo: boolean };

const ESTILO_STATUS: Record<Execucao["status"], { label: string; cls: string }> = {
  sucesso: { label: "Lançado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  revisar: { label: "Revisar", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  erro: { label: "Erro", cls: "bg-red-50 text-red-700 border-red-200" },
  ignorado: { label: "Ignorado", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

export default async function AutomacaoPage() {
  const { supabase, currentOrgId } = await requireOrgContext();
  const [{ data: execucoes }, { data: regras }] = await Promise.all([
    supabase
      .from("automacao_execucoes")
      .select(
        "id, created_at, email_assunto, nome_arquivo, status, periodo_inicio, periodo_fim, lote_id, total_transacoes, lancamentos_criados, pendencias, relatorio_path"
      )
      .eq("org_id", currentOrgId)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<Execucao[]>(),
    supabase
      .from("automacao_regras")
      .select("id, nome, identificador, conta_bancaria_code, ativo")
      .eq("org_id", currentOrgId)
      .order("nome")
      .returns<Regra[]>(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Automação</h1>
        <p className="text-sm text-slate-500">
          Todo dia a rotina lê os extratos enviados por e-mail, importa, valida e só lança no Diário se não houver
          nenhuma pendência. Com tudo certo, gera o relatório completo do período e envia por e-mail.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-medium text-slate-900 mb-2">Como enviar</h2>
        <p className="text-sm text-slate-600 mb-3">
          Encaminhe o extrato para a caixa da automação com um destes identificadores no assunto (ou no nome do
          arquivo):
        </p>
        {!regras || regras.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma regra cadastrada para esta organização.</p>
        ) : (
          <ul className="text-sm divide-y divide-slate-100">
            {regras.map((r) => (
              <li key={r.id} className="py-1.5 flex justify-between gap-4">
                <span className="text-slate-700">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5">{r.identificador}</code> → {r.nome}
                </span>
                <span className="text-slate-500">
                  conta {r.conta_bancaria_code}
                  {!r.ativo && " · inativa"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-medium text-slate-900 mb-3">Histórico</h2>
        {!execucoes || execucoes.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum extrato processado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {execucoes.map((e) => {
              const st = ESTILO_STATUS[e.status];
              return (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    <span className="font-medium text-slate-900">{e.nome_arquivo}</span>
                    <span className="text-slate-500">
                      {fmtDateNumerica(e.created_at.slice(0, 10))}
                      {e.periodo_inicio && e.periodo_fim
                        ? ` · período ${fmtDateNumerica(e.periodo_inicio)} a ${fmtDateNumerica(e.periodo_fim)}`
                        : ""}
                      {` · ${e.lancamentos_criados}/${e.total_transacoes} lançadas`}
                    </span>
                    <span className="ml-auto flex gap-3">
                      {e.lote_id && e.status !== "sucesso" && (
                        <Link href={`/importar/${e.lote_id}`} className="text-slate-900 underline">
                          Revisar
                        </Link>
                      )}
                      {e.relatorio_path && (
                        <a href={`/api/automacao/relatorio/${e.id}`} className="text-slate-900 underline">
                          Relatório PDF
                        </a>
                      )}
                    </span>
                  </div>
                  {e.pendencias.length > 0 && (
                    <ul className="mt-1.5 ml-1 list-disc list-inside text-slate-600 space-y-0.5">
                      {e.pendencias.slice(0, 8).map((p, i) => (
                        <li key={i}>{p.mensagem}</li>
                      ))}
                      {e.pendencias.length > 8 && <li>... e mais {e.pendencias.length - 8}.</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
