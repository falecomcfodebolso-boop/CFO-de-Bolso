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
