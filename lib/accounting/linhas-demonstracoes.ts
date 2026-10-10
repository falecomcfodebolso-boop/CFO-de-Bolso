// =====================================================================
// Monta as `LinhaAnalise[]` de cada demonstração (Balanço, DRE, DFC,
// DMPL) a partir dos dados "crus" de `demonstrativos.ts` — com os
// subtotais de conta mãe já embutidos (ver `analise.ts`).
//
// Compartilhado entre a página de cada demonstração (que renderiza
// `TabelaComparativa` na tela) e a rota de exportação correspondente
// (que gera o Excel/PDF) — assim os dois sempre mostram exatamente as
// mesmas linhas, incluindo o período de comparação quando houver.
// =====================================================================

import type { Balanco, Dfc, Dmpl, Dre, GrupoContas } from "./demonstrativos";
import { juntarGruposComAnterior, juntarGruposDmplComAnterior, linhasDeGrupos, type LinhaAnalise } from "./analise";

// ---------------------------------------------------------------------
// Balanço Patrimonial
// ---------------------------------------------------------------------

/**
 * Monta as linhas de um bloco do Balanço (ex: "Ativo Circulante" ou
 * "Patrimônio Líquido") a partir das contas já agrupadas por "conta mãe"
 * (ver `agruparPorContaMae` em demonstrativos.ts): uma linha de subtotal
 * por grupo (nível de indentação 1) quando o grupo tem mais de uma
 * conta-filha (nível 2), seguida da linha de "Total" do bloco inteiro.
 */
function linhasDoBlocoBalanco(
  titulo: string,
  grupos: GrupoContas[],
  total: number,
  gruposAnt: GrupoContas[],
  totalAnt: number | null
): LinhaAnalise[] {
  const linhas = linhasDeGrupos(juntarGruposComAnterior(grupos, gruposAnt), 1);
  linhas.push({ key: `${titulo}-total`, label: `Total ${titulo}`, valor: total, valorAnterior: totalAnt, subtotal: true });
  return linhas;
}

export function montarLinhasBalanco(b: Balanco, bAnt: Balanco | null): { linhasAtivo: LinhaAnalise[]; linhasPassivoPl: LinhaAnalise[] } {
  const linhasAtivo: LinhaAnalise[] = [
    ...linhasDoBlocoBalanco(
      "Ativo Circulante",
      b.gruposAtivoCirculante,
      b.ativoCirculante,
      bAnt?.gruposAtivoCirculante ?? [],
      bAnt?.ativoCirculante ?? null
    ),
    ...linhasDoBlocoBalanco(
      "Ativo Não Circulante",
      b.gruposAtivoNaoCirculante,
      b.ativoNaoCirculante,
      bAnt?.gruposAtivoNaoCirculante ?? [],
      bAnt?.ativoNaoCirculante ?? null
    ),
    { key: "ativo-total", label: "= ATIVO TOTAL", valor: b.ativoTotal, valorAnterior: bAnt?.ativoTotal, destaque: true },
  ];

  const linhasPassivoPl: LinhaAnalise[] = [
    ...linhasDoBlocoBalanco(
      "Passivo Circulante",
      b.gruposPassivoCirculante,
      b.passivoCirculante,
      bAnt?.gruposPassivoCirculante ?? [],
      bAnt?.passivoCirculante ?? null
    ),
    ...linhasDoBlocoBalanco(
      "Passivo Não Circulante",
      b.gruposPassivoNaoCirculante,
      b.passivoNaoCirculante,
      bAnt?.gruposPassivoNaoCirculante ?? [],
      bAnt?.passivoNaoCirculante ?? null
    ),
    ...linhasDoBlocoBalanco(
      "Patrimônio Líquido",
      b.gruposPl,
      b.capitalEReservas,
      bAnt?.gruposPl ?? [],
      bAnt?.capitalEReservas ?? null
    ),
    {
      key: "resultado-exercicio",
      label: "Resultado do Exercício (ainda não fechado)",
      valor: b.resultadoDoExercicio,
      valorAnterior: bAnt?.resultadoDoExercicio,
      indent: true,
    },
    {
      key: "passivo-pl-total",
      label: "= PASSIVO + PATRIMÔNIO LÍQUIDO",
      valor: b.passivoMaisPl,
      valorAnterior: bAnt?.passivoMaisPl,
      destaque: true,
    },
  ];

  return { linhasAtivo, linhasPassivoPl };
}

// ---------------------------------------------------------------------
// DRE — Demonstração do Resultado do Exercício
// ---------------------------------------------------------------------

/** Inverte o sinal de um `GrupoContas[]` — usado pras categorias de despesa/dedução da DRE, cujas contas vêm agrupadas em valor absoluto mas são exibidas com sinal negativo (subtraindo da receita). */
function negarGrupos(grupos: GrupoContas[]): GrupoContas[] {
  return grupos.map((g) => ({
    ...g,
    subtotal: -g.subtotal,
    contas: g.contas.map((c) => ({ ...c, saldo: -c.saldo })),
  }));
}

/**
 * Monta a linha de uma categoria da DRE (ex: "Receita Bruta") seguida do
 * detalhamento por conta mãe/conta (ver `linhasDeGrupos`), indentado um
 * nível abaixo da própria categoria.
 */
function linhasCategoriaDre(
  label: string,
  valor: number,
  valorAnterior: number | null | undefined,
  grupos: GrupoContas[],
  gruposAnt: GrupoContas[],
  nivelCategoria: 0 | 1 = 0
): LinhaAnalise[] {
  return [
    { label, valor, valorAnterior, indent: nivelCategoria === 1 },
    ...linhasDeGrupos(juntarGruposComAnterior(grupos, gruposAnt), nivelCategoria + 1),
  ];
}

export function montarLinhasDre(dre: Dre, dreAnt: Dre | null): LinhaAnalise[] {
  return [
    ...linhasCategoriaDre("Receita Bruta", dre.receitaBruta, dreAnt?.receitaBruta, dre.gruposReceitaBruta, dreAnt?.gruposReceitaBruta ?? [], 0),
    ...linhasCategoriaDre(
      "(–) Deduções da Receita",
      -dre.deducoes,
      dreAnt ? -dreAnt.deducoes : null,
      negarGrupos(dre.gruposDeducoes),
      negarGrupos(dreAnt?.gruposDeducoes ?? []),
      1
    ),
    { label: "= Receita Líquida", valor: dre.receitaLiquida, valorAnterior: dreAnt?.receitaLiquida, subtotal: true },
    ...linhasCategoriaDre(
      "(–) Custos",
      -dre.custos,
      dreAnt ? -dreAnt.custos : null,
      negarGrupos(dre.gruposCustos),
      negarGrupos(dreAnt?.gruposCustos ?? []),
      1
    ),
    { label: "= Lucro Bruto", valor: dre.lucroBruto, valorAnterior: dreAnt?.lucroBruto, subtotal: true },
    ...linhasCategoriaDre(
      "(–) Despesas Operacionais",
      -dre.despesasOperacionais,
      dreAnt ? -dreAnt.despesasOperacionais : null,
      negarGrupos(dre.gruposDespesasOperacionais),
      negarGrupos(dreAnt?.gruposDespesasOperacionais ?? []),
      1
    ),
    { label: "= Resultado Operacional", valor: dre.resultadoOperacional, valorAnterior: dreAnt?.resultadoOperacional, subtotal: true },
    ...linhasCategoriaDre(
      "(+) Receitas Financeiras",
      dre.receitasFinanceiras,
      dreAnt?.receitasFinanceiras,
      dre.gruposReceitasFinanceiras,
      dreAnt?.gruposReceitasFinanceiras ?? [],
      1
    ),
    ...linhasCategoriaDre(
      "(–) Despesas Financeiras",
      -dre.despesasFinanceiras,
      dreAnt ? -dreAnt.despesasFinanceiras : null,
      negarGrupos(dre.gruposDespesasFinanceiras),
      negarGrupos(dreAnt?.gruposDespesasFinanceiras ?? []),
      1
    ),
    ...linhasCategoriaDre(
      "(+/–) Outras Receitas/Despesas",
      dre.outras,
      dreAnt?.outras,
      dre.gruposOutras,
      dreAnt?.gruposOutras ?? [],
      1
    ),
    {
      label: "= Resultado Antes dos Impostos",
      valor: dre.resultadoAntesImpostos,
      valorAnterior: dreAnt?.resultadoAntesImpostos,
      subtotal: true,
    },
    ...linhasCategoriaDre(
      "(–) Impostos sobre o Lucro",
      -dre.impostosSobreLucro,
      dreAnt ? -dreAnt.impostosSobreLucro : null,
      negarGrupos(dre.gruposImpostosSobreLucro),
      negarGrupos(dreAnt?.gruposImpostosSobreLucro ?? []),
      1
    ),
    {
      label: "= Lucro/Prejuízo Líquido do Período",
      valor: dre.lucroLiquido,
      valorAnterior: dreAnt?.lucroLiquido,
      destaque: true,
    },
  ];
}

// ---------------------------------------------------------------------
// DFC — Demonstração do Fluxo de Caixa
// ---------------------------------------------------------------------

export function montarLinhasDfc(dfc: Dfc, dfcAnt: Dfc | null): { linhas: LinhaAnalise[]; baseAV: number; baseAVAnterior: number } {
  // Base da análise vertical da DFC: soma dos valores absolutos dos três
  // grupos de atividades — não há uma convenção única pra "100%" num
  // fluxo (diferente do Ativo Total no Balanço ou da Receita na DRE).
  const baseAV = Math.abs(dfc.operacional) + Math.abs(dfc.investimento) + Math.abs(dfc.financiamento);
  const baseAVAnterior = dfcAnt ? Math.abs(dfcAnt.operacional) + Math.abs(dfcAnt.investimento) + Math.abs(dfcAnt.financiamento) : 0;

  const linhas: LinhaAnalise[] = [
    { label: "Saldo Inicial de Caixa", valor: dfc.saldoInicialCaixa, valorAnterior: dfcAnt?.saldoInicialCaixa, destaque: true, semAV: true },
    { label: "(+/–) Atividades Operacionais", valor: dfc.operacional, valorAnterior: dfcAnt?.operacional },
    ...linhasDeGrupos(juntarGruposComAnterior(dfc.gruposOperacional, dfcAnt?.gruposOperacional ?? []), 1),
    { label: "(+/–) Atividades de Investimento", valor: dfc.investimento, valorAnterior: dfcAnt?.investimento },
    ...linhasDeGrupos(juntarGruposComAnterior(dfc.gruposInvestimento, dfcAnt?.gruposInvestimento ?? []), 1),
    { label: "(+/–) Atividades de Financiamento", valor: dfc.financiamento, valorAnterior: dfcAnt?.financiamento },
    ...linhasDeGrupos(juntarGruposComAnterior(dfc.gruposFinanciamento, dfcAnt?.gruposFinanciamento ?? []), 1),
    { label: "= Variação de Caixa no Período", valor: dfc.variacaoCaixa, valorAnterior: dfcAnt?.variacaoCaixa, subtotal: true, semAV: true },
    { label: "Saldo Final de Caixa", valor: dfc.saldoFinalCaixa, valorAnterior: dfcAnt?.saldoFinalCaixa, destaque: true, semAV: true },
  ];

  return { linhas, baseAV, baseAVAnterior };
}

// ---------------------------------------------------------------------
// DMPL — Demonstração das Mutações do Patrimônio Líquido
// ---------------------------------------------------------------------

export function montarLinhasDmpl(dmpl: Dmpl, dmplAnt: Dmpl | null): { linhasResumo: LinhaAnalise[]; linhasContas: LinhaAnalise[] } {
  const linhasResumo: LinhaAnalise[] = [
    { label: "Saldo Inicial", valor: dmpl.saldoInicial, valorAnterior: dmplAnt?.saldoInicial },
    { label: "(+) Aportes de Capital", valor: dmpl.aportes, valorAnterior: dmplAnt?.aportes, indent: true },
    { label: "(–) Distribuições / Retiradas", valor: dmpl.distribuicoes, valorAnterior: dmplAnt?.distribuicoes, indent: true },
    { label: "(+/–) Resultado do Período", valor: dmpl.resultadoPeriodo, valorAnterior: dmplAnt?.resultadoPeriodo, indent: true },
    { label: "Saldo Final", valor: dmpl.saldoFinal, valorAnterior: dmplAnt?.saldoFinal, destaque: true },
  ];

  const linhasContas = linhasDeGrupos(juntarGruposDmplComAnterior(dmpl.grupos, dmplAnt?.grupos ?? []), 0);

  return { linhasResumo, linhasContas };
}
