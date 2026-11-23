"use client";

import { useActionState } from "react";
import { atualizarDataFechamentoAction, type ActionState } from "./actions";

export function DataFechamentoForm({ dataAtual }: { dataAtual: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(atualizarDataFechamentoAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Contabilidade fechada até</label>
        <input
          type="date"
          name="data_fechamento"
          defaultValue={dataAtual ?? ""}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
