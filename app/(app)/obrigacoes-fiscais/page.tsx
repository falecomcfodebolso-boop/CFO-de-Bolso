import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDRE } from "@/lib/accounting/demonstrativos";
import { fmtMoney } from "@/lib/format";
import {
  calcularMEI,
  calcularLucroPresumido,
  calcularLucroReal,
  trimestreDe,
  trimestreParaDatas,
} from "@/lib/fiscal/calculos";

const NOME_ATIVIDADE: Record<string, string> = {
  COMERCIO_INDUSTRIA: "Comércio ou indústria",
  SERVICOS: "Serviços",
  COMERCIO_E_SERVICOS: "Comércio e serviços",
  TRANSPORTE_CARGA: "Transporte de cargas",
};

const NOME_REGIME: Record<string, string> = {
  MEI: "MEI",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
};

function LinhaImposto({ label, valor, currency }: { label: string; valor: number; currency: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-slate-900">{fmtMoney(valor, currency)}</span>
    </div>
  );
}

export default async function ObrigacoesFiscaisPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; trimestre?: string }>;
}) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const org = currentMembership.organizations;
  const currency = org?.base_currency ?? "USD";

  if (org?.base_currency !== "BRL") {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Obrigações Fiscais</h1>
        <p className="text-sm text-slate-500">
          Esse recurso é específico para organizações brasileiras (moeda base em Reais). A organização
          atual está em {currency}.
        </p>
      </div>
    );
  }

  if (!org.regime_tributario) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-xl font-semibold text-slate-900">Obrigações Fiscais</h1>
        <p className="text-sm text-slate-500">
          Ainda não configuramos o regime tributário dessa organização (MEI, Lucro Presumido ou Lucro
          Real). Configure em{" "}
          <Link href="/configuracoes" className="underline text-slate-700">
            Configurações
          </Link>{" "}
          pra liberar o checklist e os cálculos.
        </p>
      </div>
    );
  }

  const { ano: anoParam, trimestre: trimestreParam } = await searchParams;
  const atual = trimestreDe(new Date().toISOString().slice(0, 10));
  const ano = anoParam ? parseInt(anoParam, 10) : atual.ano;
  const trimestre = (trimestreParam ? parseInt(trimestreParam, 10) : atual.trimestre) as 1 | 2 | 3 | 4;
  const { inicio, fim } = trimestreParaDatas(ano, trimestre);

  const dre = org.regime_tributario !== "MEI" ? await getDRE(supabase, currentOrgId, inicio, fim) : null;

  const atividade = org.atividade_tributaria ?? "COMERCIO_INDUSTRIA";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Obrigações Fiscais</h1>
        <p className="text-sm text-slate-500 mt-1">
          Regime: <span className="font-medium text-slate-700">{NOME_REGIME[org.regime_tributario]}</span>
          {org.atividade_tributaria && (
            <>
              {" "}
              · Atividade: <span className="font-medium text-slate-700">{NOME_ATIVIDADE[atividade]}</span>
            </>
          )}
          {" "}·{" "}
          <Link href="/configuracoes" className="underline hover:text-slate-700">
            alterar
          </Link>
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
        Os valores abaixo são estimativas com base nas regras gerais (alíquotas e percentuais de
        presunção padrão) e na alíquota de ISS que você informou. Não consideram particularidades do
        seu CNAE, benefícios fiscais ou créditos específicos — confirme com um contador antes de pagar
        qualquer guia.
      </div>

      {org.regime_tributario === "MEI" ? (
        <MEIView atividade={atividade} currency={currency} />
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Ano</label>
              <input
                type="number"
                name="ano"
                defaultValue={ano}
                className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Trimestre</label>
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
              Período: {inicio} a {fim}
            </span>
          </form>

          {!dre?.temMovimento && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Nenhum lançamento de Receita ou Despesa encontrado nesse trimestre.
            </p>
          )}

          {org.regime_tributario === "LUCRO_PRESUMIDO" && dre && (
            <LucroPresumidoView
              atividade={atividade}
              receitaBrutaTrimestre={dre.receitaBruta}
              aliquotaIss={org.aliquota_iss}
              currency={currency}
            />
          )}

          {org.regime_tributario === "LUCRO_REAL" && dre && (
            <LucroRealView
              atividade={atividade}
              receitaBrutaTrimestre={dre.receitaBruta}
              lucroAntesImpostosTrimestre={dre.resultadoAntesImpostos}
              aliquotaIss={org.aliquota_iss}
              currency={currency}
            />
          )}
        </>
      )}

      <ChecklistPrazos regime={org.regime_tributario} />
    </div>
  );
}

function MEIView({ atividade, currency }: { atividade: string; currency: string }) {
  const calc = calcularMEI(atividade as Parameters<typeof calcularMEI>[0]);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
      <h2 className="text-sm font-semibold text-slate-900 mb-2">DAS mensal</h2>
      <LinhaImposto label="Valor fixo do DAS-MEI (2026)" valor={calc.dasValor} currency={currency} />
      <p className="text-xs text-slate-400 mt-2">
        O DAS do MEI é um valor fixo (não depende da receita do mês) — inclui INSS e, conforme a
        atividade, ICMS e/ou ISS. Vence todo dia 20.
      </p>
    </div>
  );
}

function LucroPresumidoView({
  atividade,
  receitaBrutaTrimestre,
  aliquotaIss,
  currency,
}: {
  atividade: string;
  receitaBrutaTrimestre: number;
  aliquotaIss: number | null;
  currency: string;
}) {
  const calc = calcularLucroPresumido({
    atividade: atividade as Parameters<typeof calcularLucroPresumido>[0]["atividade"],
    receitaBrutaTrimestre,
    aliquotaIss,
  });
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-lg">
      <h2 className="text-sm font-semibold text-slate-900 mb-2">Impostos estimados do trimestre</h2>
      <LinhaImposto label="Receita bruta do trimestre" valor={calc.receitaBrutaTrimestre} currency={currency} />
      <LinhaImposto label="IRPJ (sobre base presumida)" valor={calc.irpj} currency={currency} />
      <LinhaImposto label="CSLL (sobre base presumida)" valor={calc.csll} currency={currency} />
      <LinhaImposto label="PIS" valor={calc.pis} currency={currency} />
      <LinhaImposto label="COFINS" valor={calc.cofins} currency={currency} />
      {calc.iss > 0 && <LinhaImposto label="ISS" valor={calc.iss} currency={currency} />}
      <div className="pt-2 mt-1 border-t border-slate-200 flex items-center justify-between font-semibold">
        <span className="text-slate-700">Total estimado do trimestre</span>
        <span className="font-mono text-slate-900">{fmtMoney(calc.totalTrimestre, currency)}</span>
      </div>
    </div>
  );
}

function LucroRealView({
  atividade,
  receitaBrutaTrimestre,
  lucroAntesImpostosTrimestre,
  aliquotaIss,
  currency,
}: {
  atividade: string;
  receitaBrutaTrimestre: number;
  lucroAntesImpostosTrimestre: number;
  aliquotaIss: number | null;
  currency: string;
}) {
  const calc = calcularLucroReal({
    atividade: atividade as Parameters<typeof calcularLucroReal>[0]["atividade"],
    receitaBrutaTrimestre,
    lucroAntesImpostosTrimestre,
    aliquotaIss,
  });
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-lg">
      <h2 className="text-sm font-semibold text-slate-900 mb-2">Impostos estimados do trimestre</h2>
      <LinhaImposto label="Receita bruta do trimestre" valor={calc.receitaBrutaTrimestre} currency={currency} />
      <LinhaImposto label="Lucro antes dos impostos" valor={calc.lucroAntesImpostosTrimestre} currency={currency} />
      <LinhaImposto label="IRPJ (15% + adicional 10%)" valor={calc.irpj} currency={currency} />
      <LinhaImposto label="CSLL (9%)" valor={calc.csll} currency={currency} />
      <LinhaImposto label="PIS/COFINS não-cumulativo (9,25% s/ receita, s/ créditos)" valor={calc.pisCofins} currency={currency} />
      {calc.iss > 0 && <LinhaImposto label="ISS" valor={calc.iss} currency={currency} />}
      <div className="pt-2 mt-1 border-t border-slate-200 flex items-center justify-between font-semibold">
        <span className="text-slate-700">Total estimado do trimestre</span>
        <span className="font-mono text-slate-900">{fmtMoney(calc.totalTrimestre, currency)}</span>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        No Lucro Real, o PIS/COFINS não-cumulativo permite descontar créditos sobre insumos, energia,
        aluguel etc. — esse cálculo usa a alíquota cheia sobre a receita, sem aplicar créditos, então
        tende a superestimar o valor devido.
      </p>
    </div>
  );
}

function ChecklistPrazos({ regime }: { regime: string }) {
  const itensComuns = [
    { label: "DASN-SIMEI / declaração anual do Simples Nacional", prazo: "até 31 de maio (ano seguinte)" },
  ];
  const itens =
    regime === "MEI"
      ? [
          { label: "Pagamento do DAS-MEI", prazo: "todo dia 20" },
          {
            label: "Relatório Mensal de Receitas Brutas",
            prazo: "preencher todo mês e guardar por 5 anos",
          },
          ...itensComuns,
        ]
      : [
          { label: "IRPJ e CSLL (trimestral)", prazo: "até o último dia útil do mês seguinte ao trimestre" },
          { label: "PIS e COFINS", prazo: "até o dia 25 do mês seguinte" },
          { label: "ISS (se prestar serviços)", prazo: "conforme calendário do seu município" },
          {
            label: "Emissão de nota fiscal",
            prazo: "obrigatória para vendas/serviços a pessoa jurídica",
          },
        ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-900 mb-3">Checklist de obrigações</h2>
      <ul className="space-y-2 text-sm">
        {itens.map((i) => (
          <li key={i.label} className="flex items-start justify-between gap-4">
            <span className="text-slate-700">{i.label}</span>
            <span className="text-slate-400 text-xs whitespace-nowrap">{i.prazo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
