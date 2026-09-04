"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  parseExtratoAcruoPdfAction,
  confirmarApuracoesAction,
  type ParseAcruoState,
  type PropostaApuracao,
} from "./actions";

type LinhaProposta = PropostaApuracao & { incluir: boolean };

function fmtMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}

function fmtDataBR(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR");
}

export function ImportarApuracaoForm() {
  const [parseState, parseAction, parsePending] = useActionState<ParseAcruoState, FormData>(
    parseExtratoAcruoPdfAction,
    null
  );
  const [linhas, setLinhas] = useState<LinhaProposta[] | null>(null);
  const [fonte, setFonte] = useState("");
  const [erroConfirmar, setErroConfirmar] = useState<string | null>(null);
  const [registradas, setRegistradas] = useState<number | null>(null);
  const [confirmarPending, startConfirmar] = useTransition();

  if (parseState?.propostas && !linhas) {
    setLinhas(parseState.propostas.map((p) => ({ ...p, incluir: true })));
    if (!fonte) setFonte(`Extrato Itaú Private Bank ${fmtDataBR(parseState.dataBase ?? "")}`);
  }

  function atualizarLinha(index: number, patch: Partial<LinhaProposta>) {
    setLinhas((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  }

  function handleConfirmar() {
    if (!linhas) return;
    setErroConfirmar(null);
    const selecionadas = linhas.filter((l) => l.incluir);
    if (selecionadas.length === 0) {
      setErroConfirmar("Selecione ao menos um grupo para registrar.");
      return;
    }
    startConfirmar(async () => {
      const resultado = await confirmarApuracoesAction(selecionadas, fonte);
      if (resultado.error) {
        setErroConfirmar(resultado.error);
        return;
      }
      setRegistradas(resultado.registradas ?? 0);
      setLinhas(null);
    });
  }

  if (registradas !== null) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
        {registradas} {registradas === 1 ? "apuração registrada" : "apurações registradas"}. Agora é só ir
        em Ajustes e clicar em &ldquo;Lançar no Diário&rdquo; em cada uma pra aprovar e gerar o lançamento.{" "}
        <Link href="/ajustes" className="underline font-medium">
          Ver Ajustes
        </Link>
      </div>
    );
  }

  if (!linhas) {
    return (
      <form action={parseAction} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            PDF do Statement (Itaú Private Bank)
          </label>
          <input
            type="file"
            name="arquivo"
            required
            accept=".pdf"
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:px-3 file:py-2 file:text-sm"
          />
        </div>

        {parseState?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {parseState.error}
          </p>
        )}

        <button
          type="submit"
          disabled={parsePending}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {parsePending ? "Lendo PDF..." : "Ler juros acruados do PDF"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Data-base identificada no extrato: <strong>{fmtDataBR(parseState?.dataBase ?? "")}</strong>. Encontrei{" "}
        {linhas.length} grupo(s) — revise o valor sugerido de cada um (a soma dos juros acruados dos papéis
        do grupo, lidos do extrato) antes de registrar. Nada é gravado até você clicar em &ldquo;Registrar
        apurações selecionadas&rdquo;.
      </p>

      <div>
        <label className="block text-xs text-slate-500 mb-1">Fonte (grava no histórico)</label>
        <input
          type="text"
          value={fonte}
          onChange={(e) => setFonte(e.target.value)}
          className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-2" />
              <th className="text-left px-3 py-2">Grupo</th>
              <th className="text-right px-3 py-2">Contábil atual</th>
              <th className="text-right px-3 py-2">Cálculo interno</th>
              <th className="text-right px-3 py-2">Sugerido (extrato)</th>
              <th className="text-right px-3 py-2">Diferença</th>
              <th className="text-left px-3 py-2">Papéis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l, i) => (
              <tr key={l.nomeGrupo} className={l.incluir ? "" : "opacity-40"}>
                <td className="px-3 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={l.incluir}
                    onChange={(e) => atualizarLinha(i, { incluir: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-slate-800">{l.nomeGrupo}</div>
                  <div className="text-xs text-slate-400">
                    conta(s): {l.contaAcruoCode} · receita: {l.contaReceitaCode}
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-top text-slate-500">{fmtMoney(l.saldoContabilAntes)}</td>
                <td className="px-3 py-2 text-right align-top text-slate-500">
                  {l.acruoCalculadoInterno != null ? fmtMoney(l.acruoCalculadoInterno) : "—"}
                </td>
                <td className="px-3 py-2 text-right align-top">
                  <input
                    type="number"
                    step="0.01"
                    value={l.valorReportadoBanco}
                    onChange={(e) => {
                      const valor = parseFloat(e.target.value) || 0;
                      atualizarLinha(i, {
                        valorReportadoBanco: valor,
                        diferenca: Math.round((valor - l.saldoContabilAntes) * 100) / 100,
                      });
                    }}
                    className="w-28 rounded border border-slate-200 px-2 py-1 text-sm text-right"
                  />
                </td>
                <td
                  className={`px-3 py-2 text-right align-top font-medium ${
                    l.diferenca >= 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {fmtMoney(l.diferenca)}
                </td>
                <td className="px-3 py-2 align-top text-xs text-slate-500">
                  {l.itens.map((it) => (
                    <div key={it.nome}>
                      {it.nome} — {fmtMoney(it.accruedInterest)}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {parseState?.naoReconhecidas && parseState.naoReconhecidas.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {parseState.naoReconhecidas.length} papel(éis) do extrato não foi(ram) reconhecido(s) — não entram
          em nenhum grupo acima, então não foram somados em lugar nenhum:{" "}
          {parseState.naoReconhecidas.map((n) => n.nome).join("; ")}. Se algum desses deveria contar,
          cadastre o ISIN dele no Ativo correspondente (Plano de Contas → Ativos) e importe de novo.
        </div>
      )}

      {erroConfirmar && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {erroConfirmar}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={confirmarPending}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {confirmarPending
            ? "Registrando..."
            : `Registrar ${linhas.filter((l) => l.incluir).length} apurações selecionadas`}
        </button>
        <button
          type="button"
          onClick={() => setLinhas(null)}
          disabled={confirmarPending}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Cancelar e refazer
        </button>
      </div>
    </div>
  );
}
