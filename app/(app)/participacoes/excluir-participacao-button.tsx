"use client";

import { useActionState } from "react";
import { excluirParticipacaoAction, type ActionState } from "./actions";

export function ExcluirParticipacaoButton({ participacaoId }: { participacaoId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(excluirParticipacaoAction, null);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("Remover esta participação societária? Isso não apaga nenhum lançamento contábil.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={participacaoId} />
      <button type="submit" disabled={pending} className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-50">
        {pending ? "Removendo..." : "Remover"}
      </button>
      {state?.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </form>
  );
}
