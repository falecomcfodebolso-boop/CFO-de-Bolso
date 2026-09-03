export type Ativo = {
  id: string;
  nome: string;
  custodiante: string | null;
  tipo: string;
  valor_atual: number;
  taxa_cupom: number | null;
  data_vencimento: string | null;
  rating: string | null;
  conta_code?: string | null;
  grupo_emissor?: string | null;
  pais_risco?: string | null;
  estrutura?: string | null;
  moeda?: string | null;
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

export function topNConcentracao(ativos: Ativo[], n: number) {
  const total = totalCarteira(ativos);
  return [...ativos]
    .sort((a, b) => Number(b.valor_atual) - Number(a.valor_atual))
    .slice(0, n)
    .map((a) => ({ nome: a.nome, valor: Number(a.valor_atual), pct: total ? Number(a.valor_atual) / total : 0 }));
}

/** @deprecated use topNConcentracao(ativos, 5) */
export function top5Concentracao(ativos: Ativo[]) {
  return topNConcentracao(ativos, 5);
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


const FAIXAS_VENCIMENTO = [
  { label: "< 2 anos", min: 0, max: 2 },
  { label: "2-5 anos", min: 2, max: 5 },
  { label: "5-10 anos", min: 5, max: 10 },
  { label: "> 10 anos", min: 10, max: Infinity },
] as const;

/** Distribui os ativos com vencimento por faixa de prazo (anos), à parte os sem vencimento (fundos). */
export function distribuicaoPorVencimento(ativos: Ativo[], hoje: Date = new Date()) {
  const total = totalCarteira(ativos);
  const buckets = FAIXAS_VENCIMENTO.map((f) => ({ label: f.label, valor: 0 }));
  let semVencimento = 0;

  for (const a of ativos) {
    const valor = Number(a.valor_atual);
    if (!a.data_vencimento) {
      semVencimento += valor;
      continue;
    }
    const dias = diasParaVencimento(a.data_vencimento, hoje);
    const anos = dias / 365;
    const faixa = FAIXAS_VENCIMENTO.findIndex((f) => anos >= f.min && anos < f.max);
    if (faixa >= 0) buckets[faixa].valor += valor;
    else semVencimento += valor;
  }

  const linhas = [...buckets, { label: "Sem vencimento (fundos)", valor: semVencimento }];
  return linhas.map((l) => ({ ...l, pct: total ? l.valor / total : 0 }));
}

/** Prazo médio ponderado até o vencimento, em anos (proxy simplificado de duration). */
export function prazoMedioPonderado(ativos: Ativo[], hoje: Date = new Date()) {
  const comVencimento = ativos.filter((a) => a.data_vencimento);
  const total = comVencimento.reduce((acc, a) => acc + Number(a.valor_atual), 0);
  if (total === 0) return 0;
  return (
    comVencimento.reduce((acc, a) => {
      const anos = diasParaVencimento(a.data_vencimento!, hoje) / 365;
      return acc + Number(a.valor_atual) * anos;
    }, 0) / total
  );
}

/** Agrupa por grupo_emissor (setor/tipo de emissor) cadastrado em cada Ativo. */
export function distribuicaoPorGrupoEmissor(ativos: Ativo[]) {
  const total = totalCarteira(ativos);
  const map = new Map<string, number>();
  for (const a of ativos) {
    const key = a.grupo_emissor || "Não classificado";
    map.set(key, (map.get(key) ?? 0) + Number(a.valor_atual));
  }
  return [...map.entries()]
    .map(([grupo, valor]) => ({ grupo, valor, pct: total ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Exposição total a uma estrutura específica (ex: "CLN"). */
export function exposicaoEstrutura(ativos: Ativo[], estrutura: string) {
  const total = totalCarteira(ativos);
  const valor = ativos.filter((a) => a.estrutura === estrutura).reduce((acc, a) => acc + Number(a.valor_atual), 0);
  return { valor, pct: total ? valor / total : 0 };
}

/** Exposição a um país de risco específico (ex: "Brasil"). */
export function exposicaoPais(ativos: Ativo[], pais: string) {
  const total = totalCarteira(ativos);
  const valor = ativos.filter((a) => a.pais_risco === pais).reduce((acc, a) => acc + Number(a.valor_atual), 0);
  return { valor, pct: total ? valor / total : 0 };
}
