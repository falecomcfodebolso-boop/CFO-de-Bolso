import Papa from "papaparse";
import ExcelJS from "exceljs";
import { ParseError } from "./parsers";

export type LinhasGenerico = { headers: string[]; linhas: string[][] };

function detectarTipoGenerico(nomeArquivo: string): "csv" | "xls" | null {
  const ext = nomeArquivo.toLowerCase().split(".").pop();
  if (ext === "csv") return "csv";
  if (ext === "xls" || ext === "xlsx") return "xls";
  return null;
}

/**
 * Leitor genérico de CSV/XLS/XLSX para a carga em massa de dados contábeis
 * pré-existentes (plano de contas, saldos, lançamentos). Diferente do
 * parser de extrato bancário (lib/import/parsers.ts), aqui não tentamos
 * adivinhar o significado de cada coluna — sempre assumimos que a primeira
 * linha é cabeçalho, e é o usuário (ou a sugestão automática) quem escolhe
 * qual coluna do arquivo corresponde a cada campo esperado.
 */
export async function lerArquivoGenerico(nomeArquivo: string, buffer: ArrayBuffer): Promise<LinhasGenerico> {
  const tipo = detectarTipoGenerico(nomeArquivo);
  if (!tipo) {
    throw new ParseError("Formato não suportado para esta importação — envie um arquivo .csv, .xls ou .xlsx.");
  }

  let todasLinhas: string[][];
  if (tipo === "csv") {
    const conteudo = Buffer.from(buffer).toString("utf-8");
    const resultado = Papa.parse<string[]>(conteudo.trim(), { skipEmptyLines: true });
    if (resultado.errors.length > 0 && resultado.data.length === 0) {
      throw new ParseError(`Não consegui ler o CSV: ${resultado.errors[0].message}`);
    }
    todasLinhas = resultado.data;
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ParseError("A planilha não tem nenhuma aba.");
    todasLinhas = [];
    sheet.eachRow((row) => {
      const valores = (row.values as unknown[]).slice(1); // exceljs usa índice 1-based
      todasLinhas.push(valores.map((v) => (v === null || v === undefined ? "" : String(v))));
    });
  }

  todasLinhas = todasLinhas.filter((l) => l && l.some((c) => String(c ?? "").trim() !== ""));
  if (todasLinhas.length < 2) {
    throw new ParseError("O arquivo precisa ter uma linha de cabeçalho e pelo menos uma linha de dados.");
  }

  const headers = todasLinhas[0].map((h) => String(h ?? "").trim());
  const linhas = todasLinhas.slice(1);
  return { headers, linhas };
}
