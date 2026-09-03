/**
 * Cálculo interno de juros acruados por ativo (regime de competência,
 * convenção 30/360 US/NASD Bond Basis), replicando a metodologia
 * documentada pela usuária em sua planilha de controle ("Juros Acruados").
 *
 * Este cálculo serve apenas como referência/comparação: o valor que
 * efetivamente entra na contabilidade é sempre o do extrato do
 * banco/custodiante na data-base (ver app/(app)/ajustes).
 */

export type CategoriaAcruo = "periodico" | "continuo" | "mercado" | "defaulted" | "desconto" | "vencido";
export type TipoTaxa = "fixa" | "flutuante";

export type AtivoAcruo = {
  id: string;
  nome: string;
  valor_face: number | null;
  taxa_cupom: number | null;
  categoria_acruo: CategoriaAcruo | null;
  tipo_taxa: TipoTaxa | null;
  spread_taxa: number | null;
  taxa_referencia_atual: number | null;
  indice_referencia: string | null;
  data_pagamento_anterior: string | null; // ISO yyyy-mm-dd
  data_inicio_acruo: string | null; // ISO yyyy-mm-dd
  pendente_custodiante: boolean | null;
  conta_acruo_code: string | null;
  conta_receita_code: string | null;
  grupo_acruo_nome: string | null;
};

function parseISO(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

/**
 * Dias corridos entre duas datas pela convenção 30/360 (US/NASD Bond
 * Basis): dia 31 é tratado como 30 (com o ajuste padrão de que, se o dia
 * inicial já virou 30, o dia final 31 também vira 30).
 */
export function dias360(dataInicioISO: string, dataFimISO: string): number {
  const ini = parseISO(dataInicioISO);
  const fim = parseISO(dataFimISO);
  let d1 = ini.day;
  let d2 = fim.day;
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return (fim.y - ini.y) * 360 + (fim.m - ini.m) * 30 + (d2 - d1);
}

export type ResultadoAcruo = {
  dias: number | null;
  valor: number | null; // null = não calculável internamente (ex: categoria "continuo")
  taxaEfetiva: number | null;
};

/** Calcula o juros acruado interno de um ativo até `dataBaseISO`. */
export function calcularAcruoInterno(ativo: AtivoAcruo, dataBaseISO: string): ResultadoAcruo {
  const categoria = ativo.categoria_acruo;

  if (categoria === "mercado" || categoria === "defaulted" || categoria === "desconto" || categoria === "vencido") {
    return { dias: null, valor: 0, taxaEfetiva: null };
  }

  if (categoria === "continuo") {
    // Sem cronograma de cupom periódico — não há um cálculo interno
    // independente confiável; o valor reconhecido é sempre o do extrato.
    return { dias: null, valor: null, taxaEfetiva: null };
  }

  if (categoria === "periodico") {
    const dataBaseCalc = ativo.data_pagamento_anterior;
    if (!dataBaseCalc || !ativo.valor_face) return { dias: null, valor: null, taxaEfetiva: null };
    const taxaEfetiva =
      ativo.tipo_taxa === "flutuante"
        ? (ativo.taxa_referencia_atual ?? 0) + (ativo.spread_taxa ?? 0)
        : ativo.taxa_cupom ?? 0;
    const dias = dias360(dataBaseCalc, dataBaseISO);
    if (dias <= 0) return { dias, valor: 0, taxaEfetiva };
    const valor = ativo.valor_face * taxaEfetiva * (dias / 360);
    return { dias, valor, taxaEfetiva };
  }

  return { dias: null, valor: null, taxaEfetiva: null };
}

export const CATEGORIA_ACRUO_LABEL: Record<CategoriaAcruo, string> = {
  periodico: "Cronograma periódico",
  continuo: "Contínuo (sem cronograma) — usa valor do extrato",
  mercado: "Marcado a mercado — sem acruo",
  defaulted: "Em default — sem acruo",
  desconto: "Discount note — sem acruo tradicional",
  vencido: "Vencido/encerrado — sem acruo",
};

/** Agrupa ativos pelo rótulo grupo_acruo_nome (contas de acruo compartilhadas). */
export function agruparPorAcruo(ativos: AtivoAcruo[]): Map<string, AtivoAcruo[]> {
  const grupos = new Map<string, AtivoAcruo[]>();
  for (const a of ativos) {
    if (!a.grupo_acruo_nome || !a.conta_acruo_code) continue;
    const key = a.grupo_acruo_nome;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(a);
  }
  return grupos;
}
