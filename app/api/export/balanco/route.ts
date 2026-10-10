import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getBalanco } from "@/lib/accounting/demonstrativos";
import { montarLinhasBalanco } from "@/lib/accounting/linhas-demonstracoes";
import { resolverDataComAnterior } from "@/lib/export/periodo";
import { buildLinhasSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildRelatorioLinhasPdf } from "@/lib/export/pdf";
import { fmtDate } from "@/lib/format";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const { data, comparar, dataAnt } = resolverDataComAnterior(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const [b, bAnt] = await Promise.all([
    getBalanco(supabase, currentOrgId, data),
    comparar ? getBalanco(supabase, currentOrgId, dataAnt) : Promise.resolve(null),
  ]);

  const { linhasAtivo, linhasPassivoPl } = montarLinhasBalanco(b, bAnt);
  const periodo = comparar ? `Posição em ${fmtDate(data)} (comparado a ${fmtDate(dataAnt)})` : `Posição em ${fmtDate(data)}`;

  if (formato === "pdf") {
    const buffer = await buildRelatorioLinhasPdf(
      [
        { titulo: "Balanço Patrimonial — Ativo", linhas: linhasAtivo, baseAV: b.ativoTotal, baseAVAnterior: bAnt?.ativoTotal ?? 0 },
        {
          titulo: "Balanço Patrimonial — Passivo + Patrimônio Líquido",
          linhas: linhasPassivoPl,
          baseAV: b.passivoMaisPl,
          baseAVAnterior: bAnt?.passivoMaisPl ?? 0,
        },
      ],
      { currency, orgName, periodo, comparar }
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="balanco-${data}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildLinhasSheet(wb, {
    titulo: "Balanço Patrimonial — Ativo",
    sheetName: "Ativo",
    linhas: linhasAtivo,
    baseAV: b.ativoTotal,
    baseAVAnterior: bAnt?.ativoTotal ?? 0,
    orgName,
    periodo,
    comparar,
  });
  buildLinhasSheet(wb, {
    titulo: "Balanço Patrimonial — Passivo + PL",
    sheetName: "Passivo + PL",
    linhas: linhasPassivoPl,
    baseAV: b.passivoMaisPl,
    baseAVAnterior: bAnt?.passivoMaisPl ?? 0,
    orgName,
    periodo,
    comparar,
  });
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="balanco-${data}.xlsx"`,
    },
  });
}
