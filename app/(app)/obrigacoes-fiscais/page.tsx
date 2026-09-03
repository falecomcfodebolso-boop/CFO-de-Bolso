import Link from "next/link";
import { requireOrgContext } from "@/lib/org";
import { getDRE, type Dre } from "@/lib/accounting/demonstrativos";
import { fmtMoney } from "@/lib/format";
import {
  calcularMEI,
  calcularLimiteMEI,
  calcularAtrasoDAS,
  vencimentoDAS,
  calcularLucroPresumido,
  calcularLucroReal,
  calcularSimplesNacional,
  calcularLimiteSimples,
  mesParaDatas,
  janelaDozeMeses,
  NOME_ANEXO_SIMPLES,
  trimestreDe,
  trimestreParaDatas,
  type AnexoSimples,
} from "@/lib/fiscal/calculos";

const NOME_ATIVIDADE: Record<string, string> = {
  COMERCIO_INDUSTRIA: "Comércio ou indústria",
  SERVICOS: "Serviços",
  COMERCIO_E_SERVICOS: "Comércio e serviços",
  TRANSPORTE_CARGA: "Transporte de cargas",
};

const NOME_REGIME: Record<string, string> = {
  MEI: "MEI",
  SIMPLES_NACIONAL: "Simples Nacional",
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
  searchParams: Promise<{
    ano?: string;
    trimestre?: string;
    mesDas?: string;
    dataPagamentoDas?: string;
    mesSimples?: string;
    dataPagamentoSimples?: string;
  }>;
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
          Ainda não configuramos o regime tributário dessa organização (MEI, Simples Nacional, Lucro
          Presumido ou Lucro Real). Configure em{" "}
          <Link href="/configuracoes" className="underline text-slate-700">
            Configurações
          </Link>{" "}
          pra liberar o checklist e os cálculos.
        </p>
      </div>
    );
  }

  const {
    ano: anoParam,
    trimestre: trimestreParam,
    mesDas,
    dataPagamentoDas,
    mesSimples,
    dataPagamentoSimples,
  } = await searchParams;
  const hoje = new Date().toISOString().slice(0, 10);
  const atual = trimestreDe(hoje);
  const ano = anoParam ? parseInt(anoParam, 10) : atual.ano;
  const trimestre = (trimestreParam ? parseInt(trimestreParam, 10) : atual.trimestre) as 1 | 2 | 3 | 4;
  const { inicio, fim } = trimestreParaDatas(ano, trimestre);

  const atividade = org.atividade_tributaria ?? "COMERCIO_INDUSTRIA";
  const usaTrimestre = org.regime_tributario === "LUCRO_PRESUMIDO" || org.regime_tributario === "LUCRO_REAL";

  const dre = usaTrimestre ? await getDRE(supabase, currentOrgId, inicio, fim) : null;

  // Receita bruta acumulada no ano-calendário (1º de jan até hoje, ou até
  // 31/dez se for um ano anterior) — usada pra checar o limite do MEI e
  // do Simples Nacional.
  const dreAno =
    org.regime_tributario === "MEI" || org.regime_tributario === "SIMPLES_NACIONAL"
      ? await getDRE(supabase, currentOrgId, `${ano}-01-01`, ano < atual.ano ? `${ano}-12-31` : hoje)
      : null;

  // RBT12 (receita bruta dos últimos 12 meses, terminando no mês
  // selecionado) — base do cálculo da alíquota efetiva do Simples.
  const mesSimplesSelecionado = mesSimples ? parseInt(mesSimples, 10) : new Date().getUTCMonth() + 1;
  let dreRbt12: Dre | null = null;
  let dreMesSimples: Dre | null = null;
  if (org.regime_tributario === "SIMPLES_NACIONAL") {
    const { inicio: inicioMes, fim: fimMes } = mesParaDatas(ano, mesSimplesSelecionado);
    const janela = janelaDozeMeses(fimMes);
    [dreRbt12, dreMesSimples] = await Promise.all([
      getDRE(supabase, currentOrgId, janela.inicio, janela.fim),
      getDRE(supabase, currentOrgId, inicioMes, fimMes),
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Obrigações Fiscais</h1>
        <p className="text-sm text-slate-500 mt-1">
          Regime: <span className="font-medium text-slate-700">{NOME_REGIME[org.regime_tributario]}</span>
          {org.regime_tributario === "SIMPLES_NACIONAL" && org.anexo_simples && (
            <>
              {" "}
              · <span className="font-medium text-slate-700">{NOME_ANEXO_SIMPLES[org.anexo_simples as AnexoSimples]}</span>
            </>
          )}
          {org.atividade_tributaria && usaTrimestre && (
            <>
              {" "}
              · Atividade: <span className="font-medium text-slate-700">{NOME_ATIVIDADE[atividade]}</span>
            </>
          )}
          {org.regime_tributario === "MEI" && (
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

      {org.regime_tributario === "MEI" && (
        <MEIView
          atividade={atividade}
          currency={currency}
          ano={ano}
          receitaBrutaAno={dreAno?.receitaBruta ?? 0}
          dataAberturaAtividade={org.data_abertura_atividade}
          mesDas={mesDas}
          dataPagamentoDas={dataPagamentoDas}
        />
      )}

      {org.regime_tributario === "SIMPLES_NACIONAL" && (
        <SimplesNacionalView
          anexo={(org.anexo_simples as AnexoSimples) ?? "I"}
          currency={currency}
          ano={ano}
          mes={mesSimplesSelecionado}
          rbt12={dreRbt12?.receitaBruta ?? 0}
          receitaBrutaMes={dreMesSimples?.receitaBruta ?? 0}
          receitaBrutaAno={dreAno?.receitaBruta ?? 0}
          dataAberturaAtividade={org.data_abertura_atividade}
          dataPagamentoSimples={dataPagamentoSimples}
        />
      )}

      {usaTrimestre && (
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

const STATUS_LIMITE_LABEL: Record<string, { texto: string; cor: string }> = {
  DENTRO_DO_LIMITE: { texto: "Dentro do limite", cor: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  PROXIMO_DO_LIMITE: { texto: "Próximo do limite (90%+)", cor: "text-amber-700 bg-amber-50 border-amber-200" },
  EXCEDIDO_ATE_20_POR_CENTO: { texto: "Limite ultrapassado (até 20%)", cor: "text-orange-700 bg-orange-50 border-orange-200" },
  EXCEDIDO_ACIMA_DE_20_POR_CENTO: {
    texto: "Limite ultrapassado em mais de 20%",
    cor: "text-red-700 bg-red-50 border-red-200",
  },
};

function MEIView({
  atividade,
  currency,
  ano,
  receitaBrutaAno,
  dataAberturaAtividade,
  mesDas,
  dataPagamentoDas,
}: {
  atividade: string;
  currency: string;
  ano: number;
  receitaBrutaAno: number;
  dataAberturaAtividade: string | null;
  mesDas?: string;
  dataPagamentoDas?: string;
}) {
  const calc = calcularMEI(atividade as Parameters<typeof calcularMEI>[0]);
  const limite = calcularLimiteMEI({ ano, receitaBrutaAno, dataAberturaAtividade });
  const statusInfo = STATUS_LIMITE_LABEL[limite.status];

  const mesSelecionado = mesDas ? parseInt(mesDas, 10) : new Date().getUTCMonth() + 1;
  const vencimento = vencimentoDAS(ano, mesSelecionado);
  const atraso = calcularAtrasoDAS({
    vencimento,
    dataPagamento: dataPagamentoDas || undefined,
    valorOriginal: calc.dasValor,
  });

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">DAS mensal</h2>
        <LinhaImposto label="Valor fixo do DAS-MEI (2026)" valor={calc.dasValor} currency={currency} />
        <p className="text-xs text-slate-400 mt-2">
          O DAS do MEI é um valor fixo (não depende da receita do mês) — inclui INSS e, conforme a
          atividade, ICMS e/ou ISS. Vence todo dia 20.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Limite anual de faturamento — {ano}</h2>
        <LinhaImposto label="Receita bruta acumulada no ano" valor={limite.receitaBrutaAno} currency={currency} />
        <LinhaImposto
          label={
            limite.mesesDeAtividade < 12
              ? `Limite proporcional (${limite.mesesDeAtividade} meses de atividade)`
              : "Limite anual (R$ 81.000)"
          }
          valor={limite.limiteProporcional}
          currency={currency}
        />
        <div className={`mt-2 rounded-md border px-3 py-2 text-xs font-medium ${statusInfo.cor}`}>
          {statusInfo.texto} — {(limite.percentualUtilizado * 100).toFixed(1)}% do limite utilizado
        </div>

        {limite.status === "EXCEDIDO_ATE_20_POR_CENTO" && (
          <p className="text-xs text-orange-700 mt-2">
            Você ultrapassou o limite, mas em até 20% — não há desenquadramento, só é devido um DAS
            complementar de 20% (INSS) sobre o excedente, pago via PGMEI em janeiro do ano seguinte.
            Excedente: {fmtMoney(limite.excedente, currency)} · DAS complementar estimado:{" "}
            <strong>{fmtMoney(limite.dasComplementarEstimado, currency)}</strong>.
          </p>
        )}

        {limite.status === "EXCEDIDO_ACIMA_DE_20_POR_CENTO" && (
          <p className="text-xs text-red-700 mt-2">
            Você ultrapassou o limite em mais de 20% — isso gera desenquadramento retroativo do MEI a
            1º de janeiro de {ano}. A partir dessa data, os tributos de todo o ano precisam ser
            recalculados como Microempresa (Simples Nacional), com direito a descontar os DAS-MEI já
            pagos. Esse recálculo não é feito automaticamente aqui — procure um contador pra regularizar
            a situação o quanto antes.
          </p>
        )}

        {limite.status === "PROXIMO_DO_LIMITE" && (
          <p className="text-xs text-amber-700 mt-2">
            Você já usou 90% ou mais do limite anual — fique de olho pra não ultrapassar sem perceber.
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Verificar atraso no pagamento do DAS</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="ano" value={ano} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mês de referência</label>
            <select name="mesDas" defaultValue={mesSelecionado} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, "0")}/{ano} (vence {vencimentoDAS(ano, m)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Data do pagamento</label>
            <input
              type="date"
              name="dataPagamentoDas"
              defaultValue={dataPagamentoDas || ""}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
            Calcular
          </button>
        </form>

        <div className="mt-3">
          <LinhaImposto label="Valor original do DAS" valor={atraso.valorOriginal} currency={currency} />
          {atraso.diasAtraso > 0 ? (
            <>
              <LinhaImposto label={`Multa (0,33%/dia × ${atraso.diasAtraso} dias, até 20%)`} valor={atraso.multa} currency={currency} />
              <LinhaImposto label="Juros (estimativa ~Selic)" valor={atraso.juros} currency={currency} />
              <div className="pt-2 mt-1 border-t border-slate-200 flex items-center justify-between font-semibold">
                <span className="text-slate-700">Total estimado com encargos</span>
                <span className="font-mono text-slate-900">{fmtMoney(atraso.valorComEncargos, currency)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                A multa (0,33% ao dia, limitada a 20%) é exata. Os juros aqui usam uma aproximação de
                ~1% ao mês pró-rata — o valor real usa a taxa Selic acumulada do período e só sai certo
                ao reemitir a guia em atraso pelo app PGMEI ou pelo portal do Simples Nacional.
              </p>
            </>
          ) : (
            <p className="text-xs text-emerald-700 mt-2">
              Sem atraso: pagamento na data (ou antes do) vencimento de {atraso.vencimento}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SimplesNacionalView({
  anexo,
  currency,
  ano,
  mes,
  rbt12,
  receitaBrutaMes,
  receitaBrutaAno,
  dataAberturaAtividade,
  dataPagamentoSimples,
}: {
  anexo: AnexoSimples;
  currency: string;
  ano: number;
  mes: number;
  rbt12: number;
  receitaBrutaMes: number;
  receitaBrutaAno: number;
  dataAberturaAtividade: string | null;
  dataPagamentoSimples?: string;
}) {
  const calc = calcularSimplesNacional({ anexo, rbt12, receitaBrutaMes });
  const limite = calcularLimiteSimples({ ano, receitaBrutaAno, dataAberturaAtividade });
  const statusInfo = STATUS_LIMITE_LABEL[limite.status];

  const vencimento = vencimentoDAS(ano, mes);
  const atraso = calcularAtrasoDAS({
    vencimento,
    dataPagamento: dataPagamentoSimples || undefined,
    valorOriginal: calc.dasEstimado,
  });

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">DAS do mês</h2>
        <form method="get" className="flex flex-wrap items-end gap-3 mb-3">
          <input type="hidden" name="ano" value={ano} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mês de referência</label>
            <select name="mesSimples" defaultValue={mes} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, "0")}/{ano}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
            Calcular
          </button>
        </form>
        <LinhaImposto label="Receita bruta do mês" valor={calc.receitaBrutaMes} currency={currency} />
        <LinhaImposto label="RBT12 (receita bruta últimos 12 meses)" valor={calc.rbt12} currency={currency} />
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-sm">
          <span className="text-slate-600">Alíquota nominal da faixa</span>
          <span className="font-mono text-slate-900">{(calc.aliquotaNominal * 100).toFixed(2)}%</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-sm">
          <span className="text-slate-600">Parcela a deduzir</span>
          <span className="font-mono text-slate-900">{fmtMoney(calc.parcelaDeduzir, currency)}</span>
        </div>
        <div className="flex items-center justify-between py-1.5 border-b border-slate-100 text-sm">
          <span className="text-slate-600">Alíquota efetiva</span>
          <span className="font-mono text-slate-900">{(calc.aliquotaEfetiva * 100).toFixed(3)}%</span>
        </div>
        <div className="pt-2 mt-1 flex items-center justify-between font-semibold">
          <span className="text-slate-700">DAS estimado do mês</span>
          <span className="font-mono text-slate-900">{fmtMoney(calc.dasEstimado, currency)}</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          O DAS do Simples é uma guia única que já reúne IRPJ, CSLL, PIS, COFINS, CPP e ICMS/ISS,
          calculada pela alíquota efetiva da sua faixa de RBT12 no {NOME_ANEXO_SIMPLES[anexo]}. Vence
          todo dia 20 do mês seguinte.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Limite anual de faturamento — {ano}</h2>
        <LinhaImposto label="Receita bruta acumulada no ano" valor={limite.receitaBrutaAno} currency={currency} />
        <LinhaImposto
          label={
            limite.mesesDeAtividade < 12
              ? `Limite proporcional (${limite.mesesDeAtividade} meses de atividade)`
              : "Limite anual (R$ 4.800.000)"
          }
          valor={limite.limiteProporcional}
          currency={currency}
        />
        <div className={`mt-2 rounded-md border px-3 py-2 text-xs font-medium ${statusInfo.cor}`}>
          {statusInfo.texto} — {(limite.percentualUtilizado * 100).toFixed(1)}% do limite utilizado
        </div>

        {limite.status === "EXCEDIDO_ATE_20_POR_CENTO" && (
          <p className="text-xs text-orange-700 mt-2">
            Você ultrapassou o limite, mas em até 20% — isso não tira a empresa do Simples ainda este
            ano: sobre o excedente incide a alíquota máxima do {NOME_ANEXO_SIMPLES[anexo]} acrescida de
            20 pontos percentuais (só sobre o valor que passou do limite). A exclusão do Simples passa a
            valer a partir de 1º de janeiro do ano seguinte. Excedente: {fmtMoney(limite.excedente, currency)}.
          </p>
        )}

        {limite.status === "EXCEDIDO_ACIMA_DE_20_POR_CENTO" && (
          <p className="text-xs text-red-700 mt-2">
            Você ultrapassou o limite em mais de 20% — isso gera exclusão retroativa do Simples Nacional
            a partir de 1º de janeiro de {ano} (efeito imediato, não só no ano seguinte). Os tributos do
            ano precisam ser recalculados pelo regime que a empresa passaria a seguir (normalmente Lucro
            Presumido). Procure um contador pra regularizar a situação o quanto antes.
          </p>
        )}

        {limite.status === "PROXIMO_DO_LIMITE" && (
          <p className="text-xs text-amber-700 mt-2">
            Você já usou 90% ou mais do limite anual — fique de olho pra não ultrapassar sem perceber.
          </p>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 max-w-md">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">Verificar atraso no pagamento do DAS</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="ano" value={ano} />
          <input type="hidden" name="mesSimples" value={mes} />
          <div>
            <label className="block text-xs text-slate-500 mb-1">Data do pagamento</label>
            <input
              type="date"
              name="dataPagamentoSimples"
              defaultValue={dataPagamentoSimples || ""}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
          <button type="submit" className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-1.5 hover:bg-slate-800">
            Calcular
          </button>
        </form>

        <div className="mt-3">
          <LinhaImposto label="Valor original do DAS (do mês selecionado acima)" valor={atraso.valorOriginal} currency={currency} />
          {atraso.diasAtraso > 0 ? (
            <>
              <LinhaImposto label={`Multa (0,33%/dia × ${atraso.diasAtraso} dias, até 20%)`} valor={atraso.multa} currency={currency} />
              <LinhaImposto label="Juros (estimativa ~Selic)" valor={atraso.juros} currency={currency} />
              <div className="pt-2 mt-1 border-t border-slate-200 flex items-center justify-between font-semibold">
                <span className="text-slate-700">Total estimado com encargos</span>
                <span className="font-mono text-slate-900">{fmtMoney(atraso.valorComEncargos, currency)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                A multa (0,33% ao dia, limitada a 20%) é exata. Os juros aqui usam uma aproximação de
                ~1% ao mês pró-rata — o valor real usa a taxa Selic acumulada do período e só sai certo
                ao reemitir a guia em atraso pelo PGDAS-D.
              </p>
            </>
          ) : (
            <p className="text-xs text-emerald-700 mt-2">
              Sem atraso: pagamento na data (ou antes do) vencimento de {atraso.vencimento}.
            </p>
          )}
        </div>
      </div>
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
  const declaracaoAnualSimples = { label: "DEFIS — Declaração de Informações Socioeconômicas e Fiscais", prazo: "até 31 de março (ano seguinte)" };
  const itensComuns = [
    { label: "DASN-SIMEI / declaração anual do Simples Nacional", prazo: "até 31 de maio (ano seguinte)" },
  ];

  let itens;
  if (regime === "MEI") {
    itens = [
      { label: "Pagamento do DAS-MEI", prazo: "todo dia 20" },
      { label: "Relatório Mensal de Receitas Brutas", prazo: "preencher todo mês e guardar por 5 anos" },
      ...itensComuns,
    ];
  } else if (regime === "SIMPLES_NACIONAL") {
    itens = [
      { label: "Pagamento do DAS", prazo: "todo dia 20 do mês seguinte" },
      { label: "PGDAS-D — apuração mensal", prazo: "até dia 20 do mês seguinte, junto com o DAS" },
      declaracaoAnualSimples,
      { label: "Emissão de nota fiscal", prazo: "obrigatória para vendas/serviços a pessoa jurídica" },
    ];
  } else {
    itens = [
      { label: "IRPJ e CSLL (trimestral)", prazo: "até o último dia útil do mês seguinte ao trimestre" },
      { label: "PIS e COFINS", prazo: "até o dia 25 do mês seguinte" },
      { label: "ISS (se prestar serviços)", prazo: "conforme calendário do seu município" },
      { label: "Emissão de nota fiscal", prazo: "obrigatória para vendas/serviços a pessoa jurídica" },
    ];
  }

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
