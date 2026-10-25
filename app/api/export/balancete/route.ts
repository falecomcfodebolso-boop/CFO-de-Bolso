import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getSaldosPorContaAteData, type SaldoConta } from "@/lib/accounting/queries";
import { montarSecoesBalancete } from "@/lib/export/balancete";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { dataComparacaoPadrao } from "@/lib/accounting/analise";
import { fmtDateNumerica } from "@/lib/format";
import { buildLinhasSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildRelatorioLinhasPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const orgName = currentMembership.organizations?.name ?? "";

  const dataParam = req.nextUrl.searchParams.get("data") || hoje();
  const comparar = req.nextUrl.searchParams.get("comparar") !== "0";
  const dataAntParam = req.nextUrl.searchParams.get("dataAnt") || dataComparacaoPadrao(dataParam);
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const intervalo = await getIntervaloDeLancamentos(supabase, currentOrgId);
  const { data } = resolverDataReferencia(dataParam, intervalo);
  const { data: dataAnt } = resolverDataReferencia(dataAntParam, intervalo);

  const [saldos, saldosAnt] = await Promise.all([
    getSaldosPorContaAteData(supabase, currentOrgId, data),
    comparar ? getSaldosPorContaAteData(supabase, currentOrgId, dataAnt) : Promise.resolve([] as SaldoConta[]),
  ]);

  const periodo = comparar
    ? `Posição em ${fmtDateNumerica(data)} · comparado a ${fmtDateNumerica(dataAnt)}`
    : `Posição em ${fmtDateNumerica(data)}`;

  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const secoes = montarSecoesBalancete(saldos, saldosAnt, comparar);

  if (formato === "pdf") {
    const buffer = await buildRelatorioLinhasPdf(
      secoes.map((s) => ({ titulo: s.titulo, linhas: s.linhas, baseAV: s.baseAV, baseAVAnterior: s.baseAVAnterior })),
      { currency, orgName, periodo, comparar }
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="balancete-${data}.pdf"`,
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
      periodo,
      comparar,
    });
  }
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="balancete-${data}.xlsx"`,
    },
  });
}
