"use client";

import { useState, useTransition } from "react";
import {
  analisarArquivoAtivosAction,
  importarAtivosAction,
  type AnaliseArquivo,
  type ResultadoImportacao,
} from "./actions";
import { CAMPOS_ATIVOS, sugerirMapeamento } from "@/lib/import/mapeamento";

export function MigrarAtivosForm() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<AnaliseArquivo | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, number>>({});
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [isPending, startTransition] = useTransition();

  const headers = analise && analise.ok ? analise.headers : null;

  function mudarArquivo(file: File | null) {
    setArquivo(file);
    setAnalise(null);
    setMapeamento({});
    setResultado(null);
  }

  function analisar() {
    if (!arquivo) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      const res = await analisarArquivoAtivosAction(null, fd);
      setAnalise(res);
      setResultado(null);
      if (res.ok) {
        const sugestao = sugerirMapeamento(res.headers, CAMPOS_ATIVOS);
        const inicial: Record<string, number> = {};
        for (const c of CAMPOS_ATIVOS) inicial[c.campo] = sugestao[c.campo] ?? -1;
        setMapeamento(inicial);
      }
    });
  }

  function confirmar() {
    if (!arquivo) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      for (const c of CAMPOS_ATIVOS) {
        fd.set(`col_${c.campo}`, String(mapeamento[c.campo] ?? -1));
      }
      const res = await importarAtivosAction(null, fd);
      setResultado(res);
    });
  }

  const podeConfirmar =
    !!arquivo && !!headers && CAMPOS_ATIVOS.every((c) => !c.obrigatorio || (mapeamento[c.campo] ?? -1) >= 0);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo (.csv, .xls, .xlsx)</label>
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={(e) => mudarArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
        </div>

        <button
          type="button"
          onClick={analisar}
          disabled={!arquivo || isPending}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending && !headers ? "Analisando..." : "Analisar arquivo"}
        </button>

        {analise && !analise.ok && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{analise.erro}</p>
        )}
      </div>

      {headers && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-slate-900">Confira o arquivo e mapeie as colunas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {analise && analise.ok ? `${analise.totalLinhas} linha(s) de dados encontradas.` : null} A primeira
              linha do arquivo deve ser o cabeçalho.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-medium text-slate-600 whitespace-nowrap">
                      {h || `Coluna ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analise && analise.ok
                  ? analise.amostra.map((linha: string[], i: number) => (
                      <tr key={i}>
                        {headers.map((_, j) => (
                          <td key={j} className="border border-slate-100 px-2 py-1 text-slate-600 whitespace-nowrap">
                            {String(linha[j] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {CAMPOS_ATIVOS.map((c) => (
              <div key={c.campo}>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {c.rotulo} {c.obrigatorio && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={mapeamento[c.campo] ?? -1}
                  onChange={(e) => setMapeamento((m) => ({ ...m, [c.campo]: Number(e.target.value) }))}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value={-1}>— não usar —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Coluna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={confirmar}
            disabled={!podeConfirmar || isPending}
            className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? "Importando..." : "Confirmar importação"}
          </button>
        </div>
      )}

      {resultado && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          {resultado.erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{resultado.erro}</p>
          )}
          {typeof resultado.criadas === "number" && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              {resultado.criadas} ativo(s) importado(s) com sucesso.
            </p>
          )}
          {resultado.avisos && resultado.avisos.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer select-none">
                {resultado.avisos.length} linha(s) com aviso — ver detalhes
              </summary>
              <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                {resultado.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
