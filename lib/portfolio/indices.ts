export type Ativo = {
  id: string;
  nome: string;
  custodiante: string | null;
  tipo: string;
  valor_atual: number;
  taxa_cupom: number | null;
  data_vencimento: string | null;
  rating: string | null;
};

export function totalCarteira(ativos: Ativo[]) {
  return ativos.reduce((acc, a) => acc + Number(a.valor_atual), 0);
}

/** Índice de Herfindahl-Hirschman (0 a 10.000) — quanto maior, mais concentrada a carteira. */
export function hhi(ativos: Ativo[]) {
  const total = totalCarteira(ativos);
  if (total === 0) return 0;
  return ativos.reduce((acc, a) => {
    const share = (Number(a.valor_atual) / total) * 100;
    return acc + share * share;
  }, 0);
}

export function concentracaoPorCustodiante(ativos: Ativo[]) {
  const total = totalCarteira(ativos);
  const map = new Map<string, number>();
  for (const a of ativos) {
    const key = a.custodiante || "Não informado";
    map.set(key, (map.get(key) ?? 0) + Number(a.valor_atual));
  }
  return [...map.entries()]
    .map(([custodiante, valor]) => ({ custodiante, valor, pct: total ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function top5Concentracao(ativos: Ativo[]) {
  const total = totalCarteira(ativos);
  return [...ativos]
    .sort((a, b) => Number(b.valor_atual) - Number(a.valor_atual))
    .slice(0, 5)
    .map((a) => ({ nome: a.nome, valor: Number(a.valor_atual), pct: total ? Number(a.valor_atual) / total : 0 }));
}

export function taxaMediaPonderada(ativos: Ativo[]) {
  const comTaxa = ativos.filter((a) => a.taxa_cupom != null);
  const total = comTaxa.reduce((acc, a) => acc + Number(a.valor_atual), 0);
  if (total === 0) return 0;
  return comTaxa.reduce((acc, a) => acc + Number(a.valor_atual) * Number(a.taxa_cupom), 0) / total;
}

export function diasParaVencimento(dataVencimento: string, hoje: Date = new Date()) {
  const venc = new Date(dataVencimento);
  return Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Custo de capital estimado (K) por método "build-up": taxa livre de risco
 * + spread de crédito + prêmio de risco-país, ponderado pela exposição
 * declarada. É uma ESTIMATIVA para referência de alocação, não uma taxa
 * de mercado cotada — sempre exibir com a ressalva na tela.
 */
export function estimarCustoDeCapital(params: {
  taxaLivreDeRisco: number;
  spreadCredito: number;
  premioPaisPonderado: number;
  premioComplexidadePonderado: number;
}) {
  const { taxaLivreDeRisco, spreadCredito, premioPaisPonderado, premioComplexidadePonderado } = params;
  return taxaLivreDeRisco + spreadCredito + premioPaisPonderado + premioComplexidadePonderado;
}

export function classificarConcentracao(hhiValue: number) {
  if (hhiValue < 1500) return { label: "Baixa concentração", tone: "text-emerald-600" };
  if (hhiValue < 2500) return { label: "Concentração moderada", tone: "text-amber-600" };
  return { label: "Alta concentração", tone: "text-red-600" };
}
