export type Divida = {
  id: string;
  nome: string;
  credor: string | null;
  tipo: string;
  indexador: string;
  valor_original: number | null;
  valor_atual: number;
  taxa_juros: number | null;
  data_contratacao: string | null;
  data_vencimento: string | null;
};

export function totalDividas(dividas: Divida[]) {
  return dividas.reduce((acc, d) => acc + Number(d.valor_atual), 0);
}

/** Índice de Herfindahl-Hirschman (0 a 10.000) — quanto maior, mais concentrada a dívida num único credor. */
export function hhiDividas(dividas: Divida[]) {
  const total = totalDividas(dividas);
  if (total === 0) return 0;
  return dividas.reduce((acc, d) => {
    const share = (Number(d.valor_atual) / total) * 100;
    return acc + share * share;
  }, 0);
}

export function concentracaoPorCredor(dividas: Divida[]) {
  const total = totalDividas(dividas);
  const map = new Map<string, number>();
  for (const d of dividas) {
    const key = d.credor || "Não informado";
    map.set(key, (map.get(key) ?? 0) + Number(d.valor_atual));
  }
  return [...map.entries()]
    .map(([credor, valor]) => ({ credor, valor, pct: total ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function concentracaoPorTipo(dividas: Divida[]) {
  const total = totalDividas(dividas);
  const map = new Map<string, number>();
  for (const d of dividas) {
    map.set(d.tipo, (map.get(d.tipo) ?? 0) + Number(d.valor_atual));
  }
  return [...map.entries()]
    .map(([tipo, valor]) => ({ tipo, valor, pct: total ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export function top5Dividas(dividas: Divida[]) {
  const total = totalDividas(dividas);
  return [...dividas]
    .sort((a, b) => Number(b.valor_atual) - Number(a.valor_atual))
    .slice(0, 5)
    .map((d) => ({ nome: d.nome, valor: Number(d.valor_atual), pct: total ? Number(d.valor_atual) / total : 0 }));
}

export function taxaMediaPonderadaDividas(dividas: Divida[]) {
  const comTaxa = dividas.filter((d) => d.taxa_juros != null);
  const total = comTaxa.reduce((acc, d) => acc + Number(d.valor_atual), 0);
  if (total === 0) return 0;
  return comTaxa.reduce((acc, d) => acc + Number(d.valor_atual) * Number(d.taxa_juros), 0) / total;
}

/** Prazo médio ponderado até o vencimento, em dias — uma "duration" simplificada (não desconta fluxos). */
export function prazoMedioPonderadoDias(dividas: Divida[], hoje: Date = new Date()) {
  const comVencimento = dividas.filter((d) => d.data_vencimento);
  const total = comVencimento.reduce((acc, d) => acc + Number(d.valor_atual), 0);
  if (total === 0) return 0;
  return (
    comVencimento.reduce((acc, d) => {
      const dias = Math.max(0, Math.round((new Date(d.data_vencimento as string).getTime() - hoje.getTime()) / 86_400_000));
      return acc + Number(d.valor_atual) * dias;
    }, 0) / total
  );
}
