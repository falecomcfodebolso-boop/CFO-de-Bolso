import Papa from "papaparse";
import ExcelJS from "exceljs";
// IMPORTANTE: "pdf-parse" (via pdfjs-dist) referencia globais de navegador
// (DOMMatrix, ImageData, Path2D) que não existem no runtime Node.js da
// Vercel. Se importado no topo do arquivo, o simples carregamento do
// módulo derruba com "ReferenceError: DOMMatrix is not defined" — e isso
// quebra a rota de importação inteira, mesmo para OFX/CSV/XLS que nunca
// chegam a usar essa lib. Por isso o import é feito de forma dinâmica,
// só dentro de parsePDF, quando o arquivo realmente é um PDF.

/**
 * Uma transação normalizada extraída de um extrato bancário, independente
 * do formato de origem (OFX/CSV/XLS/PDF). `valor` é assinado: positivo =
 * entrada (dinheiro entrou na conta), negativo = saída.
 */
export type TransacaoExtraida = {
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
};

export class ParseError extends Error {}

function toIsoDate(day: string, month: string, year: string): string | null {
  const y = year.length === 2 ? `20${year}` : year;
  const d = day.padStart(2, "0");
  const m = month.padStart(2, "0");
  const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${y}-${m}-${d}`;
}

/** Aceita dd/mm/yyyy, dd-mm-yyyy ou yyyy-mm-dd. */
function parseDataFlexivel(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (m) return toIsoDate(m[1], m[2], m[3]);
  return null;
}

function parseValorFlexivel(raw: string): number | null {
  let s = raw.trim().replace(/^R\$\s*/i, "");
  const negativoParenteses = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "");
  // Formato BR (1.234,56) vs formato US (1,234.56): decide pelo último separador.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  s = s.replace(/[^\d.\-+]/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negativoParenteses ? -Math.abs(n) : n;
}

// ---------------------------------------------------------------------
// OFX — formato SGML usado por praticamente todos os bancos brasileiros
// para exportação de extrato ("Open Financial Exchange"). Em vez de
// depender de uma lib externa (o formato é simples o bastante e as libs
// disponíveis no npm são pouco mantidas), fazemos um parser leve baseado
// em regex sobre os blocos <STMTTRN>...</STMTTRN>.
// ---------------------------------------------------------------------
export function parseOFX(conteudo: string): TransacaoExtraida[] {
  const blocos = conteudo.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi);
  if (!blocos || blocos.length === 0) {
    throw new ParseError(
      "Não encontrei nenhuma transação (tag <STMTTRN>) no arquivo OFX. Confirme se é um extrato OFX válido."
    );
  }

  const extrairTag = (bloco: string, tag: string): string | null => {
    const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
    return m ? m[1].trim() : null;
  };

  const transacoes: TransacaoExtraida[] = [];
  for (const bloco of blocos) {
    const dtRaw = extrairTag(bloco, "DTPOSTED");
    const trnAmt = extrairTag(bloco, "TRNAMT");
    const memo = extrairTag(bloco, "MEMO") ?? extrairTag(bloco, "NAME") ?? "Transação";
    if (!dtRaw || !trnAmt) continue;

    // DTPOSTED vem como YYYYMMDDHHMMSS[-3:GMT] — usamos só os 8 primeiros dígitos.
    const ymd = dtRaw.match(/^(\d{4})(\d{2})(\d{2})/);
    const valor = parseFloat(trnAmt.replace(",", "."));
    if (!ymd || Number.isNaN(valor)) continue;

    transacoes.push({
      data: `${ymd[1]}-${ymd[2]}-${ymd[3]}`,
      descricao: memo,
      valor,
    });
  }

  if (transacoes.length === 0) {
    throw new ParseError("O arquivo OFX tem transações, mas não consegui ler data/valor de nenhuma delas.");
  }
  return transacoes;
}

// ---------------------------------------------------------------------
// Detecção de colunas (usada por CSV e XLS) — tenta reconhecer cabeçalhos
// comuns em português/inglês; se não achar um cabeçalho reconhecível,
// assume a ordem mais comum de extratos brasileiros: data, descrição, valor.
// ---------------------------------------------------------------------
function detectarColunas(header: string[]): { data: number; descricao: number; valor: number } | null {
  const norm = header.map((h) => h.trim().toLowerCase());
  const acha = (opcoes: string[]) => norm.findIndex((h) => opcoes.some((o) => h.includes(o)));

  const data = acha(["data", "date", "dt lancamento", "dt. lanc"]);
  const descricao = acha(["descri", "historico", "histórico", "memo", "lancamento", "lançamento", "description"]);
  const valor = acha(["valor", "amount", "value", "montante"]);

  if (data === -1 || descricao === -1 || valor === -1) return null;
  return { data, descricao, valor };
}

function linhasParaTransacoes(linhas: string[][]): TransacaoExtraida[] {
  if (linhas.length === 0) {
    throw new ParseError("O arquivo está vazio.");
  }

  let inicio = 0;
  let colunas = detectarColunas(linhas[0]);
  if (colunas) {
    inicio = 1; // primeira linha era cabeçalho
  } else {
    // Sem cabeçalho reconhecível: assume ordem [data, descrição, valor, ...]
    colunas = { data: 0, descricao: 1, valor: 2 };
  }

  const transacoes: TransacaoExtraida[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha || linha.every((c) => !String(c ?? "").trim())) continue;

    const dataRaw = String(linha[colunas.data] ?? "");
    const descricaoRaw = String(linha[colunas.descricao] ?? "").trim();
    const valorRaw = String(linha[colunas.valor] ?? "");

    const data = parseDataFlexivel(dataRaw);
    const valor = parseValorFlexivel(valorRaw);
    if (!data || valor === null || !descricaoRaw) continue;

    transacoes.push({ data, descricao: descricaoRaw, valor });
  }

  if (transacoes.length === 0) {
    throw new ParseError(
      "Não consegui reconhecer nenhuma linha como transação. Confira se o arquivo tem colunas de data, descrição e valor."
    );
  }
  return transacoes;
}

export function parseCSV(conteudo: string): TransacaoExtraida[] {
  const resultado = Papa.parse<string[]>(conteudo.trim(), { skipEmptyLines: true });
  if (resultado.errors.length > 0 && resultado.data.length === 0) {
    throw new ParseError(`Não consegui ler o CSV: ${resultado.errors[0].message}`);
  }
  return linhasParaTransacoes(resultado.data);
}

export async function parseXLS(buffer: ArrayBuffer): Promise<TransacaoExtraida[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ParseError("A planilha não tem nenhuma aba.");

  const linhas: string[][] = [];
  sheet.eachRow((row) => {
    const valores = (row.values as unknown[]).slice(1); // sheet.js/exceljs usa índice 1-based
    linhas.push(valores.map((v) => (v === null || v === undefined ? "" : String(v))));
  });

  return linhasParaTransacoes(linhas);
}

// ---------------------------------------------------------------------
// PDF — só suporta PDFs "digitais" (texto selecionável, gerados direto
// pelo internet banking). PDFs escaneados/fotografados exigiriam OCR, que
// não está implementado neste protótipo.
// ---------------------------------------------------------------------
const LINHA_PDF_REGEX =
  /(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})\s+(.+?)\s+(\(?-?\s?(?:R\$)?\s?-?[\d.,]*\d\)?)\s*$/;

export async function parsePDF(buffer: ArrayBuffer): Promise<TransacaoExtraida[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(buffer) });
  let texto: string;
  try {
    const resultado = await parser.getText();
    texto = resultado.text;
  } finally {
    await parser.destroy();
  }

  if (!texto || texto.trim().length < 10) {
    throw new ParseError(
      "O PDF não retornou nenhum texto — provavelmente é um extrato escaneado/fotografado, que este protótipo ainda não suporta (precisaria de OCR). Tente exportar em OFX ou CSV pelo internet banking."
    );
  }

  const transacoes: TransacaoExtraida[] = [];
  for (const linhaBruta of texto.split(/\r?\n/)) {
    const m = linhaBruta.match(LINHA_PDF_REGEX);
    if (!m) continue;
    const data = parseDataFlexivel(m[1]);
    const valor = parseValorFlexivel(m[3]);
    const descricao = m[2].trim();
    if (!data || valor === null || !descricao) continue;
    transacoes.push({ data, descricao, valor });
  }

  if (transacoes.length === 0) {
    throw new ParseError(
      "Consegui ler o texto do PDF, mas não reconheci nenhuma linha no formato \"data ... descrição ... valor\". O layout desse extrato pode ser diferente do esperado — tente OFX ou CSV, que são mais confiáveis."
    );
  }
  return transacoes;
}

export type TipoArquivoImportacao = "ofx" | "csv" | "xls" | "pdf";

export function detectarTipoArquivo(nomeArquivo: string): TipoArquivoImportacao | null {
  const ext = nomeArquivo.toLowerCase().split(".").pop();
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "csv") return "csv";
  if (ext === "xls" || ext === "xlsx") return "xls";
  if (ext === "pdf") return "pdf";
  return null;
}

export async function parseArquivo(
  tipo: TipoArquivoImportacao,
  buffer: ArrayBuffer
): Promise<TransacaoExtraida[]> {
  switch (tipo) {
    case "ofx":
      return parseOFX(Buffer.from(buffer).toString("utf-8"));
    case "csv":
      return parseCSV(Buffer.from(buffer).toString("utf-8"));
    case "xls":
      return parseXLS(buffer);
    case "pdf":
      return parsePDF(buffer);
  }
}
