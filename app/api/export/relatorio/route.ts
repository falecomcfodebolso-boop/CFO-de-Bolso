import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getDRE, getBalanco, getDFC, getDMPL } from "@/lib/accounting/demonstrativos";
import { resolverPeriodo } from "@/lib/export/periodo";
import { buildDreSheet, buildBalancoSheet, buildDfcSheet, buildDmplSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildRelatorioCompletoPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const { inicio, fim } = resolverPeriodo(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const [dre, balanco, dfc, dmpl] = await Promise.all([
    getDRE(supabase, currentOrgId, inicio, fim),
    getBalanco(supabase, currentOrgId, fim),
    getDFC(supabase, currentOrgId, inicio, fim),
    getDMPL(supabase, currentOrgId, inicio, fim),
  ]);

  if (formato === "pdf") {
    const buffer = await buildRelatorioCompletoPdf({ dre, balanco, dfc, dmpl }, currency, orgName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-completo-${inicio}-a-${fim}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildDreSheet(wb, dre, orgName);
  buildBalancoSheet(wb, balanco, orgName);
  buildDfcSheet(wb, dfc, orgName);
  buildDmplSheet(wb, dmpl, orgName);
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-completo-${inicio}-a-${fim}.xlsx"`,
    },
  });
}
