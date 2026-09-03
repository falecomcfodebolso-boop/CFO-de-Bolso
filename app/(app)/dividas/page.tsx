import { requireOrgContext, canWrite } from "@/lib/org";
import { NovaDividaForm } from "./nova-divida-form";
import { deleteDividaAction } from "./actions";
import { fmtMoney, fmtDate } from "@/lib/format";
import { classificarConcentracao, diasParaVencimento } from "@/lib/portfolio/indices";
import {
  totalDividas,
  hhiDividas,
  concentracaoPorCredor,
  concentracaoPorTipo,
  top5Dividas,
  taxaMediaPonderadaDividas,
  prazoMedioPonderadoDias,
  type Divida,
} from "@/lib/portfolio/passivos";
import { getBalanco } from "@/lib/accounting/demonstrativos";
import { getSaldosPorConta } from "@/lib/accounting/queries";
import { sincronizarComSaldoContabil } from "@/lib/accounting/sync";

const NOME_TIPO: Record<string, string> = {
  emprestimo: "Empréstimo",
  financiamento: "Financiamento",
  cartao: "Cartão de crédito",
  fornecedor: "Fornecedor",
  debenture: "Debênture",
  outro: "Outro",
};

export default async function DividasPage() {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: dividasData, error }, balanco, saldos] = await Promise.all([
    supabase.from("dividas").select("*").eq("org_id", currentOrgId).order("valor_atual", { ascending: false }),
    getBalanco(supabase, currentOrgId, hoje),
    getSaldosPorConta(supabase, currentOrgId),
  ]);
  if (error) throw error;

  const dividasBrutas = (dividasData ?? []) as Divida[];
  const dividas = sincronizarComSaldoContabil(dividasBrutas, saldos);
  const total = totalDividas(dividas);
  const hhiValue = hhiDividas(dividas);
  const concentracao = classificarConcentracao(hhiValue);
  const porCredor = concentracaoPorCredor(dividas);
  const porTipo = concentracaoPorTipo(dividas);
  const top5 = top5Dividas(dividas);
  const taxaMedia = taxaMediaPonderadaDividas(dividas);
  const prazoMedioDias = prazoMedioPonderadoDias(dividas);

  const endividamentoSobreAtivo = balanco.ativoTotal ? total / balanco.ativoTotal : 0;
  const dividaSobrePl = balanco.patrimonioLiquido ? total / balanco.patrimonioLiquido : 0;
  const diferencaVsPassivoContabil = total - balanco.passivoTotal;

  const proximosVencimentos = dividas
    .filter((d) => d.data_vencimento)
    .sort((a, b) => (a.data_vencimento! < b.data_vencimento! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dívidas &amp; Passivos</h1>
        <p className="text-sm text-slate-500">
          Assim como a Carteira organiza seus ativos, esta tela organiza suas dívidas (empréstimos,
          financiamentos, fornecedores etc.) pra análise de endividamento, concentração por credor e
          agenda de vencimentos.
        </p>
      </div>

      {canWrite(currentMembership.role) && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Nova dívida</h2>
          <NovaDividaForm />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Dívida Total" value={fmtMoney(total, currency)} />
        <Stat label="Taxa média ponderada" value={`${(taxaMedia * 100).toFixed(2)}% a.a.`} />
        <Stat label="Prazo médio ponderado" value={`${Math.round(prazoMedioDias)} dias`} />
        <Stat
          label="Concentração por credor (HHI)"
          value={hhiValue.toFixed(0)}
          sub={<span className={concentracao.tone}>{concentracao.label}</span>}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-medium text-slate-900 mb-1">Indicadores de endividamento</h2>
        <p className="text-xs text-slate-500 mb-3">
          Calculados a partir do saldo devedor cadastrado nesta tela contra o Ativo e o Patrimônio
          Líquido apurados na sua contabilidade (Diário/Razão) na data de hoje.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">Dívida / Ativo total</p>
            <p className="text-lg font-semibold text-slate-900">{(endividamentoSobreAtivo * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Dívida / Patrimônio Líquido</p>
            <p className="text-lg font-semibold text-slate-900">{(dividaSobrePl * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Dívida cadastrada − Passivo contábil</p>
            <p className={`text-lg font-semibold ${Math.abs(diferencaVsPassivoContabil) < 0.01 ? "text-slate-900" : "text-amber-600"}`}>
              {fmtMoney(diferencaVsPassivoContabil, currency)}
            </p>
          </div>
        </div>
        {Math.abs(diferencaVsPassivoContabil) >= 0.01 && (
          <p className="text-xs text-amber-700 mt-2">
            O saldo devedor cadastrado aqui não bate com o total do Passivo no seu Balancete — essa
            tela é só um controle auxiliar (não gera lançamento contábil sozinha); se quiser que o
            Passivo reflita isso, lance a dívida também no Diário.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Concentração por credor</h2>
          <ul className="space-y-2 text-sm">
            {porCredor.map((c) => (
              <li key={c.credor} className="flex items-center justify-between">
                <span className="text-slate-700">{c.credor}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(c.valor, currency)} ({(c.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
            {porCredor.length === 0 && <p className="text-slate-400">Nenhuma dívida cadastrada.</p>}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Por tipo de dívida</h2>
          <ul className="space-y-2 text-sm">
            {porTipo.map((t) => (
              <li key={t.tipo} className="flex items-center justify-between">
                <span className="text-slate-700">{NOME_TIPO[t.tipo] ?? t.tipo}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(t.valor, currency)} ({(t.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
            {porTipo.length === 0 && <p className="text-slate-400">Nenhuma dívida cadastrada.</p>}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Top 5 maiores dívidas</h2>
          <ul className="space-y-2 text-sm">
            {top5.map((d) => (
              <li key={d.nome} className="flex items-center justify-between">
                <span className="text-slate-700">{d.nome}</span>
                <span className="text-slate-900 font-medium">
                  {fmtMoney(d.valor, currency)} ({(d.pct * 100).toFixed(1)}%)
                </span>
              </li>
            ))}
            {top5.length === 0 && <p className="text-slate-400">Nenhuma dívida cadastrada.</p>}
          </ul>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-900 mb-3">Próximos vencimentos</h2>
          <ul className="space-y-2 text-sm">
            {proximosVencimentos.map((d) => {
              const dias = diasParaVencimento(d.data_vencimento as string);
              const urgente = dias <= 30;
              return (
                <li key={d.id} className="flex items-center justify-between">
                  <span className={urgente ? "text-amber-700 font-medium" : "text-slate-700"}>
                    {d.nome} — {fmtDate(d.data_vencimento as string)}
                  </span>
                  <span className={urgente ? "text-amber-700 font-medium" : "text-slate-900 font-medium"}>
                    {fmtMoney(Number(d.valor_atual), currency)}
                  </span>
                </li>
              );
            })}
            {proximosVencimentos.length === 0 && <p className="text-slate-400">Nenhuma dívida com vencimento cadastrado.</p>}
          </ul>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
          Todas as dívidas
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Nome</th>
                <th className="text-left px-4 py-2">Credor</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-right px-4 py-2">Saldo devedor</th>
                <th></th>
                <th className="text-right px-4 py-2">Taxa</th>
                <th className="text-right px-4 py-2">Vencimento</th>
                {canWrite(currentMembership.role) && <th></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dividas.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-800">{d.nome}</td>
                  <td className="px-4 py-2 text-slate-500">{d.credor ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{NOME_TIPO[d.tipo] ?? d.tipo}</td>
                  <td className="px-4 py-2 text-right text-slate-900">{fmtMoney(Number(d.valor_atual), currency)}</td>
                  <td className="px-4 py-1">
                    {d.sincronizado && (
                      <span
                        title="Saldo sincronizado ao vivo com o saldo da conta vinculada no Plano de Contas"
                        className="inline-block text-[10px] leading-none px-1.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                      >
                        contábil
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">
                    {d.taxa_juros ? `${(Number(d.taxa_juros) * 100).toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-slate-500">
                    {d.data_vencimento ? fmtDate(d.data_vencimento) : "—"}
                  </td>
                  {canWrite(currentMembership.role) && (
                    <td className="px-4 py-2 text-right">
                      <form action={deleteDividaAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-slate-400 hover:text-red-600 text-xs">remover</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {dividas.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400">
                    Nenhuma dívida cadastrada ainda.
                  </td>
                </tr>
              )}
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
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}
