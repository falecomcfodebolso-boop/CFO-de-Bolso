import ExcelJS from "exceljs";
import type { Balanco, Dfc, Dmpl, Dre } from "@/lib/accounting/demonstrativos";
import type { LinhaAnalise } from "@/lib/accounting/analise";
import { calcAV, calcVariacao } from "@/lib/accounting/analise";
import { fmtDate } from "@/lib/format";

const NUMFMT = '#,##0.00;[Red]-#,##0.00';

function fmtPctExport(v: number | null): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function addCabecalho(ws: ExcelJS.Worksheet, titulo: string, orgName: string, periodo: string) {
  ws.mergeCells("A1:C1");
  ws.getCell("A1").value = titulo;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:C2");
  ws.getCell("A2").value = orgName;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  ws.mergeCells("A3:C3");
  ws.getCell("A3").value = periodo;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF64748B" } };
  ws.addRow([]);
}

function addLinha(
  ws: ExcelJS.Worksheet,
  label: string,
  valor: number | null,
  opts: { bold?: boolean; indent?: number } = {}
) {
  const row = ws.addRow([label, valor]);
  if (opts.bold) row.font = { bold: true };
  if (opts.indent) row.getCell(1).alignment = { indent: opts.indent };
  if (valor !== null) row.getCell(2).numFmt = NUMFMT;
  return row;
}

function novaPlanilha(wb: ExcelJS.Workbook, nome: string) {
  const ws = wb.addWorksheet(nome);
  ws.columns = [{ width: 42 }, { width: 18 }, { width: 18 }];
  return ws;
}

export function buildDreSheet(wb: ExcelJS.Workbook, dre: Dre, orgName: string) {
  const ws = novaPlanilha(wb, "DRE");
  addCabecalho(ws, "DRE — Demonstração do Resultado do Exercício", orgName, `${fmtDate(dre.periodoInicio)} a ${fmtDate(dre.periodoFim)}`);
  addLinha(ws, "Receita Bruta", dre.receitaBruta);
  addLinha(ws, "(-) Deduções da Receita", -dre.deducoes, { indent: 1 });
  addLinha(ws, "= Receita Líquida", dre.receitaLiquida, { bold: true });
  addLinha(ws, "(-) Custos", -dre.custos, { indent: 1 });
  addLinha(ws, "= Lucro Bruto", dre.lucroBruto, { bold: true });
  addLinha(ws, "(-) Despesas Operacionais", -dre.despesasOperacionais, { indent: 1 });
  addLinha(ws, "= Resultado Operacional", dre.resultadoOperacional, { bold: true });
  addLinha(ws, "(+) Receitas Financeiras", dre.receitasFinanceiras, { indent: 1 });
  addLinha(ws, "(-) Despesas Financeiras", -dre.despesasFinanceiras, { indent: 1 });
  addLinha(ws, "(+/-) Outras Receitas/Despesas", dre.outras, { indent: 1 });
  addLinha(ws, "= Resultado Antes dos Impostos", dre.resultadoAntesImpostos, { bold: true });
  addLinha(ws, "(-) Impostos sobre o Lucro", -dre.impostosSobreLucro, { indent: 1 });
  addLinha(ws, "= Lucro/Prejuízo Líquido do Período", dre.lucroLiquido, { bold: true });
  return ws;
}

export function buildBalancoSheet(wb: ExcelJS.Workbook, b: Balanco, orgName: string) {
  const ws = novaPlanilha(wb, "Balanço Patrimonial");
  addCabecalho(ws, "Balanço Patrimonial", orgName, `Posição em ${fmtDate(b.data)}`);

  addLinha(ws, "ATIVO", null, { bold: true });
  addLinha(ws, "Ativo Circulante", b.ativoCirculante, { indent: 1, bold: true });
  for (const c of b.contasAtivoCirculante) addLinha(ws, `${c.code} · ${c.name}`, c.saldo, { indent: 2 });
  addLinha(ws, "Ativo Não Circulante", b.ativoNaoCirculante, { indent: 1, bold: true });
  for (const c of b.contasAtivoNaoCirculante) addLinha(ws, `${c.code} · ${c.name}`, c.saldo, { indent: 2 });
  addLinha(ws, "Total do Ativo", b.ativoTotal, { bold: true });
  ws.addRow([]);

  addLinha(ws, "PASSIVO", null, { bold: true });
  addLinha(ws, "Passivo Circulante", b.passivoCirculante, { indent: 1, bold: true });
  for (const c of b.contasPassivoCirculante) addLinha(ws, `${c.code} · ${c.name}`, c.saldo, { indent: 2 });
  addLinha(ws, "Passivo Não Circulante", b.passivoNaoCirculante, { indent: 1, bold: true });
  for (const c of b.contasPassivoNaoCirculante) addLinha(ws, `${c.code} · ${c.name}`, c.saldo, { indent: 2 });
  addLinha(ws, "Total do Passivo", b.passivoTotal, { bold: true });
  ws.addRow([]);

  addLinha(ws, "PATRIMÔNIO LÍQUIDO", null, { bold: true });
  for (const c of b.contasPl) addLinha(ws, `${c.code} · ${c.name}`, c.saldo, { indent: 2 });
  addLinha(ws, "Resultado do Exercício (ainda não fechado)", b.resultadoDoExercicio, { indent: 1 });
  addLinha(ws, "Total do Patrimônio Líquido", b.patrimonioLiquido, { bold: true });
  ws.addRow([]);
  addLinha(ws, "Total Passivo + PL", b.passivoMaisPl, { bold: true });
  addLinha(ws, "Diferença (deve ser 0)", b.diferenca);
  return ws;
}

export function buildDfcSheet(wb: ExcelJS.Workbook, dfc: Dfc, orgName: string) {
  const ws = novaPlanilha(wb, "DFC");
  addCabecalho(ws, "DFC — Demonstração do Fluxo de Caixa", orgName, `${fmtDate(dfc.periodoInicio)} a ${fmtDate(dfc.periodoFim)}`);
  addLinha(ws, "Saldo Inicial de Caixa", dfc.saldoInicialCaixa, { bold: true });
  addLinha(ws, "Atividades Operacionais", dfc.operacional, { indent: 1 });
  addLinha(ws, "Atividades de Investimento", dfc.investimento, { indent: 1 });
  addLinha(ws, "Atividades de Financiamento", dfc.financiamento, { indent: 1 });
  addLinha(ws, "Variação de Caixa no Período", dfc.variacaoCaixa, { bold: true });
  addLinha(ws, "Saldo Final de Caixa", dfc.saldoFinalCaixa, { bold: true });
  return ws;
}

export function buildDmplSheet(wb: ExcelJS.Workbook, dmpl: Dmpl, orgName: string) {
  const ws = novaPlanilha(wb, "DMPL");
  addCabecalho(ws, "DMPL — Mutações do Patrimônio Líquido", orgName, `${fmtDate(dmpl.periodoInicio)} a ${fmtDate(dmpl.periodoFim)}`);
  addLinha(ws, "Saldo Inicial", dmpl.saldoInicial, { bold: true });
  addLinha(ws, "Aportes de Capital", dmpl.aportes, { indent: 1 });
  addLinha(ws, "Distribuições / Retiradas", dmpl.distribuicoes, { indent: 1 });
  addLinha(ws, "Resultado do Período", dmpl.resultadoPeriodo, { indent: 1 });
  addLinha(ws, "Saldo Final", dmpl.saldoFinal, { bold: true });
  ws.addRow([]);
  const header = ws.addRow(["Conta", "Saldo Inicial", "Movimento", "Saldo Final"]);
  header.font = { bold: true };
  for (const c of dmpl.contas) {
    const row = ws.addRow([`${c.code} · ${c.name}`, c.saldoInicial, c.movimento, c.saldoFinal]);
    row.getCell(2).numFmt = NUMFMT;
    row.getCell(3).numFmt = NUMFMT;
    row.getCell(4).numFmt = NUMFMT;
  }
  ws.getColumn(4).width = 18;
  return ws;
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}


// =====================================================================
// Exportadores genéricos (Balancete e Razões) — operam sobre LinhaAnalise[]
// em vez dos tipos específicos de cada demonstração (Dre/Balanco/Dfc/Dmpl).
// =====================================================================

export type LinhaMovimento = {
  data: string;
  lancamentoNumero: number | string;
  historico: string;
  tipo: "D" | "C";
  valor: number;
  saldoCorrido: number;
};

export function buildLinhasSheet(
  wb: ExcelJS.Workbook,
  opts: {
    titulo: string;
    sheetName?: string;
    linhas: LinhaAnalise[];
    baseAV: number;
    baseAVAnterior: number;
    orgName: string;
    periodo: string;
    comparar: boolean;
  }
) {
  const { titulo, sheetName, linhas, baseAV, baseAVAnterior, orgName, periodo, comparar } = opts;
  const ws = wb.addWorksheet((sheetName ?? titulo).slice(0, 31));
  ws.columns = comparar
    ? [{ width: 42 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 10 }]
    : [{ width: 42 }, { width: 16 }, { width: 10 }];

  const ultimaColuna = comparar ? "G" : "C";
  ws.mergeCells(`A1:${ultimaColuna}1`);
  ws.getCell("A1").value = titulo;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells(`A2:${ultimaColuna}2`);
  ws.getCell("A2").value = orgName;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  ws.mergeCells(`A3:${ultimaColuna}3`);
  ws.getCell("A3").value = periodo;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF64748B" } };
  ws.addRow([]);

  const header = ws.addRow(
    comparar
      ? ["Conta", "Valor", "AV %", "Período anterior", "AV % ant.", "Variação", "AH %"]
      : ["Conta", "Valor", "AV %"]
  );
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }));

  for (const l of linhas) {
    const av = l.semAV ? null : calcAV(l.valor, baseAV);
    const avAnterior = l.semAV ? null : calcAV(l.valorAnterior ?? 0, baseAVAnterior);
    const variacao = comparar ? calcVariacao(l.valor, l.valorAnterior) : null;

    const row = comparar
      ? ws.addRow([
          l.label,
          l.valor,
          fmtPctExport(av),
          l.valorAnterior ?? null,
          fmtPctExport(avAnterior),
          variacao?.absoluta ?? null,
          fmtPctExport(variacao?.pct ?? null),
        ])
      : ws.addRow([l.label, l.valor, fmtPctExport(av)]);

    if (l.indent) row.getCell(1).alignment = { indent: 1 };
    if (l.subtotal || l.destaque) row.font = { bold: true };
    row.getCell(2).numFmt = NUMFMT;
    if (comparar) {
      row.getCell(4).numFmt = NUMFMT;
      row.getCell(6).numFmt = NUMFMT;
    }
  }
  return ws;
}

export function buildRazaoDetalheSheet(
  wb: ExcelJS.Workbook,
  opts: { contaLabel: string; movimentos: LinhaMovimento[]; orgName: string; periodo: string }
) {
  const { contaLabel, movimentos, orgName, periodo } = opts;
  const ws = wb.addWorksheet("Razão");
  ws.columns = [{ width: 14 }, { width: 12 }, { width: 40 }, { width: 12 }, { width: 16 }, { width: 16 }];

  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = contaLabel;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:F2");
  ws.getCell("A2").value = orgName;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  ws.mergeCells("A3:F3");
  ws.getCell("A3").value = periodo;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF64748B" } };
  ws.addRow([]);

  const header = ws.addRow(["Data", "Nº Lçto", "Histórico", "Natureza", "Valor", "Saldo"]);
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }));

  for (const m of movimentos) {
    const row = ws.addRow([
      m.data,
      m.lancamentoNumero,
      m.historico,
      m.tipo === "D" ? "Débito" : "Crédito",
      m.valor,
      m.saldoCorrido,
    ]);
    row.getCell(5).numFmt = NUMFMT;
    row.getCell(6).numFmt = NUMFMT;
  }
  return ws;
}
