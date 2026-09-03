// =====================================================================
// Análise vertical (AV) e horizontal (AH) das demonstrações financeiras.
//
// AV: cada linha como % de uma base da própria demonstração (ex: Ativo
//     Total no Balanço, Receita Líquida na DRE) — mostra o peso relativo
//     de cada conta/grupo no total.
// AH: variação (absoluta e %) de cada linha entre o período atual e um
//     período de comparação — mostra a evolução no tempo.
// =====================================================================

export type LinhaAnalise = {
  key?: string;
  label: string;
  valor: number;
  valorAnterior?: number | null;
  indent?: boolean;
  subtotal?: boolean;
  destaque?: boolean;
  /** Pula a coluna de AV nessa linha (ex: linha de resultado que já é a soma de outras). */
  semAV?: boolean;
};

/** % de `valor` sobre `base`. Retorna null se a base for zero (divisão indefinida). */
export function calcAV(valor: number, base: number): number | null {
  if (!base) return null;
  return valor / base;
}

export type Variacao = { absoluta: number; pct: number | null };

/**
 * Variação entre o valor atual e o anterior. `pct` é null quando o valor
 * anterior é zero (ou não existe) — nesse caso a variação percentual não
 * é matematicamente definida ("de zero para qualquer valor" não é uma
 * porcentagem válida), então a UI deve mostrar "n/d" em vez de um número.
 */
export function calcVariacao(valor: number, valorAnterior: number | null | undefined): Variacao | null {
  if (valorAnterior == null) return null;
  const absoluta = valor - valorAnterior;
  const pct = valorAnterior !== 0 ? absoluta / Math.abs(valorAnterior) : null;
  return { absoluta, pct };
}

/** Período imediatamente anterior, com a mesma duração (em dias) do período [inicio, fim] informado. */
export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const dInicio = new Date(`${inicio}T00:00:00Z`);
  const dFim = new Date(`${fim}T00:00:00Z`);
  const duracaoDias = Math.round((dFim.getTime() - dInicio.getTime()) / 86_400_000) + 1;

  const novoFim = new Date(dInicio.getTime() - 86_400_000);
  const novoInicio = new Date(novoFim.getTime() - (duracaoDias - 1) * 86_400_000);

  return { inicio: novoInicio.toISOString().slice(0, 10), fim: novoFim.toISOString().slice(0, 10) };
}

/** Data de comparação padrão para o Balanço (que é uma posição pontual, não um período): 1 ano antes. */
export function dataComparacaoPadrao(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
