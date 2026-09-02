"use client";

import { useActionState, useRef, useEffect } from "react";
import { createContaAction, type ActionState } from "./actions";

const NATUREZAS = ["ATIVO", "PASSIVO", "PL", "RECEITA", "DESPESA", "CONTROLE"];

export function NovaContaForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createContaAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-start">
      <input
        name="code"
        placeholder="Código (ex: 1.1.3.020)"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="name"
        placeholder="Nome da conta"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <select name="natureza" required className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="">Natureza</option>
        {NATUREZAS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar conta"}
      </button>
      {state?.error && (
        <p className="sm:col-span-5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
