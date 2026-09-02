"use client";

import { useActionState, useState } from "react";
import { atualizarRegimeTributarioAction, type ActionState } from "./actions";
import type { RegimeTributario, AtividadeTributaria } from "@/lib/org";

const ATIVIDADES_MEI = [
  { value: "COMERCIO_INDUSTRIA", label: "Comércio ou indústria" },
  { value: "SERVICOS", label: "Prestação de serviços" },
  { value: "COMERCIO_E_SERVICOS", label: "Comércio e serviços" },
];

const ATIVIDADES_PRESUMIDO = [
  { value: "COMERCIO_INDUSTRIA", label: "Comércio ou indústria" },
  { value: "SERVICOS", label: "Serviços em geral" },
  { value: "TRANSPORTE_CARGA", label: "Transporte de cargas" },
];

export function RegimeTributarioForm({
  regimeAtual,
  atividadeAtual,
  aliquotaIssAtual,
}: {
  regimeAtual: RegimeTributario | null;
  atividadeAtual: AtividadeTributaria | null;
  aliquotaIssAtual: number | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    atualizarRegimeTributarioAction,
    null
  );
  const [regime, setRegime] = useState(regimeAtual ?? "");

  return (
    <form action={formAction} className="space-y-3 max-w-md">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Regime tributário</label>
        <select
          name="regime_tributario"
          value={regime}
          onChange={(e) => setRegime(e.target.value as RegimeTributario | "")}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Não configurado</option>
          <option value="MEI">MEI</option>
          <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
          <option value="LUCRO_REAL">Lucro Real</option>
        </select>
      </div>

      {regime === "MEI" && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Atividade do MEI</label>
          <select
            name="atividade_tributaria"
            defaultValue={atividadeAtual ?? "COMERCIO_INDUSTRIA"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {ATIVIDADES_MEI.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {(regime === "LUCRO_PRESUMIDO" || regime === "LUCRO_REAL") && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Atividade principal</label>
            <select
              name="atividade_tributaria"
              defaultValue={atividadeAtual ?? "COMERCIO_INDUSTRIA"}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {ATIVIDADES_PRESUMIDO.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Alíquota de ISS do seu município (%, se prestar serviços)
            </label>
            <input
              name="aliquota_iss_pct"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={aliquotaIssAtual ? (aliquotaIssAtual * 100).toString() : ""}
              placeholder="Ex: 5"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
