"use client";

import { useActionState } from "react";
import { excluirLoteAction, type ActionState } from "./actions";

export function ExcluirLoteButton({ loteId }: { loteId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(excluirLoteAction, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir esta importação? Todas as transações pendentes/ignoradas dela serão apagadas.")) {
          e.preventDefault();
        }
      }}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="lote_id" value={loteId} />
      <button type="submit" disabled={pending} className="text-slate-400 hover:text-red-600 text-xs disabled:opacity-50">
        {pending ? "Excluindo..." : "excluir"}
      </button>
      {state?.error && <span className="text-xs text-red-600 max-w-[220px] text-right">{state.error}</span>}
    </form>
  );
}
