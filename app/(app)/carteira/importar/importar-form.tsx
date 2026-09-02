"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { parsePortfolioPdfAction, criarAtivosEmLoteAction, type ParsePortfolioState } from "./actions";
import type { AtivoProposto } from "@/lib/portfolio/parse-holdings";

type LinhaProposta = AtivoProposto & { incluir: boolean };

export function ImportarPortfolioForm({ moeda }: { moeda: string }) {
  const [parseState, parseAction, parsePending] = useActionState<ParsePortfolioState, FormData>(
    parsePortfolioPdfAction,
    null
  );
  const [linhas, setLinhas] = useState<LinhaProposta[] | null>(null);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const [criados, setCriados] = useState<number | null>(null);
  const [criandoPending, startCriar] = useTransition();

  // Assim que o parse retorna com sucesso, popula a tabela de revisão.
  if (parseState?.propostas && !linhas) {
    setLinhas(parseState.propostas.map((p) => ({ ...p, incluir: true })));
  }

  function atualizarLinha(index: number, patch: Partial<LinhaProposta>) {
    setLinhas((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  }

  function handleCriar() {
    if (!linhas) return;
    setErroCriar(null);
    const selecionadas: AtivoProposto[] = linhas
      .filter((l) => l.incluir)
      .map(({ identificador, nome, valorMercado, taxaCupom, dataVencimento }) => ({
        identificador,
        nome,
        valorMercado,
        taxaCupom,
        dataVencimento,
      }));
    if (selecionadas.length === 0) {
      setErroCriar("Selecione ao menos um título para criar.");
      return;
    }
    startCriar(async () => {
      const resultado = await criarAtivosEmLoteAction(selecionadas);
      if (resultado.error) {
        setErroCriar(resultado.error);
        return;
      }
      setCriados(resultado.criados ?? 0);
      setLinhas(null);
    });
  }

  if (criados !== null) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
        {criados} {criados === 1 ? "ativo criado" : "ativos criados"} com sucesso.{" "}
        <Link href="/carteira" className="underline font-medium">
          Ver Carteira
        </Link>
      </div>
    );
  }

  if (!linhas) {
    return (
      <form action={parseAction} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">PDF do extrato de custódia</label>
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
          {parsePending ? "Lendo PDF..." : "Ler posições do PDF"}
        </button>
      </form>
    );
  }

  const total = linhas.filter((l) => l.incluir).reduce((acc, l) => acc + l.valorMercado, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Encontrei {linhas.length} títulos — revise os valores abaixo (o total pode não bater 100% com o
        extrato, já que juros acumulados e alguns ajustes não entram no valor de mercado lido). Desmarque,
        edite ou ajuste antes de criar. Nada é criado até você clicar em &ldquo;Criar ativos
        selecionados&rdquo;.
      </p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-3 py-2" />
              <th className="text-left px-3 py-2">Identificador</th>
              <th className="text-left px-3 py-2">Nome</th>
              <th className="text-right px-3 py-2">Valor de mercado</th>
              <th className="text-right px-3 py-2">Cupom % a.a.</th>
              <th className="text-left px-3 py-2">Vencimento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l, i) => (
              <tr key={l.identificador} className={l.incluir ? "" : "opacity-40"}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={l.incluir}
                    onChange={(e) => atualizarLinha(i, { incluir: e.target.checked })}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">
                  {l.identificador}
                </td>
                <td className="px-3 py-2 max-w-sm">
                  <input
                    type="text"
                    value={l.nome}
                    onChange={(e) => atualizarLinha(i, { nome: e.target.value })}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.01"
                    value={l.valorMercado}
                    onChange={(e) => atualizarLinha(i, { valorMercado: parseFloat(e.target.value) || 0 })}
                    className="w-32 rounded border border-slate-200 px-2 py-1 text-sm text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    step="0.001"
                    value={l.taxaCupom !== null ? (l.taxaCupom * 100).toFixed(3) : ""}
                    placeholder="—"
                    onChange={(e) =>
                      atualizarLinha(i, {
                        taxaCupom: e.target.value ? parseFloat(e.target.value) / 100 : null,
                      })
                    }
                    className="w-24 rounded border border-slate-200 px-2 py-1 text-sm text-right"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={l.dataVencimento ?? ""}
                    onChange={(e) => atualizarLinha(i, { dataVencimento: e.target.value || null })}
                    className="rounded border border-slate-200 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-medium text-slate-700">
              <td colSpan={3} className="px-3 py-2 text-right">
                Total selecionado
              </td>
              <td className="px-3 py-2 text-right">
                {total.toLocaleString(undefined, { style: "currency", currency: moeda })}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {erroCriar && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erroCriar}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleCriar}
          disabled={criandoPending}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {criandoPending ? "Criando..." : `Criar ${linhas.filter((l) => l.incluir).length} ativos selecionados`}
        </button>
        <button
          type="button"
          onClick={() => setLinhas(null)}
          disabled={criandoPending}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          Cancelar e refazer
        </button>
      </div>
    </div>
  );
}
