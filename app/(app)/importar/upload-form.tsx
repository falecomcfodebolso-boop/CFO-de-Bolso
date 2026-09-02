"use client";

import { useActionState } from "react";
import { uploadImportAction, type ActionState } from "./actions";

type Conta = { code: string; name: string };

export function UploadForm({ contasBancarias }: { contasBancarias: Conta[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadImportAction,
    null
  );

  return (
    <form action={formAction} className="space-y-4 max-w-lg">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Conta bancária deste extrato
        </label>
        <select
          name="conta_bancaria_code"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Selecione a conta (Ativo)...</option>
          {contasBancarias.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
        {contasBancarias.length === 0 && (
          <p className="text-xs text-amber-700 mt-1">
            Você ainda não tem nenhuma conta do tipo Ativo cadastrada no Plano de Contas. Crie uma (ex:
            &ldquo;Banco X — Conta Corrente&rdquo;) antes de importar.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo do extrato</label>
        <input
          type="file"
          name="arquivo"
          required
          accept=".ofx,.qfx,.csv,.xls,.xlsx,.pdf"
          className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:px-3 file:py-2 file:text-sm"
        />
        <p className="text-xs text-slate-500 mt-1">Formatos aceitos: OFX, CSV, XLS/XLSX ou PDF (com texto selecionável).</p>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || contasBancarias.length === 0}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Importando..." : "Importar extrato"}
      </button>
    </form>
  );
}
