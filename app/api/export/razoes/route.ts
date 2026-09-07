import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { getMovimentoTodasContas } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import { fmtDateNumerica } from "@/lib/format";
import { buildRazaoDetalheSheet, workbookToBuffer, type LinhaMovimento } from "@/lib/export/excel";
import { buildRazoesDetalhadoPdf, type LinhaMovimentoPdf } from "@/lib/export/pdf";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

export type MovimentoConta = {
  conta_code: string;
  conta_name: string;
  data: string;
  lancamento_numero: number | string;
  historico: string;
  tipo: "D" | "C";
  valor: number;
  valor_saldo: number;
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function inicioDoAno(data: string) {
  return `${data.slice(0, 4)}-01-01`;
}

/** Remove caracteres que o Excel proíbe em nome de aba e garante nomes únicos. */
function nomesDeAbaUnicos(codigos: string[]): Map<string, string> {
  const usados = new Set<string>();
  const porCodigo = new Map<string, string>();
  for (const codigo of codigos) {
    let base = codigo.replace(/[\\/?*[\]]/g, "-").slice(0, 31);
    let nome = base;
    let sufixo = 2;
    while (usados.has(nome)) {
      nome = `${base.slice(0, 28)}-${sufixo}`;
      sufixo++;
    }
    usados.add(nome);
    porCodigo.set(codigo, nome);
  }
  return porCodigo;
}

/**
 * Exportação DETALHADA de Razões: em vez do resumo de saldos por conta (que é o que a
 * tela de Razões mostra), gera um arquivo com o extrato completo (razão) de cada conta
 * com movimento no período — uma aba (Excel) ou seção (PDF) por conta, no mesmo formato
 * que a tela /razoes/[code] mostra para uma conta só, só que para todas de uma vez.
 */
export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const orgName = currentMembership.organizations?.name ?? "";
  const currency = currentMembership.organizations?.base_currency ?? "USD";

  const dataParam = req.nextUrl.searchParams.get("data") || hoje();
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const intervalo = await getIntervaloDeLancamentos(supabase, currentOrgId);
  const { data } = resolverDataReferencia(dataParam, intervalo);
  const dataInicioParam = req.nextUrl.searchParams.get("dataInicio") || inicioDoAno(data);
  const { data: dataInicio } = resolverDataReferencia(dataInicioParam, intervalo);

  // Uma query só para todas as contas (em vez de uma por conta) — pega tudo até a data
  // de referência para poder calcular o saldo corrido de cada conta desde o começo, e
  // filtra para o período [dataInicio, data] só na hora de montar as linhas exibidas.
  const todosMovimentos = (await getMovimentoTodasContas(supabase, currentOrgId, data)) as MovimentoConta[];

  const porConta = new Map<string, MovimentoConta[]>();
  for (const m of todosMovimentos) {
    if (!porConta.has(m.conta_code)) porConta.set(m.conta_code, []);
    porConta.get(m.conta_code)!.push(m);
  }

  type ContaDetalhe = { contaCode: string; contaLabel: string; movimentos: LinhaMovimento[] };
  const contas: ContaDetalhe[] = [];
  for (const [contaCode, movs] of Array.from(porConta.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    let saldoCorrido = 0;
    const comSaldo = movs.map((m) => {
      saldoCorrido += Number(m.valor_saldo);
      return { ...m, saldoCorrido };
    });
    const doPeriodo = comSaldo.filter((m) => m.data >= dataInicio && m.data <= data);
    if (doPeriodo.length === 0) continue;

    contas.push({
      contaCode,
      contaLabel: `${contaCode} — ${movs[0].conta_name}`,
      movimentos: doPeriodo.map((m) => ({
        data: m.data,
        lancamentoNumero: m.lancamento_numero,
        historico: m.historico,
        tipo: m.tipo,
        valor: Number(m.valor),
        saldoCorrido: m.saldoCorrido,
      })),
    });
  }

  const periodo = `Detalhamento de ${fmtDateNumerica(dataInicio)} a ${fmtDateNumerica(data)}`;

  if (formato === "pdf") {
    const secoes: { contaLabel: string; movimentos: LinhaMovimentoPdf[] }[] = contas.map((c) => ({
      contaLabel: c.contaLabel,
      movimentos: c.movimentos,
    }));
    const buffer = await buildRazoesDetalhadoPdf(secoes, { currency, orgName, periodo });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="razoes-detalhado-${data}.pdf"`,
      },
    });
  }

  const nomesAba = nomesDeAbaUnicos(contas.map((c) => c.contaCode));

  const wb = new ExcelJS.Workbook();

  // Aba de índice, primeiro, pra facilitar navegar entre as dezenas de contas.
  const wsIndice = wb.addWorksheet("Índice");
  wsIndice.columns = [{ width: 16 }, { width: 50 }];
  wsIndice.mergeCells("A1:B1");
  wsIndice.getCell("A1").value = "Razões — Índice de contas";
  wsIndice.getCell("A1").font = { bold: true, size: 14 };
  wsIndice.mergeCells("A2:B2");
  wsIndice.getCell("A2").value = orgName;
  wsIndice.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  wsIndice.mergeCells("A3:B3");
  wsIndice.getCell("A3").value = periodo;
  wsIndice.getCell("A3").font = { size: 10, color: { argb: "FF64748B" } };
  wsIndice.addRow([]);
  const header = wsIndice.addRow(["Conta", "Aba"]);
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }));
  for (const c of contas) {
    wsIndice.addRow([c.contaLabel, nomesAba.get(c.contaCode)]);
  }

  for (const c of contas) {
    buildRazaoDetalheSheet(wb, {
      contaLabel: c.contaLabel,
      movimentos: c.movimentos,
      orgName,
      periodo,
      sheetName: nomesAba.get(c.contaCode),
    });
  }

  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="razoes-detalhado-${data}.xlsx"`,
    },
  });
}
