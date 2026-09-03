"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { registrarAjusteAction, type ActionState } from "./actions";

type Conta = { code: string; name: string };
type Grupo = { nome: string; contaAcruo: string; contaReceita: string };

export function NovoAjusteForm({
  contas,
  grupos,
  dataBasePadrao,
}: {
  contas: Conta[];
  grupos: Grupo[];
  dataBasePadrao?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registrarAjusteAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  const [grupoSelecionado, setGrupoSelecionado] = useState("");
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [contaAcruoCode, setContaAcruoCode] = useState("");
  const [contaReceitaCode, setContaReceitaCode] = useState("");

  useEffect(() => {
    if (!pending && !state?.error) {
      formRef.current?.reset();
      setGrupoSelecionado("");
      setNomeGrupo("");
      setContaAcruoCode("");
      setContaReceitaCode("");
    }
  }, [pending, state]);

  function selecionarGrupo(nome: string) {
    setGrupoSelecionado(nome);
    const g = grupos.find((x) => x.nome === nome);
    if (g) {
      setNomeGrupo(g.nome);
      setContaAcruoCode(g.contaAcruo);
      setContaReceitaCode(g.contaReceita);
    } else {
      setNomeGrupo("");
      setContaAcruoCode("");
      setContaReceitaCode("");
    }
  }

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
      <select
        value={grupoSelecionado}
        onChange={(e) => selecionarGrupo(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      >
        <option value="">Selecione um grupo cadastrado (ou preencha manualmente abaixo)</option>
        {grupos.map((g) => (
          <option key={g.nome} value={g.nome}>
            {g.nome}
          </option>
        ))}
      </select>

      <input
        name="nome_grupo"
        placeholder="Nome do grupo (ex: CLN HSBC — Grupo 1)"
        value={nomeGrupo}
        onChange={(e) => setNomeGrupo(e.target.value)}
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />

      <input
        name="conta_acruo_code"
        list="contas-acruo"
        placeholder="Conta(s) de acruo (separe por vírgula se for pool)"
        value={contaAcruoCode}
        onChange={(e) => setContaAcruoCode(e.target.value)}
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <input
        name="conta_receita_code"
        list="contas-receita"
        placeholder="Conta(s) de receita/despesa"
        value={contaReceitaCode}
        onChange={(e) => setContaReceitaCode(e.target.value)}
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
      />
      <datalist id="contas-acruo">
        {contas.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </datalist>
      <datalist id="contas-receita">
        {contas.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </datalist>

      <input
        name="data_base"
        type="date"
        required
        defaultValue={dataBasePadrao}
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
      <input name="observacoes" placeholder="Observações (opcional)" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60 sm:col-span-4"
      >
        {pending ? "Registrando..." : "Registrar apuração"}
      </button>

      {grupoSelecionado && (
        <p className="sm:col-span-4 text-xs text-slate-500">
          O cálculo interno papel a papel deste grupo (soma dos Ativos cadastrados) será calculado
          automaticamente na data-base informada e mostrado no histórico abaixo, só para
          comparação — o valor lançado na contabilidade é sempre o do campo &quot;Valor no extrato do
          banco&quot;.
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
