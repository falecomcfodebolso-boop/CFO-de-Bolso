"use client";

import { useActionState, useState } from "react";
import { createOrganizationAction, type ActionState } from "../../actions";

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

export default function CreateOrganizationPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createOrganizationAction,
    null
  );
  const [moeda, setMoeda] = useState("USD");
  const [regime, setRegime] = useState("");

  const isBrasil = moeda === "BRL";

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
              value={moeda}
              onChange={(e) => setMoeda(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {isBrasil && (
          <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
            <p className="text-xs text-slate-500">
              Como a organização é em Reais, informe o regime tributário — isso liga o menu
              &ldquo;Obrigações Fiscais&rdquo;, com o checklist e os cálculos de cada regime. Pode
              deixar em branco e configurar depois, em Configurações.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Regime tributário
              </label>
              <select
                name="regime_tributario"
                value={regime}
                onChange={(e) => setRegime(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Prefiro configurar depois</option>
                <option value="MEI">MEI</option>
                <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                <option value="LUCRO_REAL">Lucro Real</option>
              </select>
            </div>

            {regime === "MEI" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Atividade do MEI</label>
                <select name="atividade_tributaria" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {ATIVIDADES_MEI.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {regime === "SIMPLES_NACIONAL" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Anexo do Simples Nacional</label>
                <select name="anexo_simples" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {ANEXOS_SIMPLES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  Depende da atividade principal da empresa — se não tiver certeza, confira no contrato
                  social ou pergunte ao seu contador.
                </p>
              </div>
            )}

            {(regime === "LUCRO_PRESUMIDO" || regime === "LUCRO_REAL") && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Atividade principal</label>
                <select name="atividade_tributaria" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {ATIVIDADES_PRESUMIDO.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(regime === "LUCRO_PRESUMIDO" || regime === "LUCRO_REAL") && (
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
                  placeholder="Ex: 5"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Varia por município (geralmente entre 2% e 5%) — confira na prefeitura ou com seu
                  contador. Deixe em branco se não prestar serviços.
                </p>
              </div>
            )}
          </div>
        )}

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
