import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { fmtDateNumerica } from "@/lib/format";
import { buildDiarioSheet, workbookToBuffer, type LinhaDiario } from "@/lib/export/excel";
import { buildDiarioPdf, type LinhaDiarioPdf } from "@/lib/export/pdf";
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

  const [{ data: contas }, { data: lancamentos, error }] = await Promise.all([
    supabase.from("plano_de_contas").select("code, name").eq("org_id", currentOrgId),
    supabase
      .from("lancamentos")
      .select("id, numero, data, historico, lancamento_linhas(conta_code, tipo, valor)")
      .eq("org_id", currentOrgId)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true })
      .order("numero", { ascending: true }),
  ]);

  if (error) throw error;

  const nomePorCodigo = new Map((contas ?? []).map((c) => [c.code, c.name]));

  const linhas: LinhaDiario[] = (lancamentos ?? []).flatMap((l) =>
    (l.lancamento_linhas as { conta_code: string; tipo: "D" | "C"; valor: number }[])
      .sort((a) => (a.tipo === "D" ? -1 : 1))
      .map((ln) => ({
        data: l.data,
        lancamentoNumero: l.numero,
        historico: l.historico,
        contaCode: ln.conta_code,
        contaName: nomePorCodigo.get(ln.conta_code) ?? "",
        tipo: ln.tipo,
        valor: Number(ln.valor),
      }))
  );

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
