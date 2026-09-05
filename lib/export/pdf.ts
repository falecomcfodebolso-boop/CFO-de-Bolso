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
  const labelWidth = width - 110;
  const fonte = opts.bold ? "Helvetica-Bold" : "Helvetica";
  doc.font(fonte).fontSize(10);

  // Mede a altura real do rotulo (que pode quebrar em mais de uma linha
  // quando o nome da conta e longo) ANTES de desenhar, para saber quanto
  // espaco a linha inteira vai ocupar.
  const alturaLabel = doc.heightOfString(label, { width: labelWidth });
  const alturaValor = valor !== null ? doc.heightOfString(fmtMoney(valor, currency), { width: 495 }) : 0;
  const alturaLinha = Math.max(alturaLabel, alturaValor, doc.currentLineHeight());

  // Se a linha nao couber no espaco que resta na pagina, quebra a pagina
  // ANTES de desenhar — evita que o rotulo comece numa pagina e o valor
  // (ou o resto do rotulo) va parar na proxima.
  if (doc.y + alturaLinha > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }

  const y = doc.y;
  doc.font(fonte).fontSize(10).text(label, x, y, { width: labelWidth, continued: false });
  if (valor !== null) {
    const cor = valor < 0 ? "#dc2626" : "#0f172a";
    doc.fillColor(cor).text(fmtMoney(valor, currency), doc.page.margins.left, y, {
      width: 495,
      align: "right",
    });
    doc.fillColor("#000000");
  }
  // Avanca o cursor pela altura REAL da linha (a maior entre rotulo e
  // valor), nao por um valor fixo — e essa a correcao do bug.
  doc.y = y + alturaLinha;
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
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

type Coluna = { texto: string; largura: number; align?: "left" | "right"; bold?: boolean; cor?: string };

function linhaColunas(
  doc: PDFKit.PDFDocument,
  colunas: Coluna[],
  opts: { bold?: boolean; headerParaRepetir?: Coluna[] } = {}
) {
  const fonteDe = (col: Coluna) => (col.bold || opts.bold ? "Helvetica-Bold" : "Helvetica");

  // 1) Mede a altura real de CADA coluna (uma "Conta" longa pode quebrar
  //    em 2+ linhas) antes de desenhar qualquer coisa, para descobrir a
  //    altura da linha inteira (a maior entre as colunas). Sem isso, o
  //    cursor so avancava o suficiente para a ultima coluna desenhada —
  //    normalmente um numero curto de uma linha so — e a proxima linha
  //    da tabela acabava desenhada por cima do fim de uma "Conta" longa.
  doc.fontSize(9);
  let alturaLinha = doc.currentLineHeight();
  for (const col of colunas) {
    doc.font(fonteDe(col));
    const altura = doc.heightOfString(col.texto, { width: Math.max(col.largura - 6, 1) });
    if (altura > alturaLinha) alturaLinha = altura;
  }

  // 2) Se a linha nao couber no espaco que resta na pagina, quebra a
  //    pagina ANTES de desenhar qualquer coluna — evita que colunas de
  //    uma mesma linha acabem espalhadas em paginas diferentes — e
  //    repete o cabecalho da tabela no topo da nova pagina, quando
  //    fornecido, para nao perder o significado de cada coluna.
  if (doc.y + alturaLinha > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    if (opts.headerParaRepetir) {
      linhaColunas(doc, opts.headerParaRepetir, { bold: true });
      doc.moveDown(0.1);
    }
  }

  // 3) Desenha todas as colunas na MESMA posicao y — cada coluna e
  //    posicionada explicitamente, nunca dependendo de onde a coluna
  //    anterior deixou o cursor.
  const y = doc.y;
  let x = doc.page.margins.left;
  for (const col of colunas) {
    doc
      .font(fonteDe(col))
      .fontSize(9)
      .fillColor(col.cor ?? "#0f172a")
      .text(col.texto, x, y, { width: Math.max(col.largura - 6, 1), align: col.align ?? "left" });
    x += col.largura;
  }
  doc.fillColor("#000000");

  // 4) Avanca o cursor pela altura REAL da linha, nao por um valor fixo.
  doc.y = y + alturaLinha;
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
            texto: l.valorAnterior == null ? "—" : fmtMoney(l.valorAnterior, currency),
            largura: largNum,
            align: "right",
          },
          { texto: fmtPctPdf(avAnterior), largura: largPct, align: "right" },
          {
            texto: variacao == null ? "—" : fmtMoney(variacao.absoluta, currency),
            largura: largNum,
            align: "right",
          },
          { texto: variacao == null ? "—" : fmtPctPdf(variacao.pct), largura: largPct, align: "right" },
        ]
      : [
          { texto: label, largura: largLabel, bold: negrito },
          { texto: fmtMoney(l.valor, currency), largura: largNum, align: "right", bold: negrito },
          { texto: fmtPctPdf(av), largura: largPct, align: "right" },
        ];
    linhaColunas(doc, cols, { headerParaRepetir: header });
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
    linhaColunas(
      doc,
      [
        { texto: fmtDate(m.data), largura: 65 },
        { texto: `#${m.lancamentoNumero}`, largura: 55 },
        { texto: m.historico, largura: 190 },
        { texto: m.tipo === "D" ? "Débito" : "Crédito", largura: 65, align: "right" },
        { texto: fmtMoney(m.valor, currency), largura: 60, align: "right" },
        { texto: fmtMoney(m.saldoCorrido, currency), largura: 60, align: "right", bold: true },
      ],
      { headerParaRepetir: header }
    );
  }

  doc.end();
  return done;
}


// =====================================================================
// Ajustes de Acruamento — PDF do detalhamento por papel (uma seção por
// grupo) e do histórico de apurações. Estático (sem fórmulas — isso só
// existe na exportação em Excel), mas usa os mesmos números que a tela
// e a planilha mostram.
// =====================================================================

export type ItemAcruoPdf = {
  nome: string;
  categoriaLabel: string;
  valorFace: number | null;
  taxaEfetiva: number | null;
  tipoTaxa: "fixa" | "flutuante" | null;
  indiceReferencia: string | null;
  dataBase: string | null;
  dias: number | null;
  valorCalc: number | null;
  pendente: boolean;
};

export type GrupoAcruoPdf = {
  nomeGrupo: string;
  contaAcruo: string;
  contaReceita: string;
  itens: ItemAcruoPdf[];
  saldoContabilAtual: number;
  valorInformadoBanco: number | null;
  dataUltimoAjuste: string | null;
  diferenca: number | null;
};

export type ApuracaoHistoricoPdf = {
  dataBase: string;
  nomeGrupo: string;
  contaAcruoCode: string;
  saldoContabilAntes: number;
  valorReportadoBanco: number;
  acruoCalculadoInterno: number | null;
  diferenca: number;
  fonte: string | null;
  lancado: boolean;
};

export function desenharAjustesGrupo(
  doc: PDFKit.PDFDocument,
  grupo: GrupoAcruoPdf,
  currency: string,
  orgName: string,
  dataRef: string
) {
  cabecalho(
    doc,
    `Ajustes de Acruamento — ${grupo.nomeGrupo}`,
    orgName,
    `Referência: ${fmtDate(dataRef)} · conta(s): ${grupo.contaAcruo} · receita: ${grupo.contaReceita}`
  );

  const subtotal = grupo.itens.reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
  linha(doc, "Contábil atual", grupo.saldoContabilAtual, currency, { bold: true });
  linha(doc, "Calculado (interno, 30/360)", subtotal, currency, { bold: true });
  linha(
    doc,
    `Informado pelo banco${grupo.dataUltimoAjuste ? ` (${fmtDate(grupo.dataUltimoAjuste)})` : ""}`,
    grupo.valorInformadoBanco,
    currency,
    { bold: true }
  );
  if (grupo.diferenca != null) {
    linha(doc, "Diferença (calculado vs. banco)", grupo.diferenca, currency, { bold: true });
  }
  espaco(doc, 0.3);

  const largLabel = 170;
  const larguras = { categoria: 90, valor: 80, taxa: 60, data: 70, dias: 45, calc: 92, obs: 90 };
  const largGrupo1 = largLabel + larguras.categoria + larguras.valor + larguras.taxa + larguras.data + larguras.dias;

  const header: Coluna[] = [
    { texto: "Papel", largura: largLabel },
    { texto: "Categoria", largura: larguras.categoria },
    { texto: "Valor Face", largura: larguras.valor, align: "right" },
    { texto: "Taxa", largura: larguras.taxa, align: "right" },
    { texto: "Data Base", largura: larguras.data, align: "right" },
    { texto: "Dias", largura: larguras.dias, align: "right" },
    { texto: "Cálculo Interno", largura: larguras.calc, align: "right" },
    { texto: "Obs.", largura: larguras.obs },
  ];
  linhaColunas(doc, header, { bold: true });
  doc.moveDown(0.1);

  for (const i of grupo.itens) {
    linhaColunas(
      doc,
      [
        { texto: i.nome, largura: largLabel },
        { texto: i.categoriaLabel, largura: larguras.categoria },
        { texto: i.valorFace != null ? fmtMoney(i.valorFace, currency) : "—", largura: larguras.valor, align: "right" },
        {
          texto: i.taxaEfetiva != null ? `${(i.taxaEfetiva * 100).toFixed(3)}%` : "—",
          largura: larguras.taxa,
          align: "right",
        },
        { texto: i.dataBase ? fmtDate(i.dataBase) : "—", largura: larguras.data, align: "right" },
        { texto: i.dias != null ? String(i.dias) : "—", largura: larguras.dias, align: "right" },
        {
          texto: i.valorCalc != null ? fmtMoney(i.valorCalc, currency) : "— (usa extrato)",
          largura: larguras.calc,
          align: "right",
        },
        { texto: i.pendente ? "Pending no custodiante" : "", largura: larguras.obs },
      ],
      { headerParaRepetir: header }
    );
  }

  const temPendentes = grupo.itens.some((i) => i.pendente);
  if (temPendentes) {
    const subtotalConfirmado = grupo.itens.filter((i) => !i.pendente).reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
    const subtotalPendente = grupo.itens.filter((i) => i.pendente).reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
    linhaColunas(
      doc,
      [
        { texto: "Subtotal — confirmados pelo custodiante", largura: largGrupo1, bold: true },
        { texto: fmtMoney(subtotalConfirmado, currency), largura: larguras.calc, align: "right", bold: true },
        { texto: "", largura: larguras.obs },
      ],
      { headerParaRepetir: header }
    );
    linhaColunas(
      doc,
      [
        { texto: "Subtotal — pending receipt (sem valor do custodiante)", largura: largGrupo1, bold: true, cor: "#b45309" },
        { texto: fmtMoney(subtotalPendente, currency), largura: larguras.calc, align: "right", bold: true, cor: "#b45309" },
        { texto: "", largura: larguras.obs },
      ],
      { headerParaRepetir: header }
    );
  }
  linhaColunas(
    doc,
    [
      { texto: `Subtotal ${grupo.nomeGrupo}`, largura: largGrupo1, bold: true },
      { texto: fmtMoney(subtotal, currency), largura: larguras.calc, align: "right", bold: true },
      { texto: "", largura: larguras.obs },
    ],
    { headerParaRepetir: header }
  );
}

export function desenharAjustesHistorico(
  doc: PDFKit.PDFDocument,
  apuracoes: ApuracaoHistoricoPdf[],
  currency: string,
  orgName: string
) {
  cabecalho(doc, "Ajustes de Acruamento — Histórico de Apurações", orgName, "");

  const header: Coluna[] = [
    { texto: "Data-base", largura: 65 },
    { texto: "Grupo", largura: 150 },
    { texto: "Conta acruo", largura: 90 },
    { texto: "Contábil (antes)", largura: 85, align: "right" },
    { texto: "Banco/extrato", largura: 85, align: "right" },
    { texto: "Cálc. interno", largura: 80, align: "right" },
    { texto: "Diferença", largura: 80, align: "right" },
    { texto: "Fonte", largura: 100 },
    { texto: "Status", largura: 60, align: "right" },
  ];
  linhaColunas(doc, header, { bold: true });
  doc.moveDown(0.1);

  for (const a of apuracoes) {
    linhaColunas(
      doc,
      [
        { texto: fmtDate(a.dataBase), largura: 65 },
        { texto: a.nomeGrupo, largura: 150 },
        { texto: a.contaAcruoCode, largura: 90 },
        { texto: fmtMoney(a.saldoContabilAntes, currency), largura: 85, align: "right" },
        { texto: fmtMoney(a.valorReportadoBanco, currency), largura: 85, align: "right" },
        {
          texto: a.acruoCalculadoInterno != null ? fmtMoney(a.acruoCalculadoInterno, currency) : "—",
          largura: 80,
          align: "right",
        },
        {
          texto: fmtMoney(a.diferenca, currency),
          largura: 80,
          align: "right",
          cor: a.diferenca >= 0 ? "#047857" : "#dc2626",
        },
        { texto: a.fonte ?? "—", largura: 100 },
        { texto: a.lancado ? "Lançado" : "Pendente", largura: 60, align: "right" },
      ],
      { headerParaRepetir: header }
    );
  }
}

export async function buildAjustesPdf(
  grupos: GrupoAcruoPdf[],
  historico: ApuracaoHistoricoPdf[],
  currency: string,
  orgName: string,
  dataRef: string
): Promise<Buffer> {
  const { doc, done } = novoDocumentoPaisagem();
  grupos.forEach((g, i) => {
    if (i > 0) doc.addPage();
    desenharAjustesGrupo(doc, g, currency, orgName, dataRef);
  });
  if (historico.length > 0) {
    if (grupos.length > 0) doc.addPage();
    desenharAjustesHistorico(doc, historico, currency, orgName);
  }
  doc.end();
  return done;
}
