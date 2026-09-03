"use client";

import { useActionState, useRef, useEffect } from "react";
import { createDividaAction, type ActionState } from "./actions";

export function NovaDividaForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createDividaAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
      <input name="nome" placeholder="Nome da dívida" required className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
      <input name="credor" placeholder="Credor / banco" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <select name="tipo" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="emprestimo">Empréstimo</option>
        <option value="financiamento">Financiamento</option>
        <option value="cartao">Cartão de crédito</option>
        <option value="fornecedor">Fornecedor</option>
        <option value="debenture">Debênture</option>
        <option value="outro">Outro</option>
      </select>
      <select name="indexador" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="PREFIXADO">Prefixado</option>
        <option value="CDI">% CDI</option>
        <option value="SELIC">Selic</option>
        <option value="IPCA">IPCA+</option>
        <option value="OUTRO">Outro</option>
      </select>
      <input name="valor_atual" type="number" step="0.01" placeholder="Saldo devedor" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />

      <input name="valor_original" type="number" step="0.01" placeholder="Valor original (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="taxa_juros" type="number" step="0.001" placeholder="Taxa % a.a." className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="data_contratacao" type="date" placeholder="Contratação" title="Data de contratação" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="data_vencimento" type="date" title="Data de vencimento" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="garantia" placeholder="Garantia (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input name="conta_code" placeholder="Conta do Plano de Contas (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Adicionando..." : "Adicionar dívida"}
      </button>

      {state?.error && (
        <p className="sm:col-span-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
