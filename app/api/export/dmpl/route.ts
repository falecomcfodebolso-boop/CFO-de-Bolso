import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getDMPL } from "@/lib/accounting/demonstrativos";
import { montarLinhasDmpl } from "@/lib/accounting/linhas-demonstracoes";
import { resolverPeriodoComAnterior } from "@/lib/export/periodo";
import { buildLinhasSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildRelatorioLinhasPdf } from "@/lib/export/pdf";
import { fmtDateNumerica } from "@/lib/format";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const { inicio, fim, comparar, inicioAnt, fimAnt } = resolverPeriodoComAnterior(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const [dmpl, dmplAnt] = await Promise.all([
    getDMPL(supabase, currentOrgId, inicio, fim),
    comparar ? getDMPL(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
  ]);

  const { linhasResumo, linhasContas } = montarLinhasDmpl(dmpl, dmplAnt);
  const periodo = comparar
    ? `${fmtDateNumerica(inicio)} a ${fmtDateNumerica(fim)} (comparado a ${fmtDateNumerica(inicioAnt)} a ${fmtDateNumerica(fimAnt)})`
    : `${fmtDateNumerica(inicio)} a ${fmtDateNumerica(fim)}`;
  const labelAtual = `${fmtDateNumerica(inicio)} – ${fmtDateNumerica(fim)}`;
  const labelAnterior = `${fmtDateNumerica(inicioAnt)} – ${fmtDateNumerica(fimAnt)}`;

  const secoes = [
    { titulo: "DMPL — Mutações do Patrimônio Líquido", linhas: linhasResumo, baseAV: dmpl.saldoFinal, baseAVAnterior: dmplAnt?.saldoFinal ?? 0 },
    ...(linhasContas.length > 0
      ? [
          {
            titulo: "DMPL — Movimentação por conta do Patrimônio Líquido",
            linhas: linhasContas,
            baseAV: dmpl.saldoFinal,
            baseAVAnterior: dmplAnt?.saldoFinal ?? 0,
          },
        ]
      : []),
  ];

  if (formato === "pdf") {
    const buffer = await buildRelatorioLinhasPdf(secoes, { currency, orgName, periodo, comparar, labelAtual, labelAnterior });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dmpl-${inicio}-a-${fim}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildLinhasSheet(wb, {
    titulo: "DMPL — Resumo",
    sheetName: "DMPL",
    linhas: linhasResumo,
    baseAV: dmpl.saldoFinal,
    baseAVAnterior: dmplAnt?.saldoFinal ?? 0,
    orgName,
    periodo,
    comparar,
    labelAtual,
    labelAnterior,
  });
  if (linhasContas.length > 0) {
    buildLinhasSheet(wb, {
      titulo: "DMPL — Movimentação por conta",
      sheetName: "Movimentação por conta",
      linhas: linhasContas,
      baseAV: dmpl.saldoFinal,
      baseAVAnterior: dmplAnt?.saldoFinal ?? 0,
      orgName,
      periodo,
      comparar,
      labelAtual,
      labelAnterior,
    });
  }
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dmpl-${inicio}-a-${fim}.xlsx"`,
    },
  });
}
