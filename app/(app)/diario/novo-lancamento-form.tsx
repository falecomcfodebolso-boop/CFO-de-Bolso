"use client";

import { useActionState, useRef, useState, useEffect } from "react";
import { createLancamentoAction, type ActionState } from "./actions";

type Conta = { code: string; name: string };

export function NovoLancamentoForm({ contas }: { contas: Conta[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createLancamentoAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState([0, 1]);
  const nextId = useRef(2);

  // Limpa os campos nativos do formulário após um lançamento bem-sucedido.
  // Chamamos apenas form.reset() (uma API do DOM, não um setState do React)
  // dentro do efeito — isso é seguro mesmo sob as regras mais estritas do
  // eslint-plugin-react-hooks, que só proíbem chamar setState de dentro de
  // um efeito. As linhas dinâmicas (`linhas`) não precisam ser resetadas:
  // form.reset() já limpa os valores de todos os selects/inputs, incluindo
  // os das linhas extras eventualmente adicionadas.
  useEffect(() => {
    if (!pending && state === null) {
      formRef.current?.reset();
    }
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          type="date"
          name="data"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          name="historico"
          placeholder="Histórico do lançamento"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
      </div>

      <div className="space-y-2">
        {linhas.map((id) => (
          <div key={id} className="grid grid-cols-1 sm:grid-cols-[1fr_100px_140px_32px] gap-2">
            <select name="linha_conta" required className="rounded-md border border-slate-300 px-2 py-2 text-sm">
              <option value="">Conta...</option>
              {contas.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <select name="linha_tipo" required className="rounded-md border border-slate-300 px-2 py-2 text-sm">
              <option value="D">Débito</option>
              <option value="C">Crédito</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              name="linha_valor"
              placeholder="Valor"
              required
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setLinhas((prev) => prev.filter((x) => x !== id))}
              disabled={linhas.length <= 2}
              className="text-slate-400 hover:text-red-600 disabled:opacity-30"
              title="Remover linha"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setLinhas((prev) => [...prev, nextId.current++])}
        className="text-sm text-slate-600 underline"
      >
        + adicionar linha
      </button>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Lançando..." : "Lançar no Diário"}
        </button>
      </div>
    </form>
  );
}
