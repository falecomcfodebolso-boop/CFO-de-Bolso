import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getDRE, getBalanco, getDFC, getDMPL } from "@/lib/accounting/demonstrativos";
import {
  montarLinhasDre,
  montarLinhasBalanco,
  montarLinhasDfc,
  montarLinhasDmpl,
} from "@/lib/accounting/linhas-demonstracoes";
import { getSaldosPorContaAteData, type SaldoConta } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { resolverPeriodoComAnterior } from "@/lib/export/periodo";
import { montarSecoesBalancete } from "@/lib/export/balancete";
import { getLinhasDiario } from "@/lib/export/diario";
import { buildDiarioSheet, buildLinhasSheet, workbookToBuffer, type LinhaDiario } from "@/lib/export/excel";
import { buildRelatorioGeralPdf, type SecaoRelatorioGeral } from "@/lib/export/pdf";
import { fmtDateNumerica } from "@/lib/format";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

/**
 * Relatório geral: DRE, Balanço, DFC, DMPL, Balancete e Diário(s) em um único arquivo, com o mesmo
 * comparativo das telas de demonstrações (inicio/fim, comparar, inicioAnt/fimAnt).
 * As posições (Balanço e Balancete) são tiradas no fim de cada período — fim × fimAnt.
 */
export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const { inicio, fim, comparar, inicioAnt, fimAnt } = resolverPeriodoComAnterior(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "xlsx" ? "xlsx" : "pdf";

  const intervalo = await getIntervaloDeLancamentos(supabase, currentOrgId);
  const { data: dataBalancete } = resolverDataReferencia(fim, intervalo);
  const { data: dataBalanceteAnt } = resolverDataReferencia(fimAnt, intervalo);

  const [dre, dreAnt, balanco, balancoAnt, dfc, dfcAnt, dmpl, dmplAnt, saldos, saldosAnt, diario, diarioAnt] = await Promise.all([
    getDRE(supabase, currentOrgId, inicio, fim),
    comparar ? getDRE(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
    getBalanco(supabase, currentOrgId, fim),
    comparar ? getBalanco(supabase, currentOrgId, fimAnt) : Promise.resolve(null),
    getDFC(supabase, currentOrgId, inicio, fim),
    comparar ? getDFC(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
    getDMPL(supabase, currentOrgId, inicio, fim),
    comparar ? getDMPL(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
    getSaldosPorContaAteData(supabase, currentOrgId, dataBalancete),
    comparar ? getSaldosPorContaAteData(supabase, currentOrgId, dataBalanceteAnt) : Promise.resolve([] as SaldoConta[]),
    getLinhasDiario(supabase, currentOrgId, inicio, fim),
    comparar ? getLinhasDiario(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve([] as LinhaDiario[]),
  ]);

  // Rótulos de período (intervalos) e de posição (datas)
  const periodoAtual = `${fmtDateNumerica(inicio)} a ${fmtDateNumerica(fim)}`;
  const periodoAnterior = `${fmtDateNumerica(inicioAnt)} a ${fmtDateNumerica(fimAnt)}`;
  const textoPeriodo = comparar ? `${periodoAtual} (comparado a ${periodoAnterior})` : periodoAtual;
  const labelPeriodoAtual = `${fmtDateNumerica(inicio)} – ${fmtDateNumerica(fim)}`;
  const labelPeriodoAnterior = `${fmtDateNumerica(inicioAnt)} – ${fmtDateNumerica(fimAnt)}`;

  const textoPosicao = (d: string, dAnt: string) =>
    comparar ? `Posição em ${fmtDateNumerica(d)} (comparado a ${fmtDateNumerica(dAnt)})` : `Posição em ${fmtDateNumerica(d)}`;

  const porPeriodo = { periodo: textoPeriodo, labelAtual: labelPeriodoAtual, labelAnterior: labelPeriodoAnterior };
  const porPosicaoBalanco = { periodo: textoPosicao(fim, fimAnt), labelAtual: fmtDateNumerica(fim), labelAnterior: fmtDateNumerica(fimAnt) };
  const porPosicaoBalancete = {
    periodo: textoPosicao(dataBalancete, dataBalanceteAnt),
    labelAtual: fmtDateNumerica(dataBalancete),
    labelAnterior: fmtDateNumerica(dataBalanceteAnt),
  };

  const linhasDre = montarLinhasDre(dre, dreAnt);
  const { linhasAtivo, linhasPassivoPl } = montarLinhasBalanco(balanco, balancoAnt);
  const dfcLinhas = montarLinhasDfc(dfc, dfcAnt);
  const { linhasResumo: dmplResumo, linhasContas: dmplContas } = montarLinhasDmpl(dmpl, dmplAnt);

  const secoes: (SecaoRelatorioGeral & { sheet: string })[] = [
    {
      titulo: "DRE — Demonstração do Resultado do Exercício",
      sheet: "DRE",
      linhas: linhasDre,
      baseAV: dre.receitaLiquida,
      baseAVAnterior: dreAnt?.receitaLiquida ?? 0,
      ...porPeriodo,
    },
    {
      titulo: "Balanço Patrimonial — Ativo",
      sheet: "Balanço - Ativo",
      linhas: linhasAtivo,
      baseAV: balanco.ativoTotal,
      baseAVAnterior: balancoAnt?.ativoTotal ?? 0,
      ...porPosicaoBalanco,
    },
    {
      titulo: "Balanço Patrimonial — Passivo + Patrimônio Líquido",
      sheet: "Balanço - Passivo + PL",
      linhas: linhasPassivoPl,
      baseAV: balanco.passivoMaisPl,
      baseAVAnterior: balancoAnt?.passivoMaisPl ?? 0,
      ...porPosicaoBalanco,
    },
    {
      titulo: "DFC — Demonstração do Fluxo de Caixa",
      sheet: "DFC",
      linhas: dfcLinhas.linhas,
      baseAV: dfcLinhas.baseAV,
      baseAVAnterior: dfcLinhas.baseAVAnterior,
      ...porPeriodo,
    },
    {
      titulo: "DMPL — Mutações do Patrimônio Líquido",
      sheet: "DMPL",
      linhas: dmplResumo,
      baseAV: dmpl.saldoFinal,
      baseAVAnterior: dmplAnt?.saldoFinal ?? 0,
      ...porPeriodo,
    },
    ...(dmplContas.length > 0
      ? [
          {
            titulo: "DMPL — Movimentação por conta do Patrimônio Líquido",
            sheet: "DMPL - Contas",
            linhas: dmplContas,
            baseAV: dmpl.saldoFinal,
            baseAVAnterior: dmplAnt?.saldoFinal ?? 0,
            ...porPeriodo,
          },
        ]
      : []),
    ...montarSecoesBalancete(saldos, saldosAnt, comparar).map((s) => ({
      ...s,
      sheet: `Balancete - ${s.sheet}`,
      ...porPosicaoBalancete,
    })),
  ];

  // Diários vão no fim: o do período atual e, quando há comparação, o do período anterior.
  const diarios = [
    { titulo: "Diário — Lançamentos do período atual", sheet: "Diário", periodo: `Período de ${periodoAtual}`, linhas: diario },
    ...(comparar
      ? [
          {
            titulo: "Diário — Lançamentos do período anterior",
            sheet: "Diário - Período anterior",
            periodo: `Período de ${periodoAnterior}`,
            linhas: diarioAnt,
          },
        ]
      : []),
  ];

  const nomeArquivo = comparar
    ? `relatorio-completo-${inicio}-a-${fim}-vs-${inicioAnt}-a-${fimAnt}`
    : `relatorio-completo-${inicio}-a-${fim}`;

  if (formato === "pdf") {
    const buffer = await buildRelatorioGeralPdf(secoes, {
      currency,
      orgName,
      comparar,
      periodoAtual,
      periodoAnterior: comparar ? periodoAnterior : null,
    }, diarios);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomeArquivo}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  for (const s of secoes) {
    buildLinhasSheet(wb, {
      titulo: s.titulo,
      sheetName: s.sheet,
      linhas: s.linhas,
      baseAV: s.baseAV,
      baseAVAnterior: s.baseAVAnterior,
      orgName,
      periodo: s.periodo,
      comparar,
      labelAtual: s.labelAtual,
      labelAnterior: s.labelAnterior,
    });
  }
  for (const d of diarios) {
    buildDiarioSheet(wb, { linhas: d.linhas, orgName, periodo: d.periodo, sheetName: d.sheet, titulo: d.titulo });
  }
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}.xlsx"`,
    },
  });
}
