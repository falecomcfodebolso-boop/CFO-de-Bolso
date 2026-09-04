import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getMovimentoConta } from "@/lib/accounting/queries";
import { periodoAnterior } from "@/lib/accounting/analise";
import { fmtDate } from "@/lib/format";
import { buildRazaoDetalheSheet, workbookToBuffer, type LinhaMovimento } from "@/lib/export/excel";
import { buildRazaoDetalhePdf, type LinhaMovimentoPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

function inicioDoAno() {
  return `${new Date().getFullYear()}-01-01`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const contaCode = decodeURIComponent(code);
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const dataInicio = req.nextUrl.searchParams.get("dataInicio") || inicioDoAno();
  const dataFim = req.nextUrl.searchParams.get("dataFim") || hoje();
  const comparar = req.nextUrl.searchParams.get("comparar") === "1";
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const movimentos = await getMovimentoConta(supabase, currentOrgId, contaCode);

  const comSaldo = movimentos.reduce<Array<(typeof movimentos)[number] & { saldoCorrido: number }>>((acc, m) => {
    const anterior = acc.length > 0 ? acc[acc.length - 1].saldoCorrido : 0;
    return [...acc, { ...m, saldoCorrido: anterior + Number(m.valor_saldo) }];
  }, []);

  const doPeriodo = comSaldo.filter((m) => m.data >= dataInicio && m.data <= dataFim);
  const contaLabel = `${contaCode} \u2014 ${movimentos[0]?.conta_name ?? contaCode}`;

  let periodo = `${fmtDate(dataInicio)} a ${fmtDate(dataFim)}`;
  if (comparar) {
    const ant = periodoAnterior(dataInicio, dataFim);
    const saldoFinalAnt = [...comSaldo].reverse().find((m) => m.data <= ant.fim)?.saldoCorrido ?? 0;
    const saldoFinal = doPeriodo.length > 0 ? doPeriodo[doPeriodo.length - 1].saldoCorrido : (
      [...comSaldo].reverse().find((m) => m.data <= dataFim)?.saldoCorrido ?? 0
    );
    const variacao = saldoFinal - saldoFinalAnt;
    periodo += ` \u00b7 comparado a ${fmtDate(ant.inicio)} a ${fmtDate(ant.fim)} (saldo final anterior: ${saldoFinalAnt.toFixed(2)}, varia\u00e7\u00e3o: ${variacao.toFixed(2)})`;
  }

  const linhasExport: LinhaMovimento[] = doPeriodo.map((m) => ({
    data: m.data,
    lancamentoNumero: m.lancamento_numero,
    historico: m.historico,
    tipo: m.tipo,
    valor: Number(m.valor),
    saldoCorrido: m.saldoCorrido,
  }));

  if (formato === "pdf") {
    const linhasPdf: LinhaMovimentoPdf[] = linhasExport;
    const buffer = await buildRazaoDetalhePdf({ contaLabel, movimentos: linhasPdf, currency, orgName, periodo });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="razao-${contaCode}-${dataInicio}-${dataFim}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  buildRazaoDetalheSheet(wb, { contaLabel, movimentos: linhasExport, orgName, periodo });
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="razao-${contaCode}-${dataInicio}-${dataFim}.xlsx"`,
    },
  });
}
