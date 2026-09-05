import ExcelJS from "exceljs";
import type { Balanco, Dfc, Dmpl, Dre } from "@/lib/accounting/demonstrativos";
import type { LinhaAnalise } from "@/lib/accounting/analise";
import { calcAV, calcVariacao } from "@/lib/accounting/analise";
import { fmtDate } from "@/lib/format";

const NUMFMT = '#,##0.00;[Red]-#,##0.00';
const PCTFMT = '0.000%';
const DATEFMT = 'dd/mm/yyyy';

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


// =====================================================================
// Ajustes de Acruamento — exporta o detalhamento por papel (uma aba por
// grupo) e o histórico de apurações, com as FÓRMULAS de cálculo do
// acruo interno (30/360) escritas na própria planilha — não só o
// resultado — para que o valor possa ser conferido/recalculado no
// Excel (inclusive trocando a data de referência de cada aba).
// =====================================================================

export type ItemAcruoExport = {
  nome: string;
  categoriaLabel: string;
  valorFace: number | null;
  tipoTaxa: "fixa" | "flutuante" | null;
  taxaCupom: number | null;
  taxaReferenciaAtual: number | null;
  spreadTaxa: number | null;
  indiceReferencia: string | null;
  /** data_pagamento_anterior (periódico) ou data_inicio_acruo (contínuo). */
  dataBase: string | null;
  pendente: boolean;
};

export type GrupoAcruoExport = {
  nomeGrupo: string;
  contaAcruo: string;
  contaReceita: string;
  /** Já ordenados: confirmados pelo custodiante primeiro, pending depois — necessário para as
   * fórmulas de SUM por faixa contígua de linhas. */
  itens: ItemAcruoExport[];
  saldoContabilAtual: number;
  valorInformadoBanco: number | null;
  dataUltimoAjuste: string | null;
};

export type ApuracaoHistoricoExport = {
  dataBase: string;
  nomeGrupo: string;
  contaAcruoCode: string;
  saldoContabilAntes: number;
  valorReportadoBanco: number;
  acruoCalculadoInterno: number | null;
  fonte: string | null;
  lancado: boolean;
};

function nomeAbaValido(nome: string): string {
  return nome.replace(/[\\/*?:[\]]/g, "-").slice(0, 31);
}

export function buildAjustesGrupoSheet(wb: ExcelJS.Workbook, grupo: GrupoAcruoExport, dataRef: string, orgName: string) {
  const ws = wb.addWorksheet(nomeAbaValido(`Ajustes - ${grupo.nomeGrupo}`));
  ws.columns = [
    { width: 32 }, // A Papel
    { width: 14 }, // B Categoria
    { width: 14 }, // C Valor Face
    { width: 11 }, // D Taxa Cupom
    { width: 13 }, // E Taxa Ref. Atual
    { width: 9 }, // F Spread
    { width: 11 }, // G Índice Ref.
    { width: 12 }, // H Taxa Efetiva
    { width: 15 }, // I Data Base
    { width: 9 }, // J Dias (30/360)
    { width: 16 }, // K Cálculo Interno
    { width: 24 }, // L Obs.
  ];

  ws.mergeCells("A1:L1");
  ws.getCell("A1").value = `Ajustes de Acruamento — ${grupo.nomeGrupo}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:L2");
  ws.getCell("A2").value = orgName;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  ws.mergeCells("A3:L3");
  ws.getCell("A3").value = `Conta(s) de acruo: ${grupo.contaAcruo} · Conta de receita: ${grupo.contaReceita}`;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF64748B" } };

  const REF_ROW = 5;
  ws.mergeCells(`A${REF_ROW}:E${REF_ROW}`);
  ws.getCell(`A${REF_ROW}`).value = "Data de referência (edite para recalcular o cálculo interno)";
  ws.getCell(`A${REF_ROW}`).font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  ws.getCell(`F${REF_ROW}`).value = new Date(`${dataRef}T00:00:00Z`);
  ws.getCell(`F${REF_ROW}`).numFmt = DATEFMT;
  ws.getCell(`F${REF_ROW}`).font = { bold: true };
  const refCell = `$F$${REF_ROW}`;

  const itens = grupo.itens;
  const HEADER_ROW = 8;
  const ITEMS_START = HEADER_ROW + 1;
  const ITEMS_END = itens.length > 0 ? ITEMS_START + itens.length - 1 : ITEMS_START - 1;
  const primeiroPendenteIdx = itens.findIndex((i) => i.pendente);
  const temPendentes = primeiroPendenteIdx >= 0;
  const subtotalConfirmadoRow = temPendentes ? ITEMS_END + 1 : null;
  const subtotalPendenteRow = temPendentes ? ITEMS_END + 2 : null;
  const subtotalGrupoRow = temPendentes ? ITEMS_END + 3 : ITEMS_END + 1;

  const RESUMO_ROW = REF_ROW + 2; // 7
  ws.getCell(`A${RESUMO_ROW}`).value = "Contábil atual";
  ws.getCell(`A${RESUMO_ROW}`).font = { bold: true };
  ws.getCell(`B${RESUMO_ROW}`).value = grupo.saldoContabilAtual;
  ws.getCell(`B${RESUMO_ROW}`).numFmt = NUMFMT;

  ws.getCell(`D${RESUMO_ROW}`).value = "Calculado (interno, 30/360)";
  ws.getCell(`D${RESUMO_ROW}`).font = { bold: true };
  ws.getCell(`E${RESUMO_ROW}`).value = { formula: `K${subtotalGrupoRow}` } as ExcelJS.CellFormulaValue;
  ws.getCell(`E${RESUMO_ROW}`).numFmt = NUMFMT;

  ws.getCell(`G${RESUMO_ROW}`).value = "Informado pelo banco";
  ws.getCell(`G${RESUMO_ROW}`).font = { bold: true };
  if (grupo.valorInformadoBanco != null) {
    ws.getCell(`H${RESUMO_ROW}`).value = grupo.valorInformadoBanco;
    ws.getCell(`H${RESUMO_ROW}`).numFmt = NUMFMT;
  } else {
    ws.getCell(`H${RESUMO_ROW}`).value = "— (nenhuma apuração)";
  }

  ws.getCell(`I${RESUMO_ROW}`).value = "Diferença (calc. vs. banco)";
  ws.getCell(`I${RESUMO_ROW}`).font = { bold: true };
  if (grupo.valorInformadoBanco != null) {
    ws.getCell(`J${RESUMO_ROW}`).value = { formula: `E${RESUMO_ROW}-H${RESUMO_ROW}` } as ExcelJS.CellFormulaValue;
    ws.getCell(`J${RESUMO_ROW}`).numFmt = NUMFMT;
  } else {
    ws.getCell(`J${RESUMO_ROW}`).value = "—";
  }

  const header = ws.getRow(HEADER_ROW);
  header.values = [
    "Papel",
    "Categoria",
    "Valor Face",
    "Taxa Cupom",
    "Taxa Ref. Atual",
    "Spread",
    "Índice Ref.",
    "Taxa Efetiva",
    "Data Base (últ. pgto/início)",
    "Dias (30/360)",
    "Cálculo Interno",
    "Obs.",
  ];
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }));

  itens.forEach((item, idx) => {
    const r = ITEMS_START + idx;
    const row = ws.getRow(r);
    row.getCell(1).value = item.nome;
    row.getCell(2).value = item.categoriaLabel;
    if (item.valorFace != null) {
      row.getCell(3).value = item.valorFace;
      row.getCell(3).numFmt = NUMFMT;
    }
    if (item.tipoTaxa === "flutuante") {
      if (item.taxaReferenciaAtual != null) {
        row.getCell(5).value = item.taxaReferenciaAtual;
        row.getCell(5).numFmt = PCTFMT;
      }
      if (item.spreadTaxa != null) {
        row.getCell(6).value = item.spreadTaxa;
        row.getCell(6).numFmt = PCTFMT;
      }
      if (item.indiceReferencia) row.getCell(7).value = item.indiceReferencia;
      row.getCell(8).value = { formula: `E${r}+F${r}` } as ExcelJS.CellFormulaValue;
      row.getCell(8).numFmt = PCTFMT;
    } else if (item.taxaCupom != null) {
      row.getCell(4).value = item.taxaCupom;
      row.getCell(4).numFmt = PCTFMT;
      row.getCell(8).value = { formula: `D${r}` } as ExcelJS.CellFormulaValue;
      row.getCell(8).numFmt = PCTFMT;
    }
    const temFormula = item.dataBase != null && item.valorFace != null;
    if (item.dataBase) {
      row.getCell(9).value = new Date(`${item.dataBase}T00:00:00Z`);
      row.getCell(9).numFmt = DATEFMT;
    }
    if (temFormula) {
      // DAYS360(..., FALSE) usa o método US/NASD — a mesma convenção 30/360
      // implementada em lib/accounting/acruo.ts (dias360), então o resultado
      // bate com o que a tela de Ajustes mostra.
      row.getCell(10).value = { formula: `DAYS360(I${r},${refCell},FALSE)` } as ExcelJS.CellFormulaValue;
      row.getCell(11).value = { formula: `IF(J${r}<=0,0,C${r}*H${r}*J${r}/360)` } as ExcelJS.CellFormulaValue;
      row.getCell(11).numFmt = NUMFMT;
    } else {
      row.getCell(10).value = "—";
      row.getCell(11).value = "— (usa extrato)";
    }
    if (item.pendente) row.getCell(12).value = "Pending no custodiante";
  });

  if (temPendentes && subtotalConfirmadoRow != null && subtotalPendenteRow != null) {
    const primeiroPendenteRow = ITEMS_START + primeiroPendenteIdx;
    const ultimoConfirmadoRow = primeiroPendenteRow - 1;

    const rowConf = ws.getRow(subtotalConfirmadoRow);
    rowConf.getCell(1).value = "Subtotal — confirmados pelo custodiante";
    if (ultimoConfirmadoRow >= ITEMS_START) {
      rowConf.getCell(11).value = { formula: `SUM(K${ITEMS_START}:K${ultimoConfirmadoRow})` } as ExcelJS.CellFormulaValue;
    } else {
      rowConf.getCell(11).value = 0;
    }
    rowConf.getCell(11).numFmt = NUMFMT;

    const rowPend = ws.getRow(subtotalPendenteRow);
    rowPend.getCell(1).value = "Subtotal — pending receipt (sem valor do custodiante)";
    rowPend.getCell(11).value = { formula: `SUM(K${primeiroPendenteRow}:K${ITEMS_END})` } as ExcelJS.CellFormulaValue;
    rowPend.getCell(11).numFmt = NUMFMT;
    rowPend.font = { color: { argb: "FFB45309" } };
  }

  const rowTotal = ws.getRow(subtotalGrupoRow);
  rowTotal.getCell(1).value = `Subtotal ${grupo.nomeGrupo}`;
  rowTotal.font = { bold: true };
  if (ITEMS_END >= ITEMS_START) {
    rowTotal.getCell(11).value = { formula: `SUM(K${ITEMS_START}:K${ITEMS_END})` } as ExcelJS.CellFormulaValue;
  } else {
    rowTotal.getCell(11).value = 0;
  }
  rowTotal.getCell(11).numFmt = NUMFMT;

  return ws;
}

export function buildAjustesHistoricoSheet(wb: ExcelJS.Workbook, apuracoes: ApuracaoHistoricoExport[], orgName: string) {
  const ws = wb.addWorksheet("Histórico de Apurações");
  ws.columns = [
    { width: 12 },
    { width: 24 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 28 },
    { width: 12 },
  ];

  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "Ajustes de Acruamento — Histórico de Apurações";
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:I2");
  ws.getCell("A2").value = orgName;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF64748B" } };
  ws.addRow([]);

  const header = ws.addRow([
    "Data-base",
    "Grupo",
    "Conta de acruo",
    "Contábil (antes)",
    "Banco/extrato",
    "Cálculo interno",
    "Diferença",
    "Fonte",
    "Status",
  ]);
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }));

  for (const a of apuracoes) {
    const row = ws.addRow([
      new Date(`${a.dataBase}T00:00:00Z`),
      a.nomeGrupo,
      a.contaAcruoCode,
      a.saldoContabilAntes,
      a.valorReportadoBanco,
      a.acruoCalculadoInterno,
      null,
      a.fonte ?? "—",
      a.lancado ? "Lançado" : "Pendente",
    ]);
    row.getCell(1).numFmt = DATEFMT;
    row.getCell(4).numFmt = NUMFMT;
    row.getCell(5).numFmt = NUMFMT;
    if (a.acruoCalculadoInterno != null) row.getCell(6).numFmt = NUMFMT;
    // Mesma formula usada por lancarAjusteAction: diferenca = valor do banco - saldo contabil antes.
    row.getCell(7).value = { formula: `E${row.number}-D${row.number}` } as ExcelJS.CellFormulaValue;
    row.getCell(7).numFmt = NUMFMT;
  }
  return ws;
}
