import PDFDocument from "pdfkit";
import type { Balanco, Dfc, Dmpl, Dre } from "@/lib/accounting/demonstrativos";
import type { LinhaAnalise } from "@/lib/accounting/analise";
import { calcAV, calcVariacao } from "@/lib/accounting/analise";
import { fmtDate, fmtMoney } from "@/lib/format";

function novoDocumento(): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  return { doc, done };
}

function cabecalho(doc: PDFKit.PDFDocument, titulo: string, orgName: string, periodo: string) {
  doc.fontSize(16).font("Helvetica-Bold").text(titulo);
  doc.moveDown(0.2);
  doc.fontSize(10).font("Helvetica").fillColor("#64748b").text(orgName);
  doc.text(periodo);
  doc.fillColor("#000000");
  doc.moveDown(1);
}

function linha(
  doc: PDFKit.PDFDocument,
  label: string,
  valor: number | null,
  currency: string,
  opts: { bold?: boolean; indent?: number } = {}
) {
  const x = doc.x + (opts.indent ?? 0) * 14;
  const width = 495 - (opts.indent ?? 0) * 14;
  doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
  const y = doc.y;
  doc.text(label, x, y, { width: width - 110, continued: false });
  if (valor !== null) {
    const cor = valor < 0 ? "#dc2626" : "#0f172a";
    doc.fillColor(cor).text(fmtMoney(valor, currency), doc.page.margins.left, y, {
      width: 495,
      align: "right",
    });
    doc.fillColor("#000000");
  }
  doc.moveDown(0.35);
}

function espaco(doc: PDFKit.PDFDocument, altura = 0.5) {
  doc.moveDown(altura);
}

export function desenharDre(doc: PDFKit.PDFDocument, dre: Dre, currency: string, orgName: string) {
  cabecalho(doc, "DRE — Demonstração do Resultado do Exercício", orgName, `${fmtDate(dre.periodoInicio)} a ${fmtDate(dre.periodoFim)}`);
  linha(doc, "Receita Bruta", dre.receitaBruta, currency);
  linha(doc, "(-) Deduções da Receita", -dre.deducoes, currency, { indent: 1 });
  linha(doc, "= Receita Líquida", dre.receitaLiquida, currency, { bold: true });
  linha(doc, "(-) Custos", -dre.custos, currency, { indent: 1 });
  linha(doc, "= Lucro Bruto", dre.lucroBruto, currency, { bold: true });
  linha(doc, "(-) Despesas Operacionais", -dre.despesasOperacionais, currency, { indent: 1 });
  linha(doc, "= Resultado Operacional", dre.resultadoOperacional, currency, { bold: true });
  linha(doc, "(+) Receitas Financeiras", dre.receitasFinanceiras, currency, { indent: 1 });
  linha(doc, "(-) Despesas Financeiras", -dre.despesasFinanceiras, currency, { indent: 1 });
  linha(doc, "(+/-) Outras Receitas/Despesas", dre.outras, currency, { indent: 1 });
  linha(doc, "= Resultado Antes dos Impostos", dre.resultadoAntesImpostos, currency, { bold: true });
  linha(doc, "(-) Impostos sobre o Lucro", -dre.impostosSobreLucro, currency, { indent: 1 });
  espaco(doc, 0.2);
  linha(doc, "Lucro/Prejuízo Líquido do Período", dre.lucroLiquido, currency, { bold: true });
}

export function desenharBalanco(doc: PDFKit.PDFDocument, b: Balanco, currency: string, orgName: string) {
  cabecalho(doc, "Balanço Patrimonial", orgName, `Posição em ${fmtDate(b.data)}`);

  linha(doc, "ATIVO", null, currency, { bold: true });
  linha(doc, "Ativo Circulante", b.ativoCirculante, currency, { indent: 1, bold: true });
  for (const c of b.contasAtivoCirculante) linha(doc, `${c.code} · ${c.name}`, c.saldo, currency, { indent: 2 });
  linha(doc, "Ativo Não Circulante", b.ativoNaoCirculante, currency, { indent: 1, bold: true });
  for (const c of b.contasAtivoNaoCirculante) linha(doc, `${c.code} · ${c.name}`, c.saldo, currency, { indent: 2 });
  linha(doc, "Total do Ativo", b.ativoTotal, currency, { bold: true });
  espaco(doc);

  linha(doc, "PASSIVO", null, currency, { bold: true });
  linha(doc, "Passivo Circulante", b.passivoCirculante, currency, { indent: 1, bold: true });
  for (const c of b.contasPassivoCirculante) linha(doc, `${c.code} · ${c.name}`, c.saldo, currency, { indent: 2 });
  linha(doc, "Passivo Não Circulante", b.passivoNaoCirculante, currency, { indent: 1, bold: true });
  for (const c of b.contasPassivoNaoCirculante) linha(doc, `${c.code} · ${c.name}`, c.saldo, currency, { indent: 2 });
  linha(doc, "Total do Passivo", b.passivoTotal, currency, { bold: true });
  espaco(doc);

  linha(doc, "PATRIMÔNIO LÍQUIDO", null, currency, { bold: true });
  for (const c of b.contasPl) linha(doc, `${c.code} · ${c.name}`, c.saldo, currency, { indent: 2 });
  linha(doc, "Resultado do Exercício (ainda não fechado)", b.resultadoDoExercicio, currency, { indent: 1 });
  linha(doc, "Total do Patrimônio Líquido", b.patrimonioLiquido, currency, { bold: true });
  espaco(doc);
  linha(doc, "Total Passivo + PL", b.passivoMaisPl, currency, { bold: true });
  linha(doc, "Diferença (deve ser 0)", b.diferenca, currency);
}

export function desenharDfc(doc: PDFKit.PDFDocument, dfc: Dfc, currency: string, orgName: string) {
  cabecalho(doc, "DFC — Demonstração do Fluxo de Caixa", orgName, `${fmtDate(dfc.periodoInicio)} a ${fmtDate(dfc.periodoFim)}`);
  linha(doc, "Saldo Inicial de Caixa", dfc.saldoInicialCaixa, currency, { bold: true });
  linha(doc, "Atividades Operacionais", dfc.operacional, currency, { indent: 1 });
  linha(doc, "Atividades de Investimento", dfc.investimento, currency, { indent: 1 });
  linha(doc, "Atividades de Financiamento", dfc.financiamento, currency, { indent: 1 });
  linha(doc, "Variação de Caixa no Período", dfc.variacaoCaixa, currency, { bold: true });
  espaco(doc, 0.2);
  linha(doc, "Saldo Final de Caixa", dfc.saldoFinalCaixa, currency, { bold: true });
}

export function desenharDmpl(doc: PDFKit.PDFDocument, dmpl: Dmpl, currency: string, orgName: string) {
  cabecalho(doc, "DMPL — Mutações do Patrimônio Líquido", orgName, `${fmtDate(dmpl.periodoInicio)} a ${fmtDate(dmpl.periodoFim)}`);
  linha(doc, "Saldo Inicial", dmpl.saldoInicial, currency, { bold: true });
  linha(doc, "Aportes de Capital", dmpl.aportes, currency, { indent: 1 });
  linha(doc, "Distribuições / Retiradas", dmpl.distribuicoes, currency, { indent: 1 });
  linha(doc, "Resultado do Período", dmpl.resultadoPeriodo, currency, { indent: 1 });
  linha(doc, "Saldo Final", dmpl.saldoFinal, currency, { bold: true });

  if (dmpl.contas.length > 0) {
    espaco(doc);
    doc.font("Helvetica-Bold").fontSize(11).text("Movimentação por conta");
    espaco(doc, 0.2);
    for (const c of dmpl.contas) {
      linha(doc, `${c.code} · ${c.name}`, c.saldoFinal, currency, { indent: 1 });
    }
  }
}

export async function buildDrePdf(dre: Dre, currency: string, orgName: string): Promise<Buffer> {
  const { doc, done } = novoDocumento();
  desenharDre(doc, dre, currency, orgName);
  doc.end();
  return done;
}

export async function buildBalancoPdf(b: Balanco, currency: string, orgName: string): Promise<Buffer> {
  const { doc, done } = novoDocumento();
  desenharBalanco(doc, b, currency, orgName);
  doc.end();
  return done;
}

export async function buildDfcPdf(dfc: Dfc, currency: string, orgName: string): Promise<Buffer> {
  const { doc, done } = novoDocumento();
  desenharDfc(doc, dfc, currency, orgName);
  doc.end();
  return done;
}

export async function buildDmplPdf(dmpl: Dmpl, currency: string, orgName: string): Promise<Buffer> {
  const { doc, done } = novoDocumento();
  desenharDmpl(doc, dmpl, currency, orgName);
  doc.end();
  return done;
}

export async function buildRelatorioCompletoPdf(
  args: { dre: Dre; balanco: Balanco; dfc: Dfc; dmpl: Dmpl },
  currency: string,
  orgName: string
): Promise<Buffer> {
  const { doc, done } = novoDocumento();
  desenharDre(doc, args.dre, currency, orgName);
  doc.addPage();
  desenharBalanco(doc, args.balanco, currency, orgName);
  doc.addPage();
  desenharDfc(doc, args.dfc, currency, orgName);
  doc.addPage();
  desenharDmpl(doc, args.dmpl, currency, orgName);
  doc.end();
  return done;
}


// =====================================================================
// Exportadores genéricos (Balancete e Razões) — operam sobre LinhaAnalise[]
// em vez dos tipos específicos de cada demonstração (Dre/Balanco/Dfc/Dmpl).
// Usam paisagem (landscape) porque a tabela comparativa tem até 7 colunas.
// =====================================================================

export type LinhaMovimentoPdf = {
  data: string;
  lancamentoNumero: number | string;
  historico: string;
  tipo: "D" | "C";
  valor: number;
  saldoCorrido: number;
};

function novoDocumentoPaisagem(): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  return { doc, done };
}

function fmtPctPdf(v: number | null): string {
  if (v == null) return "\u2014";
  return `${(v * 100).toFixed(1)}%`;
}

type Coluna = { texto: string; largura: number; align?: "left" | "right"; bold?: boolean; cor?: string };

function linhaColunas(doc: PDFKit.PDFDocument, colunas: Coluna[], opts: { bold?: boolean } = {}) {
  const y = doc.y;
  let x = doc.page.margins.left;
  for (const col of colunas) {
    doc
      .font(col.bold || opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor(col.cor ?? "#0f172a")
      .text(col.texto, x, y, { width: col.largura, align: col.align ?? "left" });
    x += col.largura;
  }
  doc.fillColor("#000000");
  doc.moveDown(0.35);
}

export function desenharLinhasAnalise(
  doc: PDFKit.PDFDocument,
  opts: {
    titulo: string;
    linhas: LinhaAnalise[];
    baseAV: number;
    baseAVAnterior: number;
    currency: string;
    orgName: string;
    periodo: string;
    comparar: boolean;
  }
) {
  const { titulo, linhas, baseAV, baseAVAnterior, currency, orgName, periodo, comparar } = opts;
  cabecalho(doc, titulo, orgName, periodo);

  const largLabel = comparar ? 200 : 380;
  const largNum = comparar ? 85 : 100;
  const largPct = comparar ? 55 : 65;

  const header: Coluna[] = comparar
    ? [
        { texto: "Conta", largura: largLabel },
        { texto: "Valor", largura: largNum, align: "right" },
        { texto: "AV %", largura: largPct, align: "right" },
        { texto: "Período ant.", largura: largNum, align: "right" },
        { texto: "AV % ant.", largura: largPct, align: "right" },
        { texto: "Variação", largura: largNum, align: "right" },
        { texto: "AH %", largura: largPct, align: "right" },
      ]
    : [
        { texto: "Conta", largura: largLabel },
        { texto: "Valor", largura: largNum, align: "right" },
        { texto: "AV %", largura: largPct, align: "right" },
      ];
  linhaColunas(doc, header, { bold: true });
  doc.moveDown(0.1);

  for (const l of linhas) {
    const av = l.semAV ? null : calcAV(l.valor, baseAV);
    const avAnterior = l.semAV ? null : calcAV(l.valorAnterior ?? 0, baseAVAnterior);
    const variacao = comparar ? calcVariacao(l.valor, l.valorAnterior) : null;
    const negrito = l.subtotal || l.destaque;
    const label = l.indent ? `   ${l.label}` : l.label;
    const cols: Coluna[] = comparar
      ? [
          { texto: label, largura: largLabel, bold: negrito },
          { texto: fmtMoney(l.valor, currency), largura: largNum, align: "right", bold: negrito },
          { texto: fmtPctPdf(av), largura: largPct, align: "right" },
          {
            texto: l.valorAnterior == null ? "\u2014" : fmtMoney(l.valorAnterior, currency),
            largura: largNum,
            align: "right",
          },
          { texto: fmtPctPdf(avAnterior), largura: largPct, align: "right" },
          {
            texto: variacao == null ? "\u2014" : fmtMoney(variacao.absoluta, currency),
            largura: largNum,
            align: "right",
          },
          { texto: variacao == null ? "\u2014" : fmtPctPdf(variacao.pct), largura: largPct, align: "right" },
        ]
      : [
          { texto: label, largura: largLabel, bold: negrito },
          { texto: fmtMoney(l.valor, currency), largura: largNum, align: "right", bold: negrito },
          { texto: fmtPctPdf(av), largura: largPct, align: "right" },
        ];
    linhaColunas(doc, cols);
  }
}

export async function buildLinhasPdf(opts: {
  titulo: string;
  linhas: LinhaAnalise[];
  baseAV: number;
  baseAVAnterior: number;
  currency: string;
  orgName: string;
  periodo: string;
  comparar: boolean;
}): Promise<Buffer> {
  const { doc, done } = novoDocumentoPaisagem();
  desenharLinhasAnalise(doc, opts);
  doc.end();
  return done;
}

export async function buildRelatorioLinhasPdf(
  secoes: { titulo: string; linhas: LinhaAnalise[]; baseAV: number; baseAVAnterior: number }[],
  comum: { currency: string; orgName: string; periodo: string; comparar: boolean }
): Promise<Buffer> {
  const { doc, done } = novoDocumentoPaisagem();
  secoes.forEach((s, i) => {
    if (i > 0) doc.addPage();
    desenharLinhasAnalise(doc, { ...s, ...comum });
  });
  doc.end();
  return done;
}

export async function buildRazaoDetalhePdf(opts: {
  contaLabel: string;
  movimentos: LinhaMovimentoPdf[];
  currency: string;
  orgName: string;
  periodo: string;
}): Promise<Buffer> {
  const { contaLabel, movimentos, currency, orgName, periodo } = opts;
  const { doc, done } = novoDocumento();
  cabecalho(doc, contaLabel, orgName, periodo);

  const header: Coluna[] = [
    { texto: "Data", largura: 65 },
    { texto: "Nº Lçto", largura: 55 },
    { texto: "Histórico", largura: 190 },
    { texto: "Natureza", largura: 65, align: "right" },
    { texto: "Valor", largura: 60, align: "right" },
    { texto: "Saldo", largura: 60, align: "right" },
  ];
  linhaColunas(doc, header, { bold: true });
  doc.moveDown(0.1);

  for (const m of movimentos) {
    linhaColunas(doc, [
      { texto: fmtDate(m.data), largura: 65 },
      { texto: `#${m.lancamentoNumero}`, largura: 55 },
      { texto: m.historico, largura: 190 },
      { texto: m.tipo === "D" ? "Débito" : "Crédito", largura: 65, align: "right" },
      { texto: fmtMoney(m.valor, currency), largura: 60, align: "right" },
      { texto: fmtMoney(m.saldoCorrido, currency), largura: 60, align: "right", bold: true },
    ]);
  }

  doc.end();
  return done;
}
