"use client";

import { useActionState } from "react";
import { saveAlertConfigAction, type ActionState } from "./actions";

type Config = {
  dias_antecedencia: number[];
  hora_local: string;
  timezone: string;
  canal: string;
} | null;

export function AlertConfigForm({ config }: { config: Config }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAlertConfigAction,
    null
  );

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Dias de antecedência</label>
        <input
          name="dias"
          defaultValue={(config?.dias_antecedencia ?? [5, 4, 3, 2, 1]).join(",")}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Horário</label>
        <input
          name="hora_local"
          type="time"
          defaultValue={config?.hora_local ?? "10:00"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Fuso horário</label>
        <input
          name="timezone"
          defaultValue={config?.timezone ?? "America/Sao_Paulo"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm w-full"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar alerta"}
      </button>
      {state?.error && (
        <p className="sm:col-span-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
