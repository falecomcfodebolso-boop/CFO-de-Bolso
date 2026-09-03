import type { AtividadeTributaria } from "@/lib/org";

// =====================================================================
// Cálculos fiscais simplificados por regime tributário (MEI, Lucro
// Presumido, Lucro Real) — Brasil, valores 2026.
//
// IMPORTANTE: são estimativas baseadas nas regras gerais (alíquotas e
// percentuais de presunção padrão da Receita Federal). Não substituem a
// apuração de um contador: não consideram particularidades do CNAE,
// benefícios fiscais, créditos de PIS/COFINS no regime não-cumulativo,
// adições/exclusões da base do Lucro Real, nem legislação municipal
// específica de ISS além da alíquota informada pelo usuário.
// =====================================================================

export const DAS_MEI_2026: Record<AtividadeTributaria, number> = {
  COMERCIO_INDUSTRIA: 82.05, // INSS 81,05 + ICMS 1,00
  SERVICOS: 86.05, // INSS 81,05 + ISS 5,00
  COMERCIO_E_SERVICOS: 87.05, // INSS 81,05 + ICMS 1,00 + ISS 5,00
  TRANSPORTE_CARGA: 82.05, // tratado como comércio/indústria pra fins de DAS
};

export const PRESUNCAO_LUCRO_PRESUMIDO: Record<AtividadeTributaria, { irpj: number; csll: number }> = {
  COMERCIO_INDUSTRIA: { irpj: 0.08, csll: 0.12 },
  SERVICOS: { irpj: 0.32, csll: 0.32 },
  COMERCIO_E_SERVICOS: { irpj: 0.08, csll: 0.12 }, // presumido não usa essa combinação; tratado como comércio
  TRANSPORTE_CARGA: { irpj: 0.08, csll: 0.12 },
};

const IRPJ_ALIQUOTA = 0.15;
const IRPJ_ADICIONAL_ALIQUOTA = 0.1;
const IRPJ_ADICIONAL_LIMITE_TRIMESTRE = 60_000; // R$ 20.000/mês × 3
const CSLL_ALIQUOTA = 0.09;
const PIS_COFINS_CUMULATIVO = 0.0065 + 0.03; // Lucro Presumido
const PIS_COFINS_NAO_CUMULATIVO = 0.0165 + 0.076; // Lucro Real (estimativa bruta, sem créditos)

function calcularIrpjComAdicional(baseCalculo: number) {
  if (baseCalculo <= 0) return 0;
  const excedente = Math.max(0, baseCalculo - IRPJ_ADICIONAL_LIMITE_TRIMESTRE);
  return baseCalculo * IRPJ_ALIQUOTA + excedente * IRPJ_ADICIONAL_ALIQUOTA;
}

export type CalculoMEI = {
  regime: "MEI";
  dasValor: number;
  atividade: AtividadeTributaria;
};

export function calcularMEI(atividade: AtividadeTributaria): CalculoMEI {
  return { regime: "MEI", dasValor: DAS_MEI_2026[atividade], atividade };
}

// ---------------------------------------------------------------------
// Situações especiais do MEI
// ---------------------------------------------------------------------

/** Limite anual de receita bruta do MEI (2026), pra atividade exercida o ano inteiro. */
export const LIMITE_MEI_ANUAL = 81_000;

/**
 * Acima de 20% do limite anual, o desenquadramento do MEI é retroativo a
 * 1º de janeiro do ano-calendário (não apenas dali em diante) — a partir
 * daí, os tributos de todo o ano devem ser recalculados como Microempresa
 * (Simples Nacional), descontando o que já foi pago via DAS-MEI.
 */
export const FATOR_DESENQUADRAMENTO_RETROATIVO = 1.2;

export type StatusLimiteMEI =
  | "DENTRO_DO_LIMITE"
  | "PROXIMO_DO_LIMITE"
  | "EXCEDIDO_ATE_20_POR_CENTO"
  | "EXCEDIDO_ACIMA_DE_20_POR_CENTO";

export type CalculoLimiteMEI = {
  ano: number;
  receitaBrutaAno: number;
  mesesDeAtividade: number;
  limiteProporcional: number;
  percentualUtilizado: number;
  excedente: number;
  status: StatusLimiteMEI;
  /** 20% (INSS) sobre o excedente — pago como DAS complementar via PGMEI, em janeiro do ano seguinte. */
  dasComplementarEstimado: number;
};

/** Quantos meses, dentro do ano informado, a atividade esteve aberta (13 dez → 12 meses cheios). */
export function mesesDeAtividadeNoAno(ano: number, dataAberturaAtividade: string | null): number {
  if (!dataAberturaAtividade) return 12;
  const abertura = new Date(`${dataAberturaAtividade}T00:00:00Z`);
  const anoAbertura = abertura.getUTCFullYear();
  if (anoAbertura > ano) return 0;
  if (anoAbertura < ano) return 12;
  const mesAbertura = abertura.getUTCMonth(); // 0-11
  return 12 - mesAbertura;
}

export function calcularLimiteMEI(params: {
  ano: number;
  receitaBrutaAno: number;
  dataAberturaAtividade: string | null;
}): CalculoLimiteMEI {
  const { ano, dataAberturaAtividade } = params;
  const receitaBrutaAno = Math.max(0, params.receitaBrutaAno);
  const mesesDeAtividade = mesesDeAtividadeNoAno(ano, dataAberturaAtividade);
  const limiteProporcional = (LIMITE_MEI_ANUAL / 12) * mesesDeAtividade;
  const percentualUtilizado = limiteProporcional > 0 ? receitaBrutaAno / limiteProporcional : 0;
  const excedente = Math.max(0, receitaBrutaAno - limiteProporcional);

  let status: StatusLimiteMEI;
  if (receitaBrutaAno <= limiteProporcional) {
    status = percentualUtilizado >= 0.9 ? "PROXIMO_DO_LIMITE" : "DENTRO_DO_LIMITE";
  } else if (receitaBrutaAno <= limiteProporcional * FATOR_DESENQUADRAMENTO_RETROATIVO) {
    status = "EXCEDIDO_ATE_20_POR_CENTO";
  } else {
    status = "EXCEDIDO_ACIMA_DE_20_POR_CENTO";
  }

  return {
    ano,
    receitaBrutaAno,
    mesesDeAtividade,
    limiteProporcional,
    percentualUtilizado,
    excedente,
    status,
    dasComplementarEstimado: excedente * 0.2,
  };
}

/** Vencimento do DAS-MEI de um mês (sempre dia 20; se cair em não-útil, a Receita antecipa — não replicado aqui). */
export function vencimentoDAS(ano: number, mes: number): string {
  return new Date(Date.UTC(ano, mes - 1, 20)).toISOString().slice(0, 10);
}

export type CalculoAtrasoDAS = {
  vencimento: string;
  dataReferencia: string;
  diasAtraso: number;
  valorOriginal: number;
  multa: number;
  juros: number;
  valorComEncargos: number;
};

/**
 * Estimativa de multa (0,33% ao dia, limitada a 20%) e juros (aproximados
 * pela taxa Selic, aqui simplificada em ~1% ao mês pro dado não estar
 * disponível offline) sobre um DAS pago em atraso. O valor real, com a
 * Selic acumulada exata do período, só sai ao reemitir a guia em
 * atraso pelo app PGMEI/portal do Simples Nacional — use isto só como
 * estimativa pra se planejar.
 */
export function calcularAtrasoDAS(params: {
  vencimento: string;
  dataPagamento?: string;
  valorOriginal: number;
}): CalculoAtrasoDAS {
  const { vencimento, valorOriginal } = params;
  const dataReferencia = params.dataPagamento ?? new Date().toISOString().slice(0, 10);
  const dVencimento = new Date(`${vencimento}T00:00:00Z`);
  const dReferencia = new Date(`${dataReferencia}T00:00:00Z`);
  const diasAtraso = Math.max(0, Math.round((dReferencia.getTime() - dVencimento.getTime()) / (1000 * 60 * 60 * 24)));

  const multa = diasAtraso > 0 ? valorOriginal * Math.min(0.2, 0.0033 * diasAtraso) : 0;
  const SELIC_MENSAL_APROXIMADA = 0.01;
  const juros = diasAtraso > 0 ? valorOriginal * SELIC_MENSAL_APROXIMADA * (diasAtraso / 30) : 0;

  return {
    vencimento,
    dataReferencia,
    diasAtraso,
    valorOriginal,
    multa,
    juros,
    valorComEncargos: valorOriginal + multa + juros,
  };
}

export type CalculoPresumido = {
  regime: "LUCRO_PRESUMIDO";
  receitaBrutaTrimestre: number;
  baseIrpj: number;
  baseCsll: number;
  irpj: number;
  csll: number;
  pis: number;
  cofins: number;
  iss: number;
  totalTrimestre: number;
};

export function calcularLucroPresumido(params: {
  atividade: AtividadeTributaria;
  receitaBrutaTrimestre: number;
  aliquotaIss: number | null;
}): CalculoPresumido {
  const { atividade, receitaBrutaTrimestre, aliquotaIss } = params;
  const presuncao = PRESUNCAO_LUCRO_PRESUMIDO[atividade];
  const receita = Math.max(0, receitaBrutaTrimestre);

  const baseIrpj = receita * presuncao.irpj;
  const baseCsll = receita * presuncao.csll;
  const irpj = calcularIrpjComAdicional(baseIrpj);
  const csll = baseCsll * CSLL_ALIQUOTA;
  const pis = receita * 0.0065;
  const cofins = receita * 0.03;
  const ehServico = atividade === "SERVICOS" || atividade === "COMERCIO_E_SERVICOS";
  const iss = ehServico && aliquotaIss ? receita * aliquotaIss : 0;

  return {
    regime: "LUCRO_PRESUMIDO",
    receitaBrutaTrimestre: receita,
    baseIrpj,
    baseCsll,
    irpj,
    csll,
    pis,
    cofins,
    iss,
    totalTrimestre: irpj + csll + pis + cofins + iss,
  };
}

export type CalculoReal = {
  regime: "LUCRO_REAL";
  receitaBrutaTrimestre: number;
  lucroAntesImpostosTrimestre: number;
  irpj: number;
  csll: number;
  pisCofins: number;
  iss: number;
  totalTrimestre: number;
};

export function calcularLucroReal(params: {
  atividade: AtividadeTributaria;
  receitaBrutaTrimestre: number;
  lucroAntesImpostosTrimestre: number;
  aliquotaIss: number | null;
}): CalculoReal {
  const { atividade, receitaBrutaTrimestre, lucroAntesImpostosTrimestre, aliquotaIss } = params;
  const receita = Math.max(0, receitaBrutaTrimestre);
  const base = Math.max(0, lucroAntesImpostosTrimestre);

  const irpj = calcularIrpjComAdicional(base);
  const csll = base * CSLL_ALIQUOTA;
  const pisCofins = receita * PIS_COFINS_NAO_CUMULATIVO;
  const ehServico = atividade === "SERVICOS" || atividade === "COMERCIO_E_SERVICOS";
  const iss = ehServico && aliquotaIss ? receita * aliquotaIss : 0;

  return {
    regime: "LUCRO_REAL",
    receitaBrutaTrimestre: receita,
    lucroAntesImpostosTrimestre: base,
    irpj,
    csll,
    pisCofins,
    iss,
    totalTrimestre: irpj + csll + pisCofins + iss,
  };
}

/** Trimestre civil (jan-mar, abr-jun, jul-set, out-dez) que contém a data informada. */
export function trimestreDe(dataISO: string): { ano: number; trimestre: 1 | 2 | 3 | 4; inicio: string; fim: string } {
  const d = new Date(`${dataISO}T00:00:00Z`);
  const ano = d.getUTCFullYear();
  const trimestre = (Math.floor(d.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
  const mesInicio = (trimestre - 1) * 3;
  const inicio = new Date(Date.UTC(ano, mesInicio, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mesInicio + 3, 0)).toISOString().slice(0, 10);
  return { ano, trimestre, inicio, fim };
}

export function trimestreParaDatas(ano: number, trimestre: 1 | 2 | 3 | 4) {
  const mesInicio = (trimestre - 1) * 3;
  const inicio = new Date(Date.UTC(ano, mesInicio, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mesInicio + 3, 0)).toISOString().slice(0, 10);
  return { inicio, fim };
}


// ---------------------------------------------------------------------
// Simples Nacional
// ---------------------------------------------------------------------
// Tabelas dos Anexos I a V (LC 123/2006, com a redação da LC 155/2016,
// em vigor desde 2018) — não mudam de ano a ano como o limite do MEI,
// mas mantemos o sufixo _2026 por consistência com as demais tabelas
// desta tela. Alíquota efetiva = (RBT12 × alíquota nominal da faixa −
// parcela a deduzir) / RBT12. O DAS é uma guia única que já reúne
// IRPJ, CSLL, PIS, COFINS, CPP e ICMS/ISS — não abrimos essa composição
// aqui porque o percentual de cada tributo dentro do DAS varia por
// Anexo e por faixa.
export type AnexoSimples = "I" | "II" | "III" | "IV" | "V";

export type FaixaSimples = { ate: number; aliquota: number; deduzir: number };

export const TABELA_SIMPLES_2026: Record<AnexoSimples, FaixaSimples[]> = {
  I: [
    { ate: 180_000, aliquota: 0.04, deduzir: 0 },
    { ate: 360_000, aliquota: 0.073, deduzir: 5_940 },
    { ate: 720_000, aliquota: 0.095, deduzir: 13_860 },
    { ate: 1_800_000, aliquota: 0.107, deduzir: 22_500 },
    { ate: 3_600_000, aliquota: 0.143, deduzir: 87_300 },
    { ate: 4_800_000, aliquota: 0.19, deduzir: 378_000 },
  ],
  II: [
    { ate: 180_000, aliquota: 0.045, deduzir: 0 },
    { ate: 360_000, aliquota: 0.078, deduzir: 5_940 },
    { ate: 720_000, aliquota: 0.10, deduzir: 13_860 },
    { ate: 1_800_000, aliquota: 0.112, deduzir: 22_500 },
    { ate: 3_600_000, aliquota: 0.147, deduzir: 85_500 },
    { ate: 4_800_000, aliquota: 0.30, deduzir: 720_000 },
  ],
  III: [
    { ate: 180_000, aliquota: 0.06, deduzir: 0 },
    { ate: 360_000, aliquota: 0.112, deduzir: 9_360 },
    { ate: 720_000, aliquota: 0.135, deduzir: 17_640 },
    { ate: 1_800_000, aliquota: 0.16, deduzir: 35_640 },
    { ate: 3_600_000, aliquota: 0.21, deduzir: 125_640 },
    { ate: 4_800_000, aliquota: 0.33, deduzir: 648_000 },
  ],
  IV: [
    { ate: 180_000, aliquota: 0.045, deduzir: 0 },
    { ate: 360_000, aliquota: 0.09, deduzir: 8_100 },
    { ate: 720_000, aliquota: 0.102, deduzir: 12_420 },
    { ate: 1_800_000, aliquota: 0.14, deduzir: 39_780 },
    { ate: 3_600_000, aliquota: 0.22, deduzir: 183_780 },
    { ate: 4_800_000, aliquota: 0.33, deduzir: 828_000 },
  ],
  V: [
    { ate: 180_000, aliquota: 0.155, deduzir: 0 },
    { ate: 360_000, aliquota: 0.18, deduzir: 4_500 },
    { ate: 720_000, aliquota: 0.195, deduzir: 9_900 },
    { ate: 1_800_000, aliquota: 0.205, deduzir: 17_100 },
    { ate: 3_600_000, aliquota: 0.23, deduzir: 62_100 },
    { ate: 4_800_000, aliquota: 0.305, deduzir: 540_000 },
  ],
};

export const NOME_ANEXO_SIMPLES: Record<AnexoSimples, string> = {
  I: "Anexo I — Comércio",
  II: "Anexo II — Indústria",
  III: "Anexo III — Serviços (locação de bens móveis e afins)",
  IV: "Anexo IV — Serviços (construção, limpeza, vigilância, advocacia e afins — CPP recolhida fora do DAS)",
  V: "Anexo V — Serviços intelectuais/técnicos (sujeito ao Fator R)",
};

export type CalculoSimplesNacional = {
  regime: "SIMPLES_NACIONAL";
  anexo: AnexoSimples;
  rbt12: number;
  faixaIndex: number;
  aliquotaNominal: number;
  parcelaDeduzir: number;
  aliquotaEfetiva: number;
  receitaBrutaMes: number;
  dasEstimado: number;
};

export function calcularSimplesNacional(params: {
  anexo: AnexoSimples;
  rbt12: number;
  receitaBrutaMes: number;
}): CalculoSimplesNacional {
  const { anexo, receitaBrutaMes } = params;
  const rbt12 = Math.max(0, params.rbt12);
  const tabela = TABELA_SIMPLES_2026[anexo];

  let faixaIndex = tabela.findIndex((f) => rbt12 <= f.ate);
  if (faixaIndex === -1) faixaIndex = tabela.length - 1; // acima do limite: usa a última faixa como referência
  const faixa = tabela[faixaIndex];

  const aliquotaEfetiva = rbt12 > 0 ? Math.max(0, (rbt12 * faixa.aliquota - faixa.deduzir) / rbt12) : faixa.aliquota;

  return {
    regime: "SIMPLES_NACIONAL",
    anexo,
    rbt12,
    faixaIndex,
    aliquotaNominal: faixa.aliquota,
    parcelaDeduzir: faixa.deduzir,
    aliquotaEfetiva,
    receitaBrutaMes: Math.max(0, receitaBrutaMes),
    dasEstimado: Math.max(0, receitaBrutaMes) * aliquotaEfetiva,
  };
}

/** Limite anual de receita bruta do Simples Nacional (2026), pra atividade exercida o ano inteiro. */
export const LIMITE_SIMPLES_ANUAL = 4_800_000;

export type StatusLimiteSimples = "DENTRO_DO_LIMITE" | "PROXIMO_DO_LIMITE" | "EXCEDIDO_ATE_20_POR_CENTO" | "EXCEDIDO_ACIMA_DE_20_POR_CENTO";

export type CalculoLimiteSimples = {
  ano: number;
  receitaBrutaAno: number;
  mesesDeAtividade: number;
  limiteProporcional: number;
  percentualUtilizado: number;
  excedente: number;
  status: StatusLimiteSimples;
};

export function calcularLimiteSimples(params: {
  ano: number;
  receitaBrutaAno: number;
  dataAberturaAtividade: string | null;
}): CalculoLimiteSimples {
  const { ano, dataAberturaAtividade } = params;
  const receitaBrutaAno = Math.max(0, params.receitaBrutaAno);
  const mesesDeAtividade = mesesDeAtividadeNoAno(ano, dataAberturaAtividade);
  const limiteProporcional = (LIMITE_SIMPLES_ANUAL / 12) * mesesDeAtividade;
  const percentualUtilizado = limiteProporcional > 0 ? receitaBrutaAno / limiteProporcional : 0;
  const excedente = Math.max(0, receitaBrutaAno - limiteProporcional);

  let status: StatusLimiteSimples;
  if (receitaBrutaAno <= limiteProporcional) {
    status = percentualUtilizado >= 0.9 ? "PROXIMO_DO_LIMITE" : "DENTRO_DO_LIMITE";
  } else if (receitaBrutaAno <= limiteProporcional * FATOR_DESENQUADRAMENTO_RETROATIVO) {
    status = "EXCEDIDO_ATE_20_POR_CENTO";
  } else {
    status = "EXCEDIDO_ACIMA_DE_20_POR_CENTO";
  }

  return { ano, receitaBrutaAno, mesesDeAtividade, limiteProporcional, percentualUtilizado, excedente, status };
}

/** Início/fim de um mês específico (usado no cálculo mensal do DAS do Simples). */
export function mesParaDatas(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { inicio, fim };
}

/** Janela de 12 meses terminando no mês de `dataFim` (inclusive) — usada para apurar o RBT12. */
export function janelaDozeMeses(dataFim: string): { inicio: string; fim: string } {
  const d = new Date(`${dataFim}T00:00:00Z`);
  const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  return { inicio, fim };
}
