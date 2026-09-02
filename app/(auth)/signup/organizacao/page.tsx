"use client";

import { useActionState } from "react";
import { createOrganizationAction, type ActionState } from "../../actions";

export default function CreateOrganizationPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createOrganizationAction,
    null
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-1">
        Crie sua organização
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Cada organização tem seus próprios dados, totalmente isolados dos de
        outras organizações na plataforma (Row Level Security no banco).
      </p>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nome da organização
          </label>
          <input
            name="name"
            type="text"
            required
            placeholder="Ex: Personal Overseas Investments Ltd"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Razão social (opcional)
          </label>
          <input
            name="legal_name"
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              CNPJ/Tax ID (opcional)
            </label>
            <input
              name="tax_id"
              type="text"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Moeda base
            </label>
            <select
              name="base_currency"
              defaultValue="USD"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Criando..." : "Criar organização e continuar"}
        </button>
      </form>
    </div>
  );
}
