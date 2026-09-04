"use client";

import { useActionState } from "react";
import { lancarMarcacaoAction, type MarcacaoActionState } from "./marcacao-actions";

export function LancarMarcacaoButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<MarcacaoActionState, FormData>(
    lancarMarcacaoAction,
    null
  );

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
