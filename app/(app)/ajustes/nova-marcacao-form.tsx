"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { registrarMarcacaoAction, type MarcacaoActionState } from "./marcacao-actions";

type AtivoMercado = { id: string; nome: string };

export function NovaMarcacaoForm({
  ativos,
  dataBasePadrao,
}: {
  ativos: AtivoMercado[];
  dataBasePadrao?: string;
}) {
  const [state, formAction, pending] = useActionState<MarcacaoActionState, FormData>(
    registrarMarcacaoAction,
    null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [ativoId, setAtivoId] = useState("");

  useEffect(() => {
    if (!pending && !state?.error) {
      formRef.current?.reset();
      setAtivoId("");
    }
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <select
        name="ativo_id"
        value={ativoId}
        onChange={(e) => setAtivoId(e.target.value)}
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      >
        <option value="">Selecione o fundo</option>
        {ativos.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>

      <input
        name="data_base"
        type="date"
        required
        defaultValue={dataBasePadrao}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="valor_reportado_mercado"
        type="number"
        step="0.01"
        placeholder="Valor de mercado no relatório"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="fonte"
        placeholder="Fonte (ex: Statement Itaú 31/08/2026)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <input
        name="observacoes"
        placeholder="Observações (opcional)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60 sm:col-span-4"
      >
        {pending ? "Registrando..." : "Registrar apuração"}
      </button>

      {state?.error && (
        <p className="sm:col-span-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
      {state?.aviso && (
        <p className="sm:col-span-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {state.aviso}
        </p>
      )}
    </form>
  );
}
