import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { fmtDateNumerica } from "@/lib/format";
import { buildDiarioSheet, workbookToBuffer, type LinhaDiario } from "@/lib/export/excel";
import { buildDiarioPdf, type LinhaDiarioPdf } from "@/lib/export/pdf";
import { getLinhasDiario } from "@/lib/export/diario";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const orgName = currentMembership.organizations?.name ?? "";
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const dataInicio = req.nextUrl.searchParams.get("dataInicio") || inicioDoAno();
  const dataFim = req.nextUrl.searchParams.get("dataFim") || hoje();
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const linhas: LinhaDiario[] = await getLinhasDiario(supabase, currentOrgId, dataInicio, dataFim);

  const periodo = `Período de ${fmtDateNumerica(dataInicio)} a ${fmtDateNumerica(dataFim)}`;

  if (formato === "pdf") {
    const linhasPdf: LinhaDiarioPdf[] = linhas;
    const buffer = await buildDiarioPdf({ linhas: linhasPdf, currency, orgName, periodo });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="diario-${dataInicio}-${dataFim}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildDiarioSheet(wb, { linhas, orgName, periodo });
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="diario-${dataInicio}-${dataFim}.xlsx"`,
    },
  });
}
