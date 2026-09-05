"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { uploadImportUnificadoAction, type UploadUnificadoState } from "./actions";
import { criarAtivosEmLoteAction } from "../carteira/importar/actions";
import {
  confirmarApuracoesAction,
  confirmarMarcacoesAction,
  type PropostaApuracao,
  type PropostaMarcacao,
} from "../ajustes/importar/actions";
import type { AtivoProposto } from "@/lib/portfolio/parse-holdings";

type Conta = { code: string; name: string };
type LinhaAtivo = AtivoProposto & { incluir: boolean };
type LinhaAcruo = PropostaApuracao & { incluir: boolean };
type LinhaMercado = PropostaMarcacao & { incluir: boolean };

function fmtMoney(v: number, moeda: string): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

function fmtDataBR(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR");
}

export function UploadForm({
  contasBancarias,
  moeda,
}: {
  contasBancarias: Conta[];
  moeda: string;
}) {
  const [state, formAction, pending] = useActionState<UploadUnificadoState, FormData>(
    uploadImportUnificadoAction,
    null
  );

  const [linhasAtivos, setLinhasAtivos] = useState<LinhaAtivo[] | null>(null);
  const [linhasAcruo, setLinhasAcruo] = useState<LinhaAcruo[] | null>(null);
  const [linhasMercado, setLinhasMercado] = useState<LinhaMercado[] | null>(null);
  const [fonte, setFonte] = useState("");

  const [criadosAtivos, setCriadosAtivos] = useState<number | null>(null);
  const [erroAtivos, setErroAtivos] = useState<string | null>(null);
  const [criandoAtivosPending, startCriarAtivos] = useTransition();

  const [registradasAcruo, setRegistradasAcruo] = useState<number | null>(null);
  const [erroAcruo, setErroAcruo] = useState<string | null>(null);
  const [registrandoAcruoPending, startRegistrarAcruo] = useTransition();

  const [registradasMercado, setRegistradasMercado] = useState<number | null>(null);
  const [erroMercado, setErroMercado] = useState<string | null>(null);
  const [registrandoMercadoPending, startRegistrarMercado] = useTransition();

  // Popula as tabelas de revisão assim que o parse retorna — uma única vez.
  if (state?.propostasAtivos && linhasAtivos === null && criadosAtivos === null) {
    setLinhasAtivos(state.propostasAtivos.map((p) => ({ ...p, incluir: true })));
  }
  if (state?.propostasAcruo && linhasAcruo === null && registradasAcruo === null) {
    setLinhasAcruo(state.propostasAcruo.map((p) => ({ ...p, incluir: true })));
    if (!fonte) {
      const nomeFonte =
        state.formato === "pershing" ? "Extrato Bradesco Bank (Pershing)" : "Extrato Itaú Private Bank";
      setFonte(`${nomeFonte} ${state.dataBase ? fmtDataBR(state.dataBase) : ""}`.trim());
    }
  }
  if (state?.propostasMercado && linhasMercado === null && registradasMercado === null) {
    setLinhasMercado(state.propostasMercado.map((p) => ({ ...p, incluir: true })));
  }

  function atualizarAtivo(index: number, patch: Partial<LinhaAtivo>) {
    setLinhasAtivos((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  }
  function atualizarAcruo(index: number, patch: Partial<LinhaAcruo>) {
    setLinhasAcruo((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  }
  function atualizarMercado(index: number, patch: Partial<LinhaMercado>) {
    setLinhasMercado((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  }

  function handleCriarAtivos() {
    if (!linhasAtivos) return;
    setErroAtivos(null);
    const selecionadas = linhasAtivos
      .filter((l) => l.incluir)
      .map(({ identificador, nome, valorMercado, taxaCupom, dataVencimento }) => ({
        identificador,
        nome,
        valorMercado,
        taxaCupom,
        dataVencimento,
      }));
    if (selecionadas.length === 0) {
      setErroAtivos("Selecione ao menos um título para criar.");
      return;
    }
    startCriarAtivos(async () => {
      const resultado = await criarAtivosEmLoteAction(selecionadas);
      if (resultado.error) {
        setErroAtivos(resultado.error);
        return;
      }
      setCriadosAtivos(resultado.criados ?? 0);
      setLinhasAtivos(null);
    });
  }

  function handleRegistrarAcruo() {
    if (!linhasAcruo) return;
    setErroAcruo(null);
    const selecionadas = linhasAcruo.filter((l) => l.incluir);
    if (selecionadas.length === 0) {
      setErroAcruo("Selecione ao menos um grupo para registrar.");
      return;
    }
    startRegistrarAcruo(async () => {
      const resultado = await confirmarApuracoesAction(selecionadas, fonte);
      if (resultado.error) {
        setErroAcruo(resultado.error);
        return;
      }
      setRegistradasAcruo(resultado.registradas ?? 0);
      setLinhasAcruo(null);
    });
  }

  function handleRegistrarMercado() {
    if (!linhasMercado) return;
    setErroMercado(null);
    const selecionadas = linhasMercado.filter((l) => l.incluir);
    if (selecionadas.length === 0) {
      setErroMercado("Selecione ao menos um fundo para registrar.");
      return;
    }
    startRegistrarMercado(async () => {
      const resultado = await confirmarMarcacoesAction(selecionadas, fonte);
      if (resultado.error) {
        setErroMercado(resultado.error);
        return;
      }
      setRegistradasMercado(resultado.registradas ?? 0);
      setLinhasMercado(null);
    });
  }

  const jaSubmeteu =
    !!state &&
    (state.loteId ||
      state.propostasAtivos ||
      state.ativosJaCadastrados ||
      state.propostasAcruo ||
      state.propostasMercado);

  if (!jaSubmeteu) {
    return (
      <form action={formAction} className="space-y-4 max-w-lg">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Conta bancária deste extrato
          </label>
          <select
            name="conta_bancaria_code"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Selecione a conta (Ativo)...</option>
            {contasBancarias.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Usada só se o arquivo tiver movimentação de caixa (extrato de conta corrente). Se for um
            Statement de custódia sem seção de caixa, essa conta é ignorada.
          </p>
          {contasBancarias.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Você ainda não tem nenhuma conta do tipo Ativo cadastrada no Plano de Contas. Crie uma (ex:
              &ldquo;Banco X — Conta Corrente&rdquo;) antes de importar.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Arquivo do extrato</label>
          <input
            type="file"
            name="arquivo"
            required
            accept=".ofx,.qfx,.csv,.xls,.xlsx,.pdf"
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:text-white file:px-3 file:py-2 file:text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Formatos aceitos: OFX, CSV, XLS/XLSX ou PDF (com texto selecionável). Um PDF de Statement de
            custódia (Itaú Private Bank ou Bradesco Bank/Pershing) já alimenta de uma vez só a
            movimentação bancária, a Carteira e as apurações de Ajustes (acruamento e marcação a
            mercado) — não precisa subir de novo nas outras telas.
          </p>
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || contasBancarias.length === 0}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Lendo arquivo..." : "Importar arquivo"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      {state?.loteId && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-4 text-sm text-blue-800">
          Encontrei {state.totalTransacoesBanco}{" "}
          {state.totalTransacoesBanco === 1 ? "transação bancária" : "transações bancárias"} nesse
          arquivo.{" "}
          <Link href={`/importar/${state.loteId}`} className="underline font-medium">
            Revisar e conciliar →
          </Link>
        </div>
      )}

      {(linhasAcruo || linhasMercado) && (
        <div>
          <label className="block text-xs text-slate-500 mb-1">Fonte (grava no histórico)</label>
          <input
            type="text"
            value={fonte}
            onChange={(e) => setFonte(e.target.value)}
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
      )}

      {state?.ativosJaCadastrados && state.ativosJaCadastrados.length > 0 && (
        <div className="text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-md px-3 py-2">
          {state.ativosJaCadastrados.length}{" "}
          {state.ativosJaCadastrados.length === 1 ? "título já cadastrado foi ignorado" : "títulos já cadastrados foram ignorados"}{" "}
          automaticamente (não entram como &ldquo;novo&rdquo; de novo): {state.ativosJaCadastrados.join("; ")}.
        </div>
      )}

      {criadosAtivos !== null && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
          {criadosAtivos} {criadosAtivos === 1 ? "ativo criado" : "ativos criados"} na Carteira.{" "}
          <Link href="/carteira" className="underline font-medium">
            Ver Carteira
          </Link>
        </div>
      )}

      {linhasAtivos && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-slate-800">Novas posições para a Carteira</h3>
            <p className="text-sm text-slate-600">
              Encontrei {linhasAtivos.length} título(s) na seção de custódia desse PDF — revise antes de
              criar. Nada é gravado até você clicar em &ldquo;Criar ativos selecionados&rdquo;.
            </p>
          </div>

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
                {linhasAtivos.map((l, i) => (
                  <tr key={l.identificador} className={l.incluir ? "" : "opacity-40"}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={l.incluir}
                        onChange={(e) => atualizarAtivo(i, { incluir: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {l.identificador}
                    </td>
                    <td className="px-3 py-2 max-w-sm">
                      <input
                        type="text"
                        value={l.nome}
                        onChange={(e) => atualizarAtivo(i, { nome: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        value={l.valorMercado}
                        onChange={(e) => atualizarAtivo(i, { valorMercado: parseFloat(e.target.value) || 0 })}
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
                          atualizarAtivo(i, {
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
                        onChange={(e) => atualizarAtivo(i, { dataVencimento: e.target.value || null })}
                        className="rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erroAtivos && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {erroAtivos}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCriarAtivos}
              disabled={criandoAtivosPending}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
            >
              {criandoAtivosPending
                ? "Criando..."
                : `Criar ${linhasAtivos.filter((l) => l.incluir).length} ativos selecionados`}
            </button>
            <button
              type="button"
              onClick={() => setLinhasAtivos(null)}
              disabled={criandoAtivosPending}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {registradasAcruo !== null && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
          {registradasAcruo}{" "}
          {registradasAcruo === 1 ? "apuração de acruamento registrada" : "apurações de acruamento registradas"}.
          {" "}Agora é só ir em Ajustes e clicar em &ldquo;Lançar no Diário&rdquo; em cada uma pra aprovar.{" "}
          <Link href="/ajustes" className="underline font-medium">
            Ver Ajustes
          </Link>
        </div>
      )}

      {linhasAcruo && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-slate-800">Acruamento — Renda Fixa</h3>
            <p className="text-sm text-slate-600">
              Data-base identificada no extrato: <strong>{state?.dataBase ? fmtDataBR(state.dataBase) : "—"}</strong>.
              {" "}Encontrei {linhasAcruo.length} grupo(s) — revise antes de registrar. Nada é gravado até
              você clicar em &ldquo;Registrar apurações selecionadas&rdquo;.
            </p>
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
                {linhasAcruo.map((l, i) => (
                  <tr key={l.nomeGrupo} className={l.incluir ? "" : "opacity-40"}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={l.incluir}
                        onChange={(e) => atualizarAcruo(i, { incluir: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{l.nomeGrupo}</div>
                      <div className="text-xs text-slate-400">
                        conta(s): {l.contaAcruoCode} · receita: {l.contaReceitaCode}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-top text-slate-500">
                      {fmtMoney(l.saldoContabilAntes, moeda)}
                    </td>
                    <td className="px-3 py-2 text-right align-top text-slate-500">
                      {l.acruoCalculadoInterno != null ? fmtMoney(l.acruoCalculadoInterno, moeda) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={l.valorReportadoBanco}
                        onChange={(e) => {
                          const valor = parseFloat(e.target.value) || 0;
                          atualizarAcruo(i, {
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
                      {fmtMoney(l.diferenca, moeda)}
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">
                      {l.itens.map((it) => (
                        <div key={it.nome}>
                          {it.nome} — {fmtMoney(it.accruedInterest, moeda)}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {state?.naoReconhecidas && state.naoReconhecidas.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              {state.naoReconhecidas.length} papel(éis) do extrato não foi(ram) reconhecido(s) — não
              entram em nenhum grupo acima:{" "}
              {state.naoReconhecidas.map((n) => n.nome).join("; ")}. Se algum desses deveria contar,
              cadastre o ISIN/CUSIP dele no Ativo correspondente e importe de novo.
            </div>
          )}

          {erroAcruo && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {erroAcruo}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRegistrarAcruo}
              disabled={registrandoAcruoPending}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
            >
              {registrandoAcruoPending
                ? "Registrando..."
                : `Registrar ${linhasAcruo.filter((l) => l.incluir).length} apurações selecionadas`}
            </button>
            <button
              type="button"
              onClick={() => setLinhasAcruo(null)}
              disabled={registrandoAcruoPending}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {registradasMercado !== null && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
          {registradasMercado}{" "}
          {registradasMercado === 1 ? "marcação a mercado registrada" : "marcações a mercado registradas"}.
          {" "}Agora é só ir em Ajustes e clicar em &ldquo;Lançar no Diário&rdquo; em cada uma pra aprovar.{" "}
          <Link href="/ajustes" className="underline font-medium">
            Ver Ajustes
          </Link>
        </div>
      )}

      {linhasMercado && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-slate-800">Marcação a Mercado — Fundos de Renda Variável</h3>
            <p className="text-sm text-slate-600">
              Encontrei o valor de mercado de {linhasMercado.length} fundo(s) já cadastrado(s) (pelo ISIN)
              nesse mesmo extrato. Revise antes de registrar.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="text-left px-3 py-2">Fundo</th>
                  <th className="text-right px-3 py-2">Contábil atual</th>
                  <th className="text-right px-3 py-2">Valor de mercado (extrato)</th>
                  <th className="text-right px-3 py-2">Diferença</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhasMercado.map((l, i) => (
                  <tr key={l.ativoId} className={l.incluir ? "" : "opacity-40"}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={l.incluir}
                        onChange={(e) => atualizarMercado(i, { incluir: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-slate-800">{l.nomeAtivo}</div>
                      <div className="text-xs text-slate-400">
                        conta: {l.contaAtivoCode} · ISIN: {l.isin}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right align-top text-slate-500">
                      {fmtMoney(l.saldoContabilAntes, moeda)}
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={l.valorReportadoMercado}
                        onChange={(e) => {
                          const valor = parseFloat(e.target.value) || 0;
                          atualizarMercado(i, {
                            valorReportadoMercado: valor,
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
                      {fmtMoney(l.diferenca, moeda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erroMercado && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {erroMercado}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRegistrarMercado}
              disabled={registrandoMercadoPending}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
            >
              {registrandoMercadoPending
                ? "Registrando..."
                : `Registrar ${linhasMercado.filter((l) => l.incluir).length} marcações selecionadas`}
            </button>
            <button
              type="button"
              onClick={() => setLinhasMercado(null)}
              disabled={registrandoMercadoPending}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Ignorar
            </button>
          </div>
        </div>
      )}

      {!linhasAtivos && !linhasAcruo && !linhasMercado && (
        <p className="text-sm text-slate-500">
          Tudo revisado por aqui.{" "}
          <Link href="/importar" className="underline font-medium text-slate-700">
            Importar outro arquivo
          </Link>
        </p>
      )}
    </div>
  );
}
