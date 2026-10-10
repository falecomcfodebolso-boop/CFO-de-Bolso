import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getDRE } from "@/lib/accounting/demonstrativos";
import { montarLinhasDre } from "@/lib/accounting/linhas-demonstracoes";
import { resolverPeriodoComAnterior } from "@/lib/export/periodo";
import { buildLinhasSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildLinhasPdf } from "@/lib/export/pdf";
import { fmtDate } from "@/lib/format";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const { inicio, fim, comparar, inicioAnt, fimAnt } = resolverPeriodoComAnterior(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const [dre, dreAnt] = await Promise.all([
    getDRE(supabase, currentOrgId, inicio, fim),
    comparar ? getDRE(supabase, currentOrgId, inicioAnt, fimAnt) : Promise.resolve(null),
  ]);

  const linhas = montarLinhasDre(dre, dreAnt);
  const periodo = comparar
    ? `${fmtDate(inicio)} a ${fmtDate(fim)} (comparado a ${fmtDate(inicioAnt)} a ${fmtDate(fimAnt)})`
    : `${fmtDate(inicio)} a ${fmtDate(fim)}`;

  if (formato === "pdf") {
    const buffer = await buildLinhasPdf({
      titulo: "DRE — Demonstração do Resultado do Exercício",
      linhas,
      baseAV: dre.receitaLiquida,
      baseAVAnterior: dreAnt?.receitaLiquida ?? 0,
      currency,
      orgName,
      periodo,
      comparar,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dre-${inicio}-a-${fim}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildLinhasSheet(wb, {
    titulo: "DRE — Demonstração do Resultado do Exercício",
    sheetName: "DRE",
    linhas,
    baseAV: dre.receitaLiquida,
    baseAVAnterior: dreAnt?.receitaLiquida ?? 0,
    orgName,
    periodo,
    comparar,
  });
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dre-${inicio}-a-${fim}.xlsx"`,
    },
  });
}
