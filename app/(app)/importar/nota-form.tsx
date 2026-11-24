"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { lerNotaAction, recalcularNotaAction, confirmarNotaAction, type LerNotaState } from "./nota/actions";
import type { NotaNegociacao } from "@/lib/import/nota-negociacao";
import type { PropostaNota } from "@/lib/import/proposta-nota";

function fmt(v: number, moeda = "USD") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(v);
}
function fmtData(iso: string | null) {
  return iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

/** Reduz fotos grandes no navegador antes do envio (a IA aceita até ~5 MB por imagem). */
async function prepararArquivo(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // navegador não decodificou (ex.: HEIC no Windows) — o servidor avisa
  }
}

const CAMPOS_VALOR: { k: keyof NotaNegociacao; label: string }[] = [
  { k: "quantidade", label: "Quantidade / face" },
  { k: "preco", label: "Preço" },
  { k: "principal", label: "Principal" },
  { k: "jurosAcruados", label: "Juros acruados" },
  { k: "comissao", label: "Comissão" },
  { k: "taxas", label: "Taxas" },
  { k: "valorLiquido", label: "Valor líquido" },
];

export function NotaNegociacaoForm() {
  const [state, action, lendo] = useActionState<LerNotaState, FormData>(async (prev, fd) => {
    const f = fd.get("arquivo");
    if (f instanceof File && f.size > 0) fd.set("arquivo", await prepararArquivo(f));
    return lerNotaAction(prev, fd);
  }, null);
  const [proposta, setProposta] = useState<PropostaNota | null>(null);
  const [nota, setNota] = useState<NotaNegociacao | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [duplicatas, setDuplicatas] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [forcar, setForcar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ numero: number; ativoNome: string; contaCriada: string | null } | null>(null);
  const [pend, start] = useTransition();
  const [aberto, setAberto] = useState(false);

  if (state?.proposta && proposta === null && feito === null) {
    setProposta(state.proposta);
    setNota(state.proposta.nota);
    setAvisos(state.avisosNota ?? []);
    setDuplicatas(state.possiveisDuplicatas ?? []);
    setData(state.proposta.dataLancamento);
  }

  function recalcular(n: NotaNegociacao) {
    setErro(null);
    start(async () => {
      const r = await recalcularNotaAction(n);
      if (r.error) return setErro(r.error);
      setProposta(r.proposta!);
      setAvisos(r.avisosNota ?? []);
      setDuplicatas(r.possiveisDuplicatas ?? []);
    });
  }

  function confirmar() {
    if (!nota) return;
    setErro(null);
    start(async () => {
      const r = await confirmarNotaAction(nota, data);
      if (r.error) return setErro(r.error);
      setFeito({ numero: r.numero!, ativoNome: r.ativoNome!, contaCriada: r.contaCriada ?? null });
      setProposta(null);
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Nota de negociação (compra de papel)</h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
            Suba a nota de compra do Itaú ou do Bradesco, em PDF ou foto. O sistema lê a nota, confere os valores e
            prepara: a conta do papel no Plano de Contas, o cadastro na Carteira (com acruo e vencimentos) e o
            lançamento — ativo pelo principal, juros pagos em juros acruados, comissão e taxas em despesa, caixa pelo
            líquido. Nada é gravado antes da sua confirmação.
          </p>
        </div>
        {!aberto && !proposta && !feito && (
          <button onClick={() => setAberto(true)} className="shrink-0 text-sm rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
            Importar nota
          </button>
        )}
      </div>

      {feito && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-800 space-y-1">
          <p>
            Lançamento <strong>#{feito.numero}</strong> criado. Carteira: <strong>{feito.ativoNome}</strong>
            {feito.contaCriada ? ` · conta ${feito.contaCriada} criada no Plano de Contas` : " · posição atualizada"}.
          </p>
          <p className="space-x-3">
            <Link href="/diario" className="underline">Ver Diário</Link>
            <Link href="/carteira" className="underline">Ver Carteira</Link>
            <button type="button" onClick={() => window.location.reload()} className="underline">
              Importar outra nota
            </button>
          </p>
        </div>
      )}

      {aberto && !proposta && !feito && (
        <form action={action} className="flex flex-wrap items-end gap-3">
          <input
            type="file"
            name="arquivo"
            required
            accept=".pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.heic"
            className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:px-3 file:py-2 file:text-sm"
          />
          <button
            type="submit"
            disabled={lendo}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {lendo ? "Lendo a nota…" : "Ler nota"}
          </button>
          {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
        </form>
      )}

      {proposta && nota && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-lg border border-slate-200 p-3 space-y-1">
              <p className="text-xs text-slate-500 uppercase">Nota lida</p>
              <p className="font-medium text-slate-900">{nota.descricao}</p>
              <p className="text-slate-600">
                {proposta.custodiante} · {nota.tipoAtivo.toUpperCase()} · {nota.isin ?? nota.cusip ?? "sem ISIN/CUSIP"}
                {nota.numeroNegocio ? ` · nota ${nota.numeroNegocio}` : ""}
              </p>
              <p className="text-slate-600">
                Operação {fmtData(nota.dataOperacao)} · liquidação {fmtData(nota.dataLiquidacao)}
              </p>
              {nota.tipoAtivo === "titulo" && (
                <p className="text-slate-600">
                  Cupom {nota.taxaCupom ?? "—"}% · vencimento {fmtData(nota.vencimento)} · {nota.periodicidade ?? "periodicidade não informada"}
                </p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500 uppercase mb-2">Valores (edite se a leitura errou)</p>
              <div className="grid grid-cols-2 gap-2">
                {CAMPOS_VALOR.map(({ k, label }) => (
                  <label key={k} className="text-xs text-slate-500">
                    {label}
                    <input
                      type="number"
                      step="any"
                      value={String(nota[k] ?? 0)}
                      onChange={(e) => setNota({ ...nota, [k]: Number(e.target.value) })}
                      onBlur={() => recalcular(nota)}
                      className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm text-right text-slate-900"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>

          {[...avisos, ...proposta.avisos].length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-2 list-disc pl-8">
              {[...avisos, ...proposta.avisos].map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}

          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs text-slate-600 flex flex-wrap items-center gap-3">
              <span className="uppercase font-medium">Lançamento proposto</span>
              <label className="flex items-center gap-1">
                Data
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded border border-slate-300 px-2 py-0.5 text-xs" />
              </label>
              <span className="text-slate-400">(data em que o banco debita o caixa — evita duplicar com o extrato)</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {proposta.linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 w-8 text-slate-500">{l.tipo}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{l.conta_code}</td>
                    <td className="px-3 py-1.5 text-slate-800">
                      {l.conta_nome}
                      {proposta.contaNova?.code === l.conta_code && (
                        <span className="ml-2 text-[10px] rounded-full bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5">conta nova</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-900">{fmt(l.valor, nota.moeda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">Histórico: {proposta.historico}</p>
          </div>

          {proposta.ativoNovo && (
            <p className="text-xs text-slate-600">
              Carteira: novo ativo <strong>{proposta.ativoNovo.nome}</strong> · categoria {proposta.ativoNovo.categoria_acruo}
              {proposta.ativoNovo.grupo_acruo_nome ? ` · grupo de acruo "${proposta.ativoNovo.grupo_acruo_nome}"` : ""}
              {proposta.ativoNovo.conta_ganho_perda_mercado_code ? ` · marcação a mercado em ${proposta.ativoNovo.conta_ganho_perda_mercado_code}` : ""}
              {proposta.ativoNovo.data_pagamento_anterior ? ` · último cupom ${fmtData(proposta.ativoNovo.data_pagamento_anterior)}` : ""}
            </p>
          )}
          {proposta.ativoExistente && (
            <p className="text-xs text-slate-600">
              Carteira: soma {nota.quantidade} à posição de <strong>{proposta.ativoExistente.nome}</strong>.
            </p>
          )}

          {duplicatas.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm px-4 py-3 space-y-1">
              <p className="font-medium">Esta compra parece já estar contabilizada:</p>
              <ul className="list-disc pl-5">
                {duplicatas.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 text-xs pt-1">
                <input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />
                Não é a mesma operação — lançar mesmo assim
              </label>
            </div>
          )}

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={confirmar}
              disabled={pend || (duplicatas.length > 0 && !forcar)}
              className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
            >
              {pend ? "Gravando…" : "Confirmar e lançar"}
            </button>
            <button type="button" onClick={() => window.location.reload()} className="text-sm text-slate-500 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
