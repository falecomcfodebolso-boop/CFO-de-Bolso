"use client";

import { useState, useTransition, useActionState } from "react";
import { ignorarTransacaoAction, confirmarVariasAction, type ActionState } from "./actions";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { TransacaoImportada } from "./transacao-row";

type Conta = { code: string; name: string };

const CONFIANCA_LABEL: Record<string, string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};

type LinhaPendente = {
  transacao: TransacaoImportada;
  contaCode: string;
  incluir: boolean;
};

export function TransacoesTable({
  transacoes,
  loteId,
  contas,
  currency,
}: {
  transacoes: TransacaoImportada[];
  loteId: string;
  contas: Conta[];
  currency: string;
}) {
  const pendentesIniciais = transacoes.filter((t) => t.status === "pendente");
  const processadas = transacoes.filter((t) => t.status !== "pendente");

  const [linhas, setLinhas] = useState<LinhaPendente[]>(
    pendentesIniciais.map((t) => ({
      transacao: t,
      contaCode: t.conta_sugerida ?? "",
      incluir: !!t.conta_sugerida,
    }))
  );
  const [bulkPending, startBulk] = useTransition();
  const [bulkErro, setBulkErro] = useState<string | null>(null);
  const [bulkOk, setBulkOk] = useState<string | null>(null);

  function atualizarLinha(id: string, patch: Partial<LinhaPendente>) {
    setLinhas((prev) => prev.map((l) => (l.transacao.id === id ? { ...l, ...patch } : l)));
  }

  const selecionaveis = linhas.filter((l) => l.contaCode);
  const todasSelecionadas = selecionaveis.length > 0 && selecionaveis.every((l) => l.incluir);
  const qtdSelecionadas = linhas.filter((l) => l.incluir && l.contaCode).length;

  function alternarTodas(marcar: boolean) {
    setLinhas((prev) => prev.map((l) => (l.contaCode ? { ...l, incluir: marcar } : l)));
  }

  function handleLancarSelecionadas() {
    const itens = linhas
      .filter((l) => l.incluir && l.contaCode)
      .map((l) => ({ transacaoId: l.transacao.id, contaCode: l.contaCode }));
    if (itens.length === 0) return;
    setBulkErro(null);
    setBulkOk(null);
    startBulk(async () => {
      const resultado = await confirmarVariasAction(loteId, itens);
      if (resultado.error) setBulkErro(resultado.error);
      if (resultado.confirmadas) {
        setBulkOk(`${resultado.confirmadas} lançamento(s) criado(s) com sucesso.`);
        setLinhas((prev) => prev.filter((l) => !itens.some((i) => i.transacaoId === l.transacao.id)));
      }
    });
  }

  return (
    <div className="space-y-3">
      {linhas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={todasSelecionadas} onChange={(e) => alternarTodas(e.target.checked)} />
            Selecionar todas ({qtdSelecionadas} de {selecionaveis.length} prontas para lançar)
          </label>
          <div className="flex items-center gap-3">
            {bulkErro && <span className="text-xs text-red-600 max-w-md">{bulkErro}</span>}
            {bulkOk && <span className="text-xs text-emerald-600">{bulkOk}</span>}
            <button
              type="button"
              onClick={handleLancarSelecionadas}
              disabled={bulkPending || qtdSelecionadas === 0}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {bulkPending ? "Lançando..." : `Lançar ${qtdSelecionadas} selecionada(s)`}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-2" />
              <th className="text-left px-4 py-2">Data</th>
              <th className="text-left px-4 py-2">Descrição</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-left px-4 py-2">Contrapartida</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <LinhaPendenteRow
                key={l.transacao.id}
                linha={l}
                loteId={loteId}
                contas={contas}
                currency={currency}
                onChange={(patch) => atualizarLinha(l.transacao.id, patch)}
              />
            ))}
            {processadas.map((t) => (
              <tr key={t.id} className="text-slate-400">
                <td className="px-4 py-2" />
                <td className="px-4 py-2">{fmtDate(t.data)}</td>
                <td className="px-4 py-2">{t.descricao}</td>
                <td className={`px-4 py-2 text-right ${t.valor > 0 ? "text-emerald-600" : "text-slate-500"}`}>
                  {fmtMoney(t.valor, currency)}
                </td>
                <td className="px-4 py-2 text-center" colSpan={2}>
                  {t.status === "conciliado" ? (
                    <span className="text-xs bg-emerald-50 text-emerald-700 rounded-full px-2 py-1">
                      Lançado — {t.conta_confirmada}
                    </span>
                  ) : (
                    <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-1">Ignorada</span>
                  )}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && processadas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-slate-400">
                  Nenhuma transação neste lote.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaPendenteRow({
  linha,
  loteId,
  contas,
  currency,
  onChange,
}: {
  linha: LinhaPendente;
  loteId: string;
  contas: Conta[];
  currency: string;
  onChange: (patch: Partial<LinhaPendente>) => void;
}) {
  const [ignoreState, ignoreAction, ignorePending] = useActionState<ActionState, FormData>(
    ignorarTransacaoAction,
    null
  );
  const { transacao } = linha;
  const entrada = transacao.valor > 0;

  return (
    <tr className="hover:bg-slate-50 align-top">
      <td className="px-4 py-2 pt-3">
        <input
          type="checkbox"
          checked={linha.incluir}
          disabled={!linha.contaCode}
          onChange={(e) => onChange({ incluir: e.target.checked })}
        />
      </td>
      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(transacao.data)}</td>
      <td className="px-4 py-2 text-slate-800">{transacao.descricao}</td>
      <td className={`px-4 py-2 text-right whitespace-nowrap ${entrada ? "text-emerald-600" : "text-slate-700"}`}>
        {fmtMoney(transacao.valor, currency)}
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <select
            value={linha.contaCode}
            onChange={(e) => onChange({ contaCode: e.target.value, incluir: !!e.target.value })}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm min-w-[220px]"
          >
            <option value="">Conta de contrapartida...</option>
            {contas.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          {transacao.conta_sugerida && (
            <span className="text-xs text-slate-400 whitespace-nowrap">
              sugestão IA · {CONFIANCA_LABEL[transacao.confianca_sugestao ?? ""] ?? "?"}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <form action={ignoreAction}>
          <input type="hidden" name="transacao_id" value={transacao.id} />
          <input type="hidden" name="lote_id" value={loteId} />
          <button
            type="submit"
            disabled={ignorePending}
            className="text-xs text-slate-400 hover:text-red-600 disabled:opacity-60"
          >
            Ignorar
          </button>
        </form>
        {ignoreState?.error && <p className="text-xs text-red-600 mt-1">{ignoreState.error}</p>}
      </td>
    </tr>
  );
}
