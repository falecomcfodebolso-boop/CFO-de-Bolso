import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getDFC } from "@/lib/accounting/demonstrativos";
import { resolverPeriodo } from "@/lib/export/periodo";
import { buildDfcSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildDfcPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const { inicio, fim } = resolverPeriodo(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const dfc = await getDFC(supabase, currentOrgId, inicio, fim);

  if (formato === "pdf") {
    const buffer = await buildDfcPdf(dfc, currency, orgName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dfc-${inicio}-a-${fim}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildDfcSheet(wb, dfc, orgName);
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dfc-${inicio}-a-${fim}.xlsx"`,
    },
  });
}
