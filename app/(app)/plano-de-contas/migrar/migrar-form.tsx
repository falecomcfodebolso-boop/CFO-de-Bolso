"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  analisarArquivoAction,
  importarContasAction,
  importarLancamentosAction,
  importarSaldosAction,
  type AnaliseArquivo,
  type ResultadoImportacao,
} from "./actions";
import {
  CAMPOS_CONTAS,
  CAMPOS_LANCAMENTOS,
  CAMPOS_SALDOS,
  sugerirMapeamento,
  type CampoMapeavel,
} from "@/lib/import/mapeamento";

type Tipo = "contas" | "saldos" | "lancamentos";

const TIPO_LABEL: Record<Tipo, string> = {
  contas: "Plano de contas",
  saldos: "Saldos de abertura",
  lancamentos: "Lançamentos históricos",
};

const TIPO_DESCRICAO: Record<Tipo, string> = {
  contas: "Cria de uma vez a lista de contas (código, nome e natureza) do seu sistema anterior.",
  saldos: "Lança, numa data de abertura, o saldo inicial de cada conta já cadastrada no plano de contas.",
  lancamentos: "Cria um lançamento de débito/crédito para cada linha do arquivo (histórico de partidas dobradas).",
};

function camposDoTipo(tipo: Tipo): CampoMapeavel[] {
  if (tipo === "contas") return CAMPOS_CONTAS;
  if (tipo === "saldos") return CAMPOS_SALDOS;
  return CAMPOS_LANCAMENTOS;
}

type ContaExistente = { code: string; name: string; natureza: string };

export function MigrarForm({ contasExistentes }: { contasExistentes: ContaExistente[] }) {
  const [tipo, setTipo] = useState<Tipo>("contas");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<AnaliseArquivo | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, number>>({});
  const [dataAbertura, setDataAbertura] = useState("");
  const [contaContrapartida, setContaContrapartida] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const campos = useMemo(() => camposDoTipo(tipo), [tipo]);
  const headers = analise && analise.ok ? analise.headers : null;

  function mudarTipo(novoTipo: Tipo) {
    setTipo(novoTipo);
    setMapeamento({});
    setResultado(null);
  }

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
      const res = await analisarArquivoAction(null, fd);
      setAnalise(res);
      setResultado(null);
      if (res.ok) {
        const sugestao = sugerirMapeamento(res.headers, camposDoTipo(tipo));
        const inicial: Record<string, number> = {};
        for (const c of camposDoTipo(tipo)) inicial[c.campo] = sugestao[c.campo] ?? -1;
        setMapeamento(inicial);
      }
    });
  }

  function confirmar() {
    if (!arquivo) return;
    const obrigatoriosFaltando = campos.filter((c) => c.obrigatorio && (mapeamento[c.campo] ?? -1) < 0);
    if (obrigatoriosFaltando.length > 0) return;
    if (tipo === "saldos" && !dataAbertura) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      for (const c of campos) {
        fd.set(`col_${c.campo}`, String(mapeamento[c.campo] ?? -1));
      }

      let res: ResultadoImportacao;
      if (tipo === "contas") {
        res = await importarContasAction(null, fd);
      } else if (tipo === "saldos") {
        fd.set("data_abertura", dataAbertura);
        fd.set("conta_contrapartida", contaContrapartida);
        res = await importarSaldosAction(null, fd);
      } else {
        res = await importarLancamentosAction(null, fd);
      }
      setResultado(res);
    });
  }

  const podeConfirmar =
    !!arquivo &&
    !!headers &&
    campos.every((c) => !c.obrigatorio || (mapeamento[c.campo] ?? -1) >= 0) &&
    (tipo !== "saldos" || !!dataAbertura);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-slate-900 mb-2">O que você quer importar?</h2>
          <div className="grid sm:grid-cols-3 gap-2">
            {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => mudarTipo(t)}
                className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                  tipo === t
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <div className="font-medium">{TIPO_LABEL[t]}</div>
                <div className={`text-xs mt-0.5 ${tipo === t ? "text-slate-300" : "text-slate-500"}`}>
                  {TIPO_DESCRICAO[t]}
                </div>
              </button>
            ))}
          </div>
        </div>

        {tipo === "saldos" && contasExistentes.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Você ainda não tem nenhuma conta cadastrada — importe primeiro o plano de contas (aba
            acima) antes de trazer os saldos de abertura.
          </p>
        )}
        {tipo === "lancamentos" && contasExistentes.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Você ainda não tem nenhuma conta cadastrada — importe primeiro o plano de contas (aba
            acima) antes de trazer o histórico de lançamentos.
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo (.csv, .xls, .xlsx)</label>
          <input
            ref={fileInputRef}
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
            {campos.map((c) => (
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

          {tipo === "saldos" && (
            <div className="grid sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Data de abertura <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={dataAbertura}
                  onChange={(e) => setDataAbertura(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Conta de contrapartida (se os saldos não fecharem)
                </label>
                <select
                  value={contaContrapartida}
                  onChange={(e) => setContaContrapartida(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">— nenhuma —</option>
                  {contasExistentes.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Só é usada se débitos e créditos não baterem exatamente (ex: diferença de arredondamento).
                </p>
              </div>
            </div>
          )}

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
              {resultado.criadas} registro(s) importado(s) com sucesso.
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
