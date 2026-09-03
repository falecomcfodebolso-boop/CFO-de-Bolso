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

const ANEXOS_SIMPLES = [
  { value: "I", label: "Anexo I — Comércio" },
  { value: "II", label: "Anexo II — Indústria" },
  { value: "III", label: "Anexo III — Serviços (locação de bens móveis e afins)" },
  { value: "IV", label: "Anexo IV — Serviços (construção, limpeza, vigilância, advocacia)" },
  { value: "V", label: "Anexo V — Serviços intelectuais/técnicos" },
];

export function RegimeTributarioForm({
  regimeAtual,
  atividadeAtual,
  aliquotaIssAtual,
  dataAberturaAtual,
  anexoSimplesAtual,
}: {
  regimeAtual: RegimeTributario | null;
  atividadeAtual: AtividadeTributaria | null;
  aliquotaIssAtual: number | null;
  dataAberturaAtual: string | null;
  anexoSimplesAtual: string | null;
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
          <option value="SIMPLES_NACIONAL">Simples Nacional</option>
          <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
          <option value="LUCRO_REAL">Lucro Real</option>
        </select>
      </div>

      {regime === "MEI" && (
        <>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Data de abertura da atividade (opcional)
            </label>
            <input
              name="data_abertura_atividade"
              type="date"
              defaultValue={dataAberturaAtual ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              Se o MEI foi aberto no meio do ano, informe a data pra calcularmos o limite anual de
              faturamento proporcional aos meses de atividade, em vez do limite cheio de R$ 81.000.
            </p>
          </div>
        </>
      )}

      {regime === "SIMPLES_NACIONAL" && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Anexo do Simples Nacional</label>
            <select
              name="anexo_simples"
              defaultValue={anexoSimplesAtual ?? "I"}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {ANEXOS_SIMPLES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Depende da atividade principal da empresa — se não tiver certeza, confira no seu contrato
              social ou pergunte ao seu contador. O Anexo V (sujeito ao &quot;Fator R&quot;) tem regras
              extras que este app não calcula automaticamente.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Data de abertura da atividade (opcional)
            </label>
            <input
              name="data_abertura_atividade"
              type="date"
              defaultValue={dataAberturaAtual ?? ""}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              Usado pra proporcionalizar o limite anual (R$ 4,8 milhões) aos meses de atividade, caso a
              empresa tenha aberto no meio do ano.
            </p>
          </div>
        </>
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
