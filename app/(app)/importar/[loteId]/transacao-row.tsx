"use client";

import { useActionState } from "react";
import { confirmarTransacaoAction, ignorarTransacaoAction, type ActionState } from "./actions";
import { fmtDate, fmtMoney } from "@/lib/format";

type Conta = { code: string; name: string };

export type TransacaoImportada = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  status: "pendente" | "conciliado" | "ignorado";
  conta_sugerida: string | null;
  confianca_sugestao: "alta" | "media" | "baixa" | null;
  conta_confirmada: string | null;
};

const CONFIANCA_LABEL: Record<string, string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};

export function TransacaoRow({
  transacao,
  loteId,
  contas,
  currency,
}: {
  transacao: TransacaoImportada;
  loteId: string;
  contas: Conta[];
  currency: string;
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState<ActionState, FormData>(
    confirmarTransacaoAction,
    null
  );
  const [ignoreState, ignoreAction, ignorePending] = useActionState<ActionState, FormData>(
    ignorarTransacaoAction,
    null
  );

  const entrada = transacao.valor > 0;

  if (transacao.status !== "pendente") {
    return (
      <tr className="text-slate-400">
        <td className="px-4 py-2">{fmtDate(transacao.data)}</td>
        <td className="px-4 py-2">{transacao.descricao}</td>
        <td className={`px-4 py-2 text-right ${entrada ? "text-emerald-600" : "text-slate-500"}`}>
          {fmtMoney(transacao.valor, currency)}
        </td>
        <td className="px-4 py-2 text-center">
          {transacao.status === "conciliado" ? (
            <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-1">
              Lançado — {transacao.conta_confirmada}
            </span>
          ) : (
            <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-1">Ignorada</span>
          )}
        </td>
        <td />
      </tr>
    );
  }

  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(transacao.data)}</td>
      <td className="px-4 py-2 text-slate-800">{transacao.descricao}</td>
      <td className={`px-4 py-2 text-right whitespace-nowrap ${entrada ? "text-emerald-600" : "text-slate-700"}`}>
        {fmtMoney(transacao.valor, currency)}
      </td>
      <td className="px-4 py-2">
        <form action={confirmAction} className="flex items-center gap-2">
          <input type="hidden" name="transacao_id" value={transacao.id} />
          <input type="hidden" name="lote_id" value={loteId} />
          <select
            name="conta_code"
            defaultValue={transacao.conta_sugerida ?? ""}
            required
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm min-w-[220px]"
          >
            <option value="">Conta de contrapartida...</option>
            {contas.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          {transacao.conta_sugerida && (
            <span className="text-xs text-slate-400 whitespace-nowrap">
              sugestão IA · {CONFIANCA_LABEL[transacao.confianca_sugestao ?? ""] ?? "?"}
            </span>
          )}
          <button
            type="submit"
            disabled={confirmPending}
            className="rounded-md bg-slate-900 text-white text-xs font-medium px-3 py-1.5 hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
          >
            {confirmPending ? "Lançando..." : "Lançar"}
          </button>
        </form>
        {confirmState?.error && <p className="text-xs text-red-600 mt-1">{confirmState.error}</p>}
      </td>
      <td className="px-4 py-2 text-right">
        <form action={ignoreAction}>
          <input type="hidden" name="transacao_id" value={transacao.id} />
          <input type="hidden" name="lote_id" value={loteId} />
          <button
            type="submit"
            disabled={ignorePending}
            className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
          >
            Ignorar
          </button>
        </form>
        {ignoreState?.error && <p className="text-xs text-red-600 mt-1">{ignoreState.error}</p>}
      </td>
    </tr>
  );
}
