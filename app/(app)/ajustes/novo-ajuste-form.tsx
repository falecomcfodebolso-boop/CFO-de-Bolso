"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { registrarAjusteAction, type ActionState } from "./actions";

type Conta = { code: string; name: string };
type Ativo = { id: string; nome: string; taxa_cupom: number | null; conta_code: string | null };

export function NovoAjusteForm({ contas, ativos }: { contas: Conta[]; ativos: Ativo[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registrarAjusteAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [ativoId, setAtivoId] = useState("");

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset();
  }, [pending, state]);

  const ativoSelecionado = ativos.find((a) => a.id === ativoId);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <select
        name="ativo_id"
        value={ativoId}
        onChange={(e) => setAtivoId(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      >
        <option value="">Ativo (opcional — para estimativa interna)</option>
        {ativos.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nome}
          </option>
        ))}
      </select>

      <input
        name="nome_grupo"
        placeholder="Nome do grupo (ex: CLN HSBC — Grupo 1)"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />

      <select name="conta_acruo_code" required className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
        <option value="">Conta de acruo (ativo)...</option>
        {contas.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>

      <select name="conta_receita_code" required className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2">
        <option value="">Conta de receita/despesa...</option>
        {contas.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </select>

      <input name="data_base" type="date" required className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <input
        name="data_base_anterior"
        type="date"
        title="Data-base da última apuração (opcional — se vazio, usa a última apuração registrada para este ativo)"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        name="valor_reportado_banco"
        type="number"
        step="0.01"
        placeholder="Valor no extrato do banco"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <input name="fonte" placeholder="Fonte (ex: Extrato Itaú 31/07/2026)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />

      <input name="observacoes" placeholder="Observações (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-3" />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Registrando..." : "Registrar apuração"}
      </button>

      {ativoSelecionado?.taxa_cupom != null && (
        <p className="sm:col-span-4 text-xs text-slate-500">
          Este ativo tem cupom de {(ativoSelecionado.taxa_cupom * 100).toFixed(3)}% a.a. — a estimativa
          interna (base 360) será calculada automaticamente a partir da última apuração.
        </p>
      )}

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
