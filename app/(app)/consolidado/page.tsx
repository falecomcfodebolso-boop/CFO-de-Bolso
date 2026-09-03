import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { fmtMoney } from "@/lib/format";
import {
  getParticipacoes,
  getBalancoConsolidado,
  getDREConsolidada,
  getResumoParticipacoes,
} from "@/lib/accounting/consolidacao";
import { trimestreDe, trimestreParaDatas } from "@/lib/fiscal/calculos";

function Linha({ label, valor, currency, forte }: { label: string; valor: number; currency: string; forte?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 ${forte ? "font-semibold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-slate-900">{fmtMoney(valor, currency)}</span>
    </div>
  );
}

export default async function ConsolidadoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; trimestre?: string }>;
}) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const nomeInvestidora = currentMembership.organizations?.name ?? "esta empresa";

  const { ano: anoParam, trimestre: trimestreParam } = await searchParams;
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = trimestreDe(hoje);
  const ano = anoParam ? parseInt(anoParam, 10) : atual.ano;
  const trimestre = (trimestreParam ? parseInt(trimestreParam, 10) : atual.trimestre) as 1 | 2 | 3 | 4;
  const { inicio, fim } = trimestreParaDatas(ano, trimestre);
  const dataBalanco = ano < atual.ano || (ano === atual.ano && trimestre < atual.trimestre) ? fim : hoje;

  const participacoes = await getParticipacoes(supabase, currentOrgId);

  if (participacoes.length === 0) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold text-slate-900">Consolidado</h1>
        <p className="text-sm text-slate-500">
          {nomeInvestidora} ainda não tem nenhuma participação societária registrada em outra empresa do
          seu login. Cadastre em{" "}
          <Link href="/participacoes" className="underline text-slate-700">
            Participações Societárias
          </Link>{" "}
          pra ver aqui o balanço e a DRE consolidados.
        </p>
      </div>
    );
  }

  const [balancoConsolidado, dreConsolidada, resumos] = await Promise.all([
    getBalancoConsolidado(supabase, currentOrgId, nomeInvestidora, dataBalanco),
    getDREConsolidada(supabase, currentOrgId, inicio, fim),
    getResumoParticipacoes(supabase, currentOrgId, dataBalanco, inicio),
  ]);

  const coligadas = resumos.filter((r) => r.participacao.tipo === "COLIGADA");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Consolidado — {nomeInvestidora}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Soma o Balanço e a DRE de {nomeInvestidora} com os das empresas controladas (participação
          acima de 50%), eliminando as operações marcadas como intercompany entre elas. Empresas
          coligadas (50% ou menos) aparecem só pelo método de equivalência patrimonial, na seção abaixo.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-1">
        <p>
          Consolidação simplificada: soma 100% dos ativos/passivos e receitas/despesas das controladas
          e elimina só o que foi explicitamente marcado como &quot;intercompany&quot; num lançamento do
          Diário. Não elimina o saldo de uma eventual conta de Investimentos nos livros de{" "}
          {nomeInvestidora} contra o patrimônio da controlada (isso pode gerar ágio/deságio e exige
          saber o valor pago na aquisição) — se você tiver essa conta, o ativo consolidado abaixo pode
          estar contando o valor da participação em dobro. Revise com um contador antes de usar
          oficialmente.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ano</label>
          <input type="number" name="ano" defaultValue={ano} className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Trimestre (DRE)</label>
          <select name="trimestre" defaultValue={trimestre} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value={1}>1º (jan-mar)</option>
            <option value={2}>2º (abr-jun)</option>
            <option value={3}>3º (jul-set)</option>
            <option value={4}>4º (out-dez)</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
          Calcular
        </button>
        <span className="text-xs text-slate-400">
          Balanço em {dataBalanco} · DRE de {inicio} a {fim}
        </span>
      </form>

      {balancoConsolidado ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-lg">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Balanço Patrimonial Consolidado</h2>
          <p className="text-xs text-slate-400 mb-2">
            Empresas somadas: {balancoConsolidado.empresas.map((e) => e.nome).join(", ")}
          </p>
          <Linha label="Ativo circulante" valor={balancoConsolidado.ativoCirculante} currency={currency} />
          <Linha label="Ativo não circulante" valor={balancoConsolidado.ativoNaoCirculante} currency={currency} />
          <Linha label="Ativo total" valor={balancoConsolidado.ativoTotal} currency={currency} forte />
          <div className="h-2" />
          <Linha label="Passivo circulante" valor={balancoConsolidado.passivoCirculante} currency={currency} />
          <Linha label="Passivo não circulante" valor={balancoConsolidado.passivoNaoCirculante} currency={currency} />
          <Linha label="Passivo total" valor={balancoConsolidado.passivoTotal} currency={currency} forte />
          <div className="h-2" />
          <Linha label="PL atribuível à controladora" valor={balancoConsolidado.patrimonioLiquidoControladora} currency={currency} />
          <Linha label="Participação de não controladores" valor={balancoConsolidado.participacaoNaoControladores} currency={currency} />
          <Linha label="Patrimônio líquido consolidado" valor={balancoConsolidado.patrimonioLiquidoConsolidado} currency={currency} forte />
          {(balancoConsolidado.eliminacaoAtivo > 0 || balancoConsolidado.eliminacaoPassivo > 0) && (
            <p className="text-xs text-slate-400 mt-2">
              Eliminado por ser intercompany: {fmtMoney(balancoConsolidado.eliminacaoAtivo, currency)} de ativo e{" "}
              {fmtMoney(balancoConsolidado.eliminacaoPassivo, currency)} de passivo.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Nenhuma controlada (participação acima de 50%) registrada.</p>
      )}

      {dreConsolidada ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-lg">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">DRE Consolidada do trimestre</h2>
          <Linha label="Receita bruta" valor={dreConsolidada.receitaBruta} currency={currency} />
          <Linha label="Deduções" valor={-dreConsolidada.deducoes} currency={currency} />
          <Linha label="Receita líquida" valor={dreConsolidada.receitaLiquida} currency={currency} />
          <Linha label="Custos" valor={-dreConsolidada.custos} currency={currency} />
          <Linha label="Lucro bruto" valor={dreConsolidada.lucroBruto} currency={currency} />
          <Linha label="Despesas operacionais" valor={-dreConsolidada.despesasOperacionais} currency={currency} />
          <Linha label="Resultado operacional" valor={dreConsolidada.resultadoOperacional} currency={currency} />
          <Linha
            label="Resultado antes dos impostos (inclui financeiras/outras de cada empresa)"
            valor={dreConsolidada.resultadoAntesImpostos}
            currency={currency}
          />
          <Linha label="Impostos sobre o lucro" valor={-dreConsolidada.impostosSobreLucro} currency={currency} />
          <Linha label="Lucro líquido consolidado" valor={dreConsolidada.lucroLiquidoConsolidado} currency={currency} forte />
          <Linha
            label="Participação de não controladores no resultado"
            valor={-dreConsolidada.participacaoNaoControladoresNoResultado}
            currency={currency}
          />
          <Linha
            label="Lucro líquido atribuível à controladora"
            valor={dreConsolidada.lucroLiquidoAtribuivelControladora}
            currency={currency}
            forte
          />
          {(dreConsolidada.eliminacaoReceita > 0 || dreConsolidada.eliminacaoDespesa > 0) && (
            <p className="text-xs text-slate-400 mt-2">
              Eliminado por ser intercompany: {fmtMoney(dreConsolidada.eliminacaoReceita, currency)} de receita e{" "}
              {fmtMoney(dreConsolidada.eliminacaoDespesa, currency)} de despesa/custo.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-400">Nenhuma controlada (participação acima de 50%) registrada.</p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Resumo por participação</h2>
        {resumos.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma participação registrada.</p>
        ) : (
          <div className="space-y-3">
            {resumos.map((r) => (
              <div key={r.participacao.id} className="border border-slate-100 rounded-lg px-3 py-2">
                <div className="text-sm font-medium text-slate-900 mb-1">
                  {r.participacao.investida_nome}{" "}
                  <span className="text-xs text-slate-400">
                    ({(r.participacao.percentual * 100).toFixed(2)}% ·{" "}
                    {r.participacao.tipo === "CONTROLADA" ? "controlada, consolidada acima" : "coligada, MEP"})
                  </span>
                </div>
                <Linha label="PL da investida" valor={r.patrimonioLiquidoInvestida} currency={currency} />
                <Linha label="Lucro líquido da investida no período" valor={r.lucroLiquidoInvestidaNoPeriodo} currency={currency} />
                <Linha label="Valor do investimento pela equivalência patrimonial" valor={r.valorPelaEquivalencia} currency={currency} />
                <Linha label="Resultado de equivalência patrimonial no período" valor={r.resultadoDeEquivalenciaNoPeriodo} currency={currency} />
              </div>
            ))}
          </div>
        )}
        {coligadas.length > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Pra refletir a equivalência patrimonial das coligadas na sua contabilidade oficial, lance
            manualmente no Diário o ajuste da conta de Investimentos contra uma conta de Resultado de
            Equivalência Patrimonial, usando os valores acima — o app não faz esse lançamento sozinho.
          </p>
        )}
      </div>

      <p className="text-xs text-slate-400">
        <Link href="/participacoes" className="underline">
          Gerenciar participações societárias
        </Link>
      </p>
    </div>
  );
}
