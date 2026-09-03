import Link from "next/link";
import { Upload } from "lucide-react";
import { requireOrgContext, canWrite } from "@/lib/org";
import { NovoAtivoForm } from "./novo-ativo-form";
import { deleteAtivoAction } from "./actions";
import { AnaliseCarteira } from "./analise-carteira";
import { fmtMoney, fmtDate } from "@/lib/format";
import {
  totalCarteira,
  hhi,
  concentracaoPorCustodiante,
  topNConcentracao,
  taxaMediaPonderada,
  prazoMedioPonderado,
  distribuicaoPorVencimento,
  distribuicaoPorGrupoEmissor,
  exposicaoEstrutura,
  exposicaoPais,
  estimarCustoDeCapital,
  classificarConcentracao,
  diasParaVencimento,
  type Ativo,
} from "@/lib/portfolio/indices";
import { totalPorNatureza, getSaldosPorContaAteData } from "@/lib/accounting/queries";
import { getBalanco } from "@/lib/accounting/demonstrativos";
import { sincronizarComSaldoContabil } from "@/lib/accounting/sync";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";

export default async function CarteiraPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const podeEscrever = canWrite(currentMembership.role);
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: dataParam } = await searchParams;
  const dataEscolhida = dataParam || hoje;

  const [{ data: ativosData, error }, intervalo, { data: analisesData }] = await Promise.all([
    supabase.from("ativos").select("*").eq("org_id", currentOrgId).order("valor_atual", { ascending: false }),
    getIntervaloDeLancamentos(supabase, currentOrgId),
    supabase
      .from("analises_carteira")
      .select("id, conteudo, created_at")
      .eq("org_id", currentOrgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  if (error) throw error;

  const { data: dataRef, ajustada: dataAjustada, dataOriginal } = resolverDataReferencia(dataEscolhida, intervalo);
  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, dataRef);

  const ativosBrutos = (ativosData ?? []) as Ativo[];
  const ativos = sincronizarComSaldoContabil(ativosBrutos, saldos);
  const analises = analisesData ?? [];

  const total = totalCarteira(ativos);
  const hhiValue = hhi(ativos);
  const concentracao = classificarConcentracao(hhiValue);
  const porCustodiante = concentracaoPorCustodiante(ativos);
  const top10 = topNConcentracao(ativos, 10);
  const taxaMedia = taxaMediaPonderada(ativos);
  const prazoMedio = prazoMedioPonderado(ativos);
  const porVencimento = distribuicaoPorVencimento(ativos);
  const porGrupo = distribuicaoPorGrupoEmissor(ativos);
  const expCln = exposicaoEstrutura(ativos, "CLN");
  const expBrasil = exposicaoPais(ativos, "Brasil");

  const ativoContabil = totalPorNatureza(saldos, "ATIVO");
  const receita = totalPorNatureza(saldos, "RECEITA");
  const despesa = totalPorNatureza(saldos, "DESPESA");
  const resultado = receita - despesa;
  const roa = ativoContabil ? resultado / ativoContabil : 0;
  const margemFinanceira = receita ? resultado / receita : 0;

  // Estimativa de custo de capital (K) — parâmetros de referência, ajustáveis.
  const k = estimarCustoDeCapital({
    taxaLivreDeRisco: 0.0468,
    spreadCredito: 0.009,
    premioPaisPonderado: 0.005,
    premioComplexidadePonderado: 0.0009,
  });
  const spreadVsK = taxaMedia - k;

  // ROI do período: resultado ÷ Patrimônio Líquido de abertura (primeiro lançamento registrado).
  const dataAbertura = intervalo.primeira;
  const balancoRef = await getBalanco(supabase, currentOrgId, dataRef);
  const balancoAbertura = dataAbertura ? await getBalanco(supabase, currentOrgId, dataAbertura) : null;
  const plAbertura = balancoAbertura?.patrimonioLiquido ?? 0;
  const roiPeriodo = plAbertura ? resultado / plAbertura : null;
  const endividamento = balancoRef.patrimonioLiquido ? balancoRef.passivoTotal / balancoRef.patrimonioLiquido : 0;
  const liquidezCorrente = balancoRef.passivoCirculante ? balancoRef.ativoCirculante / balancoRef.passivoCirculante : null;
  const caixaTotal = balancoRef.contasAtivoCirculante
    .filter((c) => c.name.toLowerCase().includes("caixa"))
    .reduce((acc, c) => acc + c.saldo, 0);
  const liquidezImediata = balancoRef.ativoTotal ? caixaTotal / balancoRef.ativoTotal : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Carteira &amp; Índices</h1>
          <p className="text-sm text-slate-500">Concentração, rentabilidade e risco da carteira de investimentos.</p>
        </div>
        {podeEscrever && (
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href="/carteira/migrar"
              className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-700 rounded-md px-3 py-2 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Migrar de planilha
            </Link>
            <Link
              href="/carteira/importar"
              className="inline-flex items-center gap-1.5 text-sm bg-slate-900 text-white rounded-md px-3 py-2 hover:bg-slate-800"
            >
              <Upload className="h-4 w-4" />
              Importar de PDF
            </Link>
          </div>
        )}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Data de referência</label>
          <input type="date" name="data" defaultValue={dataRef} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Atualizar
        </button>
        <span className="text-xs text-slate-400">
          Todos os saldos e índices desta tela refletem a posição contábil em{" "}
          {new Date(`${dataRef}T00:00:00Z`).toLocaleDateString("pt-BR")}.
        </span>
      </form>

      {dataAjustada && dataOriginal && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3">
          Não há dados contábeis para {fmtDate(dataOriginal)}
          {dataOriginal > dataRef
            ? " (é depois do último lançamento registrado)"
            : " (é antes do primeiro lançamento registrado)"}
          . Mostrando o {dataOriginal > dataRef ? "último" : "primeiro"} período disponível:{" "}
          <strong>{fmtDate(dataRef)}</strong>.
        </div>
      )}

      {podeEscrever && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Novo ativo</h2>
          <NovoAtivoForm />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Carteira Total" value={fmtMoney(total, currency)} />
        <Stat label="ROA / ROE (anualizado)" value={`${(roa * 100).toFixed(2)}%`} sub="ROE = ROA (sem passivo exigível)" />
        <Stat label="Taxa média ponderada" value={`${(taxaMedia * 100).toFixed(2)}% a.a.`} />
        <Stat
          label="Concentração (HHI)"
          value={hhiValue.toFixed(0)}
          sub={<span className={concentracao.tone}>{concentracao.label}</span>}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Prazo médio ponderado" value={`${prazoMedio.toFixed(2)} anos`} />
        <Stat label="Exposição a CLNs" value={`${(expCln.pct * 100).toFixed(1)}%`} sub={fmtMoney(expCln.valor, currency)} />
        <Stat label="Exposição risco-país Brasil" value={`${(expBrasil.pct * 100).toFixed(1)}%`} sub={fmtMoney(expBrasil.valor, currency)} />
        <Stat label="Liquidez imediata (caixa/ativo)" value={`${(liquidezImediata * 100).toFixed(2)}%`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="ROI do período"
          value={roiPeriodo != null ? `${(roiPeriodo * 100).toFixed(2)}%` : "—"}
          sub={dataAbertura ? `desde ${new Date(`${dataAbertura}T00:00:00Z`).toLocaleDateString("pt-BR")}` : undefined}
        />
        <Stat label="Margem financeira líquida" value={`${(margemFinanceira * 100).toFixed(1)}%`} sub="resultado ÷ receita financeira bruta" />
        <Stat label="Índice de endividamento" value={`${(endividamento * 100).toFixed(2)}%`} sub="passivo ÷ patrimônio líquido" />
        <Stat
          label="Liquidez corrente"
          value={liquidezCorrente != null ? liquidezCorrente.toFixed(2) : "N/A (sem passivo)"}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-medium text-slate-900 mb-1">Custo de capital estimado (K) vs. yield da carteira</h2>
        <p className="text-xs text-slate-500 mb-3">
          K estimado por método build-up (taxa livre de risco + spread de crédito + prêmio país + complexidade) — é uma
          referência para orientar alocação, não uma taxa de mercado cotada. Ajuste os parâmetros conforme sua análise.
        </p>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">K estimado</p>
            <p className="text-lg font-semibold text-slate-900">{(k * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Yield médio da carteira</p>
            <p className="text-lg font-semibold text-slate-900">{(taxaMedia * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Spread (yield − K)</p>
            <p className={`text-lg font-semibold ${spreadVsK >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {(spreadVsK * 100).toFixed(2)} p.p.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Concentração por custodiante</h2>
          <ul className="space-y-2 text-sm">
            {porCustodiante.map((c) => (
              <li key={c.custodiante} className="flex items-center justify-between">
                <span className="text-slate-700">{c.custodiante}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(c.valor, currency)} ({(c.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
            {porCustodiante.length === 0 && <p className="text-slate-400">Nenhum ativo cadastrado.</p>}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Top 10 maiores posições</h2>
          <ul className="space-y-2 text-sm">
            {top10.map((a) => (
              <li key={a.nome} className="flex items-center justify-between">
                <span className="text-slate-700">{a.nome}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(a.valor, currency)} ({(a.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
            {top10.length === 0 && <p className="text-slate-400">Nenhum ativo cadastrado.</p>}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Distribuição por grupo de emissor/setor</h2>
          <ul className="space-y-2 text-sm">
            {porGrupo.map((g) => (
              <li key={g.grupo} className="flex items-center justify-between">
                <span className="text-slate-700">{g.grupo}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(g.valor, currency)} ({(g.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Distribuição por faixa de vencimento</h2>
          <ul className="space-y-2 text-sm">
            {porVencimento.map((f) => (
              <li key={f.label} className="flex items-center justify-between">
                <span className="text-slate-700">{f.label}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(f.valor, currency)} ({(f.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <AnaliseCarteira ativos={ativos} currency={currency} analises={analises} podeEscrever={podeEscrever} />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
          Todos os ativos
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-left px-4 py-2">Custodiante</th>
                <th className="text-right px-4 py-2">Valor</th>
                <th></th>
                <th className="text-right px-4 py-2">% Carteira</th>
                <th className="text-right px-4 py-2">Cupom</th>
                <th className="text-right px-4 py-2">Vencimento</th>
                <th className="text-right px-4 py-2">Prazo</th>
                {podeEscrever && <th></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ativos.map((a) => {
                const valor = Number(a.valor_atual);
                const pct = total ? valor / total : 0;
                const prazoAnos = a.data_vencimento ? diasParaVencimento(a.data_vencimento) / 365 : null;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-800">{a.nome}</td>
                    <td className="px-4 py-2 text-slate-500">{a.custodiante ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-900">{fmtMoney(valor, currency)}</td>
                    <td className="px-4 py-1">
                      {a.sincronizado && (
                        <span
                          title="Valor sincronizado ao vivo com o saldo da conta vinculada no Plano de Contas"
                          className="inline-block text-[10px] leading-none px-1.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                        >
                          contábil
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{(pct * 100).toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {a.taxa_cupom ? `${(Number(a.taxa_cupom) * 100).toFixed(3)}%` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">{a.data_vencimento ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {prazoAnos != null ? `${prazoAnos.toFixed(1)}a` : "—"}
                    </td>
                    {podeEscrever && (
                      <td className="px-4 py-2 text-right">
                        <form action={deleteAtivoAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="text-slate-400 hover:text-red-600 text-xs">remover</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold mt-1 text-slate-900">{value}</p>
      {sub && <p className="text-xs mt-1 text-slate-400">{sub}</p>}
    </div>
  );
}
