import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getSaldosPorContaAteData, totalPorNatureza, type SaldoConta } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { dataComparacaoPadrao, type LinhaAnalise } from "@/lib/accounting/analise";
import { fmtDate } from "@/lib/format";
import { buildLinhasSheet, workbookToBuffer } from "@/lib/export/excel";
import { buildRelatorioLinhasPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const GRUPOS: { natureza: SaldoConta["natureza"]; label: string; sheet: string }[] = [
  { natureza: "ATIVO", label: "1 · Ativo", sheet: "Ativo" },
  { natureza: "PASSIVO", label: "2 · Passivo", sheet: "Passivo" },
  { natureza: "PL", label: "3 · Patrimônio Líquido", sheet: "PL" },
  { natureza: "RECEITA", label: "4 · Receitas", sheet: "Receitas" },
  { natureza: "DESPESA", label: "5 · Despesas", sheet: "Despesas" },
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function linhasDoGrupo(saldos: SaldoConta[], saldosAnt: SaldoConta[], natureza: SaldoConta["natureza"]) {
  const contas = saldos.filter((s) => s.natureza === natureza);
  const antPorCodigo = new Map(saldosAnt.filter((s) => s.natureza === natureza).map((s) => [s.conta_code, s]));
  const total = totalPorNatureza(saldos, natureza);
  const totalAnt = totalPorNatureza(saldosAnt, natureza);
  const linhas: LinhaAnalise[] = contas.map((c) => ({
    key: c.conta_code,
    label: `${c.conta_code} — ${c.conta_name}`,
    valor: Number(c.saldo),
    valorAnterior: antPorCodigo.has(c.conta_code) ? Number(antPorCodigo.get(c.conta_code)!.saldo) : null,
    indent: true,
  }));
  return { linhas, total, totalAnt };
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
    ? `Posição em ${fmtDate(data)} · comparado a ${fmtDate(dataAnt)}`
    : `Posição em ${fmtDate(data)}`;

  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const secoes = GRUPOS.map((g) => {
    const { linhas, total, totalAnt } = linhasDoGrupo(saldos, saldosAnt, g.natureza);
    linhas.push({
      key: `${g.natureza}-total`,
      label: `Total ${g.label}`,
      valor: total,
      valorAnterior: comparar ? totalAnt : null,
      subtotal: true,
    });
    return { titulo: `Balancete — ${g.label}`, sheet: g.sheet, linhas, baseAV: total || 1, baseAVAnterior: totalAnt || 1 };
  });

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
