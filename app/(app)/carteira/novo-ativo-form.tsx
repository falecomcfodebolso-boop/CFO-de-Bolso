"use client";

import { useActionState, useRef, useEffect } from "react";
import { createAtivoAction, type ActionState } from "./actions";

export function NovoAtivoForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createAtivoAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
      <input name="nome" placeholder="Nome do ativo" required className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
      <input name="custodiante" placeholder="Custodiante" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <select name="tipo" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="renda_fixa">Renda fixa</option>
        <option value="fundo">Fundo</option>
        <option value="acao">Ação</option>
        <option value="outro">Outro</option>
      </select>
      <input name="valor_atual" type="number" step="0.01" placeholder="Valor US$" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="taxa_cupom" type="number" step="0.001" placeholder="Cupom % a.a." className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="data_vencimento" type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="conta_code" placeholder="Conta do Plano de Contas (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar ativo"}
      </button>

      {state?.error && (
        <p className="sm:col-span-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
