"use client";

import { useActionState } from "react";
import { lancarAjusteAction, type ActionState } from "./actions";

/**
 * Botão de aprovação: gera o lançamento contábil de uma apuração já registrada (revisada pelo
 * responsável). Fica visível na tabela de histórico enquanto a apuração ainda não tiver um
 * lançamento vinculado (ver `lancamento_id` em ajustes_acruo).
 */
export function LancarAjusteButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(lancarAjusteAction, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs font-medium rounded-md bg-emerald-600 text-white px-2.5 py-1 hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "Lançando..." : "Lançar no Diário"}
        </button>
      </div>
      {state?.error && <p className="text-xs text-red-600 max-w-[220px] text-right">{state.error}</p>}
      {state?.aviso && <p className="text-xs text-emerald-700 max-w-[220px] text-right">{state.aviso}</p>}
    </form>
  );
}
