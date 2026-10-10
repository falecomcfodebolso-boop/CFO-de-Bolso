// =====================================================================
// Análise vertical (AV) e horizontal (AH) das demonstrações financeiras.
//
// AV: cada linha como % de uma base da própria demonstração (ex: Ativo
//     Total no Balanço, Receita Líquida na DRE) — mostra o peso relativo
//     de cada conta/grupo no total.
// AH: variação (absoluta e %) de cada linha entre o período atual e um
//     período de comparação — mostra a evolução no tempo.
// =====================================================================

import type { GrupoContas, GrupoDmpl } from "./demonstrativos";

export type LinhaAnalise = {
  key?: string;
  label: string;
  valor: number;
  valorAnterior?: number | null;
  indent?: boolean;
  /**
   * Nível de indentação (0 = sem indentação, 1, 2, ...) — pra demonstrações
   * com mais de um nível de hierarquia (ex: Balanço com subtotal de "conta
   * mãe" entre o total do bloco e as contas-filha). Tem prioridade sobre
   * `indent` quando os dois são passados; `indent: true` sozinho continua
   * equivalendo a `indentLevel: 1`, pra não quebrar quem já usa só `indent`.
   */
  indentLevel?: number;
  subtotal?: boolean;
  destaque?: boolean;
  /** Pula a coluna de AV nessa linha (ex: linha de resultado que já é a soma de outras). */
  semAV?: boolean;
  /** Se definido, o label vira um link (ex: Balancete/Razões linkando para o razão da conta). Ignorado nas exportações Excel/PDF, que mostram só o texto. */
  href?: string;
};

/** % de `valor` sobre `base`. Retorna null se a base for zero (divisão indefinida). */
export function calcAV(valor: number, base: number): number | null {
  if (!base) return null;
  return valor / base;
}

export type Variacao = { absoluta: number; pct: number | null };

/**
 * Variação entre o valor atual e o anterior. `pct` é null quando o valor
 * anterior é (praticamente) zero (ou não existe) — nesse caso a variação
 * percentual não é matematicamente definida ("de zero para qualquer
 * valor" não é uma porcentagem válida), então a UI deve mostrar "n/d" em
 * vez de um número.
 *
 * "Praticamente zero" (< meio centavo) e não só "=== 0" de propósito:
 * valores que deveriam ser exatamente zero (ex.: resultado de um período
 * sem nenhum lançamento de Receita/Despesa) às vezes chegam aqui com um
 * resíduo de ponto flutuante minúsculo (ex.: 1e-13) por causa de somas
 * intermediárias — invisível no valor formatado em dinheiro, mas que faz
 * `absoluta / Math.abs(valorAnterior)` virar um número astronômico em vez
 * de ficar indefinido.
 */
export function calcVariacao(valor: number, valorAnterior: number | null | undefined): Variacao | null {
  if (valorAnterior == null) return null;
  const absoluta = valor - valorAnterior;
  const pct = Math.abs(valorAnterior) >= 0.005 ? absoluta / Math.abs(valorAnterior) : null;
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

// =====================================================================
// Subtotais de "conta mãe" — usado por Balanço, DRE, DFC e DMPL para
// mostrar um subtotal intermediário entre o total do bloco/categoria e
// as contas-folha, quando o grupo (código truncado no último segmento)
// tiver mais de uma conta. Ver `agruparPorContaMae` em demonstrativos.ts
// pra como os grupos são formados.
// =====================================================================

/** Formato comum (independente da demonstração de origem) que `linhasDeGrupos` consome. */
export type LinhaGrupoInput = {
  code: string;
  name: string;
  valor: number;
  valorAnterior?: number | null;
  contas: { code: string; name: string; valor: number; valorAnterior?: number | null }[];
};

/** Casa `GrupoContas[]` do período atual com o equivalente do período anterior, por código (grupo e conta), pra alimentar `linhasDeGrupos`. Usado no Balanço, na DRE e na DFC. */
export function juntarGruposComAnterior(grupos: GrupoContas[], gruposAnt: GrupoContas[]): LinhaGrupoInput[] {
  const grupoAntPorCodigo = new Map(gruposAnt.map((g) => [g.code, g]));
  const contaAntPorCodigo = new Map(gruposAnt.flatMap((g) => g.contas.map((c) => [c.code, c])));
  return grupos.map((g) => ({
    code: g.code,
    name: g.name,
    valor: g.subtotal,
    valorAnterior: grupoAntPorCodigo.get(g.code)?.subtotal ?? null,
    contas: g.contas.map((c) => ({
      code: c.code,
      name: c.name,
      valor: c.saldo,
      valorAnterior: contaAntPorCodigo.get(c.code)?.saldo ?? null,
    })),
  }));
}

/** Mesma ideia de `juntarGruposComAnterior`, mas pra `GrupoDmpl[]` (usa o saldo final de cada grupo/conta como "valor"). Usado na DMPL. */
export function juntarGruposDmplComAnterior(grupos: GrupoDmpl[], gruposAnt: GrupoDmpl[]): LinhaGrupoInput[] {
  const grupoAntPorCodigo = new Map(gruposAnt.map((g) => [g.code, g]));
  const contaAntPorCodigo = new Map(gruposAnt.flatMap((g) => g.contas.map((c) => [c.code, c])));
  return grupos.map((g) => ({
    code: g.code,
    name: g.name,
    valor: g.saldoFinal,
    valorAnterior: grupoAntPorCodigo.get(g.code)?.saldoFinal ?? null,
    contas: g.contas.map((c) => ({
      code: c.code,
      name: c.name,
      valor: c.saldoFinal,
      valorAnterior: contaAntPorCodigo.get(c.code)?.saldoFinal ?? null,
    })),
  }));
}

/**
 * Monta as linhas de detalhe (subtotal de grupo + contas-filha) a partir
 * de `LinhaGrupoInput[]` já casado com o período anterior (ver
 * `juntarGruposComAnterior`/`juntarGruposDmplComAnterior`). `nivelBase` é
 * o nível de indentação do subtotal de grupo; as contas-filha ficam um
 * nível abaixo quando o grupo tem mais de uma conta (senão, a conta
 * aparece direto em `nivelBase`, sem repetir o subtotal redundante).
 */
export function linhasDeGrupos(grupos: LinhaGrupoInput[], nivelBase: number = 1): LinhaAnalise[] {
  const linhas: LinhaAnalise[] = [];
  for (const g of grupos) {
    const temSubtotalProprio = g.contas.length > 1;
    if (temSubtotalProprio) {
      linhas.push({
        key: `grupo-${g.code}`,
        label: `${g.code} — ${g.name}`,
        valor: g.valor,
        valorAnterior: g.valorAnterior ?? null,
        indentLevel: nivelBase,
        subtotal: true,
      });
    }
    for (const c of g.contas) {
      linhas.push({
        key: c.code,
        label: `${c.code} — ${c.name}`,
        valor: c.valor,
        valorAnterior: c.valorAnterior ?? null,
        indentLevel: temSubtotalProprio ? nivelBase + 1 : nivelBase,
      });
    }
  }
  return linhas;
}
