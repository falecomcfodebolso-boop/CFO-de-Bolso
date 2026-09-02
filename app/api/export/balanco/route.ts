import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getBalanco } from "@/lib/accounting/demonstrativos";
import { hoje } from "@/lib/export/periodo";
import { buildBalancoSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildBalancoPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const data = req.nextUrl.searchParams.get("data") || hoje();
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const balanco = await getBalanco(supabase, currentOrgId, data);

  if (formato === "pdf") {
    const buffer = await buildBalancoPdf(balanco, currency, orgName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="balanco-${data}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildBalancoSheet(wb, balanco, orgName);
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="balanco-${data}.xlsx"`,
    },
  });
}
