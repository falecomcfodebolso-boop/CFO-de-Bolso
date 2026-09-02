"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { gerarPropostaAction, criarContasEmLoteAction } from "./actions";
import type { ContaProposta, PerfilEmpresa, TipoNegocio } from "@/lib/estruturacao/gerar-plano";

const TIPOS: { value: TipoNegocio; label: string }[] = [
  { value: "holding_patrimonial", label: "Holding patrimonial (não opera, só detém participações/ativos)" },
  { value: "operacional_comercio", label: "Empresa operacional — comércio/varejo" },
  { value: "operacional_servicos", label: "Empresa operacional — prestação de serviços" },
  { value: "operacional_industria", label: "Empresa operacional — indústria/manufatura" },
  { value: "investimentos", label: "Veículo de investimentos financeiros (sem operação comercial)" },
  { value: "outro", label: "Outro" },
];

const NATUREZAS = ["ATIVO", "PASSIVO", "PL", "RECEITA", "DESPESA"] as const;

type LinhaProposta = ContaProposta & { incluir: boolean };

export function EstruturarForm({ moeda }: { moeda: string }) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [modoDemo, setModoDemo] = useState(false);
  const [linhas, setLinhas] = useState<LinhaProposta[] | null>(null);
  const [criadas, setCriadas] = useState<number | null>(null);

  const [tipoNegocio, setTipoNegocio] = useState<TipoNegocio>("operacional_servicos");
  const [tipoNegocioOutro, setTipoNegocioOutro] = useState("");
  const [atividades, setAtividades] = useState("");
  const [temCarteira, setTemCarteira] = useState(false);
  const [temImoveis, setTemImoveis] = useState(false);
  const [temFuncionarios, setTemFuncionarios] = useState(false);

  function handleGerar() {
    setErro(null);
    setCriadas(null);
    const perfil: PerfilEmpresa = {
      tipoNegocio,
      tipoNegocioOutro,
      atividades,
      temCarteiraInvestimentos: temCarteira,
      temImoveis,
      temFuncionarios,
      moeda,
    };
    startTransition(async () => {
      const resultado = await gerarPropostaAction(perfil);
      if (resultado.error) {
        setErro(resultado.error);
        setLinhas(null);
        return;
      }
      setModoDemo(Boolean(resultado.modoDemo));
      setLinhas((resultado.contas ?? []).map((c) => ({ ...c, incluir: true })));
    });
  }

  function handleCriar() {
    if (!linhas) return;
    setErro(null);
    const selecionadas: ContaProposta[] = linhas
      .filter((l) => l.incluir)
      .map((l) => ({ code: l.code, name: l.name, natureza: l.natureza, motivo: l.motivo }));
    if (selecionadas.length === 0) {
      setErro("Selecione ao menos uma conta para criar.");
      return;
    }
    startTransition(async () => {
      const resultado = await criarContasEmLoteAction(selecionadas);
      if (resultado.error) {
        setErro(resultado.error);
        return;
      }
      setCriadas(resultado.criadas ?? 0);
      setLinhas(null);
    });
  }

  function atualizarLinha(index: number, patch: Partial<LinhaProposta>) {
    setLinhas((prev) => (prev ? prev.map((l, i) => (i === index ? { ...l, ...patch } : l)) : prev));
  }

  if (criadas !== null) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-4 text-sm text-emerald-800">
        {criadas} {criadas === 1 ? "conta criada" : "contas criadas"} com sucesso.{" "}
        <Link href="/plano-de-contas" className="underline font-medium">
          Ver Plano de Contas
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!linhas && (
        <div className="space-y-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de negócio</label>
            <select
              value={tipoNegocio}
              onChange={(e) => setTipoNegocio(e.target.value as TipoNegocio)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {tipoNegocio === "outro" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Descreva o tipo de negócio</label>
              <input
                type="text"
                value={tipoNegocioOutro}
                onChange={(e) => setTipoNegocioOutro(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Principais atividades (breve descrição)
            </label>
            <textarea
              value={atividades}
              onChange={(e) => setAtividades(e.target.value)}
              rows={3}
              placeholder="Ex: revenda de peças automotivas para oficinas, com um depósito próprio."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={temCarteira} onChange={(e) => setTemCarteira(e.target.checked)} />
              Possui carteira de investimentos financeiros
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={temImoveis} onChange={(e) => setTemImoveis(e.target.checked)} />
              Possui imóveis
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={temFuncionarios}
                onChange={(e) => setTemFuncionarios(e.target.checked)}
              />
              Tem funcionários (folha de pagamento)
            </label>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</p>
          )}

          <button
            type="button"
            onClick={handleGerar}
            disabled={pending}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Gerando sugestão..." : "Gerar sugestão de plano de contas"}
          </button>
        </div>
      )}

      {linhas && (
        <div className="space-y-3">
          {modoDemo && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              ANTHROPIC_API_KEY não configurada — esta é uma sugestão de modelo genérico baseada no tipo de
              negócio e nas opções marcadas, não personalizada por IA a partir da descrição livre. Configure a
              chave para sugestões mais específicas.
            </p>
          )}
          <p className="text-sm text-slate-600">
            Revise as {linhas.length} contas sugeridas abaixo — desmarque, edite o nome ou a natureza antes de
            criar. Nada é criado até você clicar em &ldquo;Criar contas selecionadas&rdquo;.
          </p>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Nome</th>
                  <th className="text-left px-3 py-2">Natureza</th>
                  <th className="text-left px-3 py-2">Por quê</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l, i) => (
                  <tr key={l.code} className={l.incluir ? "" : "opacity-40"}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={l.incluir}
                        onChange={(e) => atualizarLinha(i, { incluir: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{l.code}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={l.name}
                        onChange={(e) => atualizarLinha(i, { name: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={l.natureza}
                        onChange={(e) => atualizarLinha(i, { natureza: e.target.value as ContaProposta["natureza"] })}
                        className="rounded border border-slate-200 px-2 py-1 text-sm"
                      >
                        {NATUREZAS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{l.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{erro}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCriar}
              disabled={pending}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-60"
            >
              {pending ? "Criando..." : `Criar ${linhas.filter((l) => l.incluir).length} contas selecionadas`}
            </button>
            <button
              type="button"
              onClick={() => {
                setLinhas(null);
                setErro(null);
              }}
              disabled={pending}
              className="text-sm text-slate-500 hover:text-slate-900"
            >
              Cancelar e refazer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
