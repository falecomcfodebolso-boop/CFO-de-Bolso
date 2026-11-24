"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { lerPosicoesAction, aplicarPosicoesAction, type LerPosicoesState } from "./actions";

function fmt(v: number | null | undefined, moeda: string) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(v);
}
function fmtQtd(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(v);
}
function fmtData(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function AtualizarPosicoesForm({ moeda }: { moeda: string }) {
  const [state, action, lendo] = useActionState<LerPosicoesState, FormData>(lerPosicoesAction, null);
  const [selecionados, setSelecionados] = useState<Set<string> | null>(null);
  const [cupons, setCupons] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ atualizadas: number; cuponsCorrigidos: number } | null>(null);
  const [gravando, startGravar] = useTransition();

  const r = state?.resultado;
  if (r && selecionados === null) {
    setSelecionados(new Set(r.atualizacoes.filter((u) => !u.maisAntigoQueCadastro).map((u) => u.ativoId)));
    setCupons(new Set(r.atualizacoes.filter((u) => u.dataPagamentoAnteriorSugerida).map((u) => u.ativoId)));
  }

  function alternar(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const novo = new Set(set);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setter(novo);
  }

  function gravar() {
    if (!r || !selecionados) return;
    setErro(null);
    startGravar(async () => {
      const res = await aplicarPosicoesAction(r, [...selecionados], [...cupons], state?.arquivo ?? "extrato.pdf");
      if (res.error) setErro(res.error);
      else setFeito({ atualizadas: res.atualizadas ?? 0, cuponsCorrigidos: res.cuponsCorrigidos ?? 0 });
    });
  }

  if (feito) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800 space-y-1">
        <p>
          {feito.atualizadas} posição(ões) do {r?.custodiante} atualizada(s) para {fmtData(r?.dataBase)}
          {feito.cuponsCorrigidos > 0 && ` · ${feito.cuponsCorrigidos} data(s) de cupom corrigida(s)`}.
        </p>
        <p className="space-x-3">
          <Link href="/carteira" className="underline font-medium">
            Ver Carteira
          </Link>
          <Link href="/vencimentos" className="underline font-medium">
            Ver Vencimentos
          </Link>
          <a href="/carteira/posicoes" className="underline">
            Enviar outro extrato
          </a>
        </p>
      </div>
    );
  }

  if (!r) {
    return (
      <form action={action} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">PDF do extrato de investimentos</label>
          <input
            type="file"
            name="arquivo"
            required
            accept=".pdf"
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:px-3 file:py-2 file:text-sm"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={lendo}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          {lendo ? "Lendo extrato…" : "Ler extrato"}
        </button>
      </form>
    );
  }

  const totalMercado = r.atualizacoes.reduce((s, u) => s + u.valorMercado, 0);
  const totalJuros = r.atualizacoes.reduce((s, u) => s + u.jurosAcruados, 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700 flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Custodiante: <strong>{r.custodiante}</strong>
        </span>
        <span>
          Data-base: <strong>{fmtData(r.dataBase)}</strong>
        </span>
        <span>
          Papéis conferidos: <strong>{r.atualizacoes.length}</strong>
        </span>
        <span>
          Mercado (limpo): <strong>{fmt(totalMercado, moeda)}</strong>
        </span>
        <span>
          Juros acruados: <strong>{fmt(totalJuros, moeda)}</strong>
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-3 py-2"></th>
              <th className="text-left px-3 py-2">Ativo</th>
              <th className="text-right px-3 py-2">Qtd. antes</th>
              <th className="text-right px-3 py-2">Qtd. extrato</th>
              <th className="text-right px-3 py-2">Mercado antes</th>
              <th className="text-right px-3 py-2">Mercado extrato</th>
              <th className="text-right px-3 py-2">Juros acruados</th>
              <th className="text-left px-3 py-2">Último cupom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {r.atualizacoes.map((u) => {
              const qtdMudou =
                u.quantidadeAntes != null && u.quantidade != null && Math.abs(u.quantidadeAntes - u.quantidade) > 0.0001;
              return (
                <tr key={u.ativoId} className={u.maisAntigoQueCadastro ? "opacity-50" : ""}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      disabled={u.maisAntigoQueCadastro}
                      checked={selecionados?.has(u.ativoId) ?? false}
                      onChange={() => selecionados && alternar(selecionados, u.ativoId, setSelecionados)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-800">{u.nomeAtivo}</div>
                    <div className="text-xs text-slate-400">
                      {u.identificador ?? "sem ISIN"} · {u.nomeExtrato.slice(0, 60)}
                    </div>
                    {u.maisAntigoQueCadastro && (
                      <div className="text-xs text-amber-700">Cadastro já tem posição mais nova — não será alterado.</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{fmtQtd(u.quantidadeAntes)}</td>
                  <td className={`px-3 py-2 text-right ${qtdMudou ? "text-amber-700 font-medium" : "text-slate-800"}`}>
                    {fmtQtd(u.quantidade)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{fmt(u.valorMercadoAntes, moeda)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{fmt(u.valorMercado, moeda)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{fmt(u.jurosAcruados, moeda)}</td>
                  <td className="px-3 py-2 text-xs">
                    {u.dataPagamentoAnteriorSugerida ? (
                      <label className="flex items-center gap-1 text-amber-700">
                        <input
                          type="checkbox"
                          checked={cupons.has(u.ativoId)}
                          onChange={() => alternar(cupons, u.ativoId, setCupons)}
                        />
                        {fmtData(u.dataPagamentoAnteriorAntes)} → {fmtData(u.dataPagamentoAnteriorSugerida)}
                      </label>
                    ) : (
                      <span className="text-slate-400">{fmtData(u.dataPagamentoAnteriorAntes)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {r.ausentes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3">
          <p className="font-medium">Ativos do {r.custodiante} que não aparecem neste extrato:</p>
          <ul className="list-disc ml-5 mt-1">
            {r.ausentes.map((a) => (
              <li key={a.ativoId}>
                {a.nome}
                {a.vencido ? ` — venceu em ${fmtData(a.dataVencimento)} (baixar da Carteira?)` : " — vendido/resgatado?"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.semCadastro.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 text-sky-800 text-sm px-4 py-3">
          <p className="font-medium">Posições do extrato que ainda não estão cadastradas na Carteira:</p>
          <ul className="list-disc ml-5 mt-1">
            {r.semCadastro.map((p, i) => (
              <li key={i}>
                {p.nome} ({p.isin ?? p.cusip ?? "sem ISIN"}) — {fmt(p.valorMercado, moeda)}
              </li>
            ))}
          </ul>
          <Link href="/carteira/importar" className="underline text-xs">
            Cadastrar pelo Importar de PDF
          </Link>
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={gravar}
          disabled={gravando || !selecionados || selecionados.size === 0}
          className="rounded-md bg-emerald-600 text-white text-sm font-medium px-4 py-2 hover:bg-emerald-700 disabled:opacity-50"
        >
          {gravando ? "Gravando…" : `Atualizar ${selecionados?.size ?? 0} posição(ões)`}
        </button>
        <a href="/carteira/posicoes" className="text-sm text-slate-500 hover:underline">
          Cancelar
        </a>
      </div>
    </div>
  );
}
