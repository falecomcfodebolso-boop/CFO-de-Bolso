"use client";

import { useActionState, useRef, useEffect } from "react";
import { criarParticipacaoAction, type ActionState } from "./actions";

export function NovaParticipacaoForm({ outrasEmpresas }: { outrasEmpresas: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(criarParticipacaoAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && state === null) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Empresa investida</label>
        <select name="investida_org_id" required className="rounded-md border border-slate-300 px-3 py-2 text-sm min-w-[12rem]">
          <option value="">Selecione...</option>
          {outrasEmpresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">% de participação</label>
        <input
          type="number"
          name="percentual_pct"
          step="0.01"
          min="0.01"
          max="100"
          placeholder="Ex: 60"
          required
          className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Data</label>
        <input
          type="date"
          name="data_referencia"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Registrar"}
      </button>

      {state?.error && (
        <p className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
