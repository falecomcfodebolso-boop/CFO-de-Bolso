import Link from "next/link";
import { Upload } from "lucide-react";
import { requireOrgContext, canWrite } from "@/lib/org";
import { NovoAtivoForm } from "./novo-ativo-form";
import { deleteAtivoAction } from "./actions";
import { fmtMoney } from "@/lib/format";
import {
  totalCarteira,
  hhi,
  concentracaoPorCustodiante,
  top5Concentracao,
  taxaMediaPonderada,
  estimarCustoDeCapital,
  classificarConcentracao,
  type Ativo,
} from "@/lib/portfolio/indices";
import { totalPorNatureza, getSaldosPorConta } from "@/lib/accounting/queries";
import { sincronizarComSaldoContabil } from "@/lib/accounting/sync";

export default async function CarteiraPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const [{ data: ativosData, error }, saldos] = await Promise.all([
    supabase.from("ativos").select("*").eq("org_id", currentOrgId).order("valor_atual", { ascending: false }),
    getSaldosPorConta(supabase, currentOrgId),
  ]);
  if (error) throw error;

  const ativosBrutos = (ativosData ?? []) as Ativo[];
  const ativos = sincronizarComSaldoContabil(ativosBrutos, saldos);
  const total = totalCarteira(ativos);
  const hhiValue = hhi(ativos);
  const concentracao = classificarConcentracao(hhiValue);
  const porCustodiante = concentracaoPorCustodiante(ativos);
  const top5 = top5Concentracao(ativos);
  const taxaMedia = taxaMediaPonderada(ativos);

  const ativoContabil = totalPorNatureza(saldos, "ATIVO");
  const receita = totalPorNatureza(saldos, "RECEITA");
  const despesa = totalPorNatureza(saldos, "DESPESA");
  const resultado = receita - despesa;
  const roa = ativoContabil ? resultado / ativoContabil : 0;

  // Estimativa de custo de capital (K) — parâmetros de referência, ajustáveis.
  // Ver observação na tela: não é uma taxa de mercado cotada.
  const k = estimarCustoDeCapital({
    taxaLivreDeRisco: 0.0468,
    spreadCredito: 0.009,
    premioPaisPonderado: 0.005,
    premioComplexidadePonderado: 0.0009,
  });
  const spreadVsK = taxaMedia - k;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Carteira &amp; Índices</h1>
          <p className="text-sm text-slate-500">Concentração, rentabilidade e risco da carteira de investimentos.</p>
        </div>
        {canWrite(currentMembership.role) && (
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

      {canWrite(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Novo ativo</h2>
          <NovoAtivoForm />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Carteira Total" value={fmtMoney(total, currency)} />
        <Stat label="ROA (resultado/ativo)" value={`${(roa * 100).toFixed(2)}%`} />
        <Stat label="Taxa média ponderada" value={`${(taxaMedia * 100).toFixed(2)}% a.a.`} />
        <Stat
          label="Concentração (HHI)"
          value={hhiValue.toFixed(0)}
          sub={<span className={concentracao.tone}>{concentracao.label}</span>}
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
          <h2 className="text-sm font-medium text-slate-900 mb-3">Top 5 maiores posições</h2>
          <ul className="space-y-2 text-sm">
            {top5.map((a) => (
              <li key={a.nome} className="flex items-center justify-between">
                <span className="text-slate-700">{a.nome}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(a.valor, currency)} ({(a.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
            {top5.length === 0 && <p className="text-slate-400">Nenhum ativo cadastrado.</p>}
          </ul>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
          Todos os ativos
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Nome</th>
              <th className="text-left px-4 py-2">Custodiante</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th></th>
              <th className="text-right px-4 py-2">Cupom</th>
              <th className="text-right px-4 py-2">Vencimento</th>
              {canWrite(currentMembership.role) && <th></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ativos.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-800">{a.nome}</td>
                <td className="px-4 py-2 text-slate-500">{a.custodiante ?? "—"}</td>
                <td className="px-4 py-2 text-right text-slate-900">{fmtMoney(Number(a.valor_atual), currency)}</td>
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
                <td className="px-4 py-2 text-right text-slate-500">
                  {a.taxa_cupom ? `${(Number(a.taxa_cupom) * 100).toFixed(3)}%` : "—"}
                </td>
                <td className="px-4 py-2 text-right text-slate-500">{a.data_vencimento ?? "—"}</td>
                {canWrite(currentMembership.role) && (
                  <td className="px-4 py-2 text-right">
                    <form action={deleteAtivoAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-slate-400 hover:text-red-600 text-xs">remover</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold mt-1 text-slate-900">{value}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}
