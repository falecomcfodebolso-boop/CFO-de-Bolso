// =====================================================================
// Nota de negociação (trade confirmation) — leitura por IA com visão.
//
// Aceita PDF ou foto (JPG/PNG/WEBP). Os layouts variam muito entre bancos
// (Itaú: "TRADE CONFIRMATION" com preço/taxa/total; Bradesco/Pershing:
// "Confirmation" com Principal/Interest/Commission/Fees/Net Amount em
// colunas, muitas vezes fotografada de lado), então em vez de um parser por
// layout a extração é feita pelo modelo, e o resultado passa por uma
// conferência aritmética (validarNota) antes de virar proposta.
// =====================================================================

export type TipoAtivoNota = "titulo" | "etf" | "fundo" | "acao";
export type BancoNota = "itau" | "bradesco" | "outro";

export type NotaNegociacao = {
  banco: BancoNota;
  operacao: "compra" | "venda";
  numeroNegocio: string | null;
  dataOperacao: string; // YYYY-MM-DD
  dataLiquidacao: string | null; // YYYY-MM-DD
  descricao: string;
  ticker: string | null;
  isin: string | null;
  cusip: string | null;
  tipoAtivo: TipoAtivoNota;
  /** Ações/cotas: nº de cotas. Títulos: valor de face. */
  quantidade: number;
  /** Ações/cotas: preço por cota. Títulos: preço em % do valor de face (ex.: 98.75). */
  preco: number;
  principal: number;
  jurosAcruados: number;
  comissao: number;
  taxas: number;
  valorLiquido: number;
  moeda: string;
  /** Só títulos: cupom anual em % (ex.: 5.6), vencimento e periodicidade do cupom. */
  taxaCupom: number | null;
  vencimento: string | null;
  periodicidade: "mensal" | "trimestral" | "semestral" | "anual" | null;
};

export type MidiaNota = { mediaType: string; base64: string };

export const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const PROMPT = `Você vai ler uma nota de negociação (trade confirmation) de um banco/corretora no exterior e devolver SOMENTE um objeto JSON, sem texto antes ou depois, com estes campos:

{
  "banco": "itau" | "bradesco" | "outro",        // Itaú/Banco Itaú International = itau; Bradesco/Bradesco Investments/Pershing/BAC Florida = bradesco
  "operacao": "compra" | "venda",                // "YOU BOUGHT"/"You Bought" = compra; "YOU SOLD" = venda
  "numeroNegocio": string | null,                // Deal Number / Trade Number
  "dataOperacao": "YYYY-MM-DD",                  // Trade Date
  "dataLiquidacao": "YYYY-MM-DD" | null,         // Settlement Date
  "descricao": string,                           // descrição do papel como está na nota
  "ticker": string | null,                       // ex.: "CSPX"
  "isin": string | null,                         // 12 caracteres (ex.: IE00B5BMR087), procure também "ISIN#"
  "cusip": string | null,                        // 9 caracteres
  "tipoAtivo": "titulo" | "etf" | "fundo" | "acao",  // bond/note/CLN = titulo; ETF/UCITS ETF = etf
  "quantidade": number,                          // nº de cotas; para títulos, o valor de face (ex.: 200000)
  "preco": number,                               // preço unitário; para títulos, em % do face (ex.: 98.75)
  "principal": number,                           // valor bruto da operação (quantidade × preço; títulos: face × preço/100)
  "jurosAcruados": number,                       // "Accrued Interest"/"Interest" pagos na compra; 0 se não houver
  "comissao": number,                            // Commission / Comm Equiv; 0 se não houver
  "taxas": number,                               // Transaction Fee + Service Charge + outras taxas; 0 se não houver
  "valorLiquido": number,                        // Settlement Net Amount / Net Amount (total debitado ou creditado)
  "moeda": string,                               // ex.: "USD"
  "taxaCupom": number | null,                    // só títulos: cupom anual em % (ex.: 5.6)
  "vencimento": "YYYY-MM-DD" | null,             // só títulos: data de vencimento
  "periodicidade": "mensal" | "trimestral" | "semestral" | "anual" | null  // só títulos, se a nota indicar
}

Regras:
- Números sem separador de milhar e com ponto decimal (54044.25, não "54,044.25").
- Datas: "20/OCT/26" = 2026-10-20. Em notas americanas (Bradesco/Pershing) "10-19-26" é MÊS-DIA-ANO = 2026-10-19.
- A imagem pode estar fotografada de lado ou inclinada; leia com atenção os valores de cada coluna.
- Não invente: campo ausente = null (ou 0 nos valores monetários de juros/comissão/taxas).`;

export class NotaError extends Error {}

function extrairJsonObjeto(texto: string): unknown {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini === -1 || fim <= ini) throw new NotaError("A leitura da nota não retornou dados reconhecíveis.");
  return JSON.parse(texto.slice(ini, fim + 1));
}

const num = (v: unknown) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const dataISO = (v: unknown) => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export function normalizarNota(bruto: Record<string, unknown>): NotaNegociacao {
  const banco = (["itau", "bradesco"].includes(String(bruto.banco)) ? bruto.banco : "outro") as BancoNota;
  const tipo = (["titulo", "etf", "fundo", "acao"].includes(String(bruto.tipoAtivo)) ? bruto.tipoAtivo : "etf") as TipoAtivoNota;
  const per = ["mensal", "trimestral", "semestral", "anual"].includes(String(bruto.periodicidade))
    ? (bruto.periodicidade as NotaNegociacao["periodicidade"])
    : null;
  const dataOperacao = dataISO(bruto.dataOperacao);
  if (!dataOperacao) throw new NotaError("Não consegui identificar a data da operação na nota.");
  const isin = str(bruto.isin)?.toUpperCase().replace(/\s/g, "") ?? null;
  const cusip = str(bruto.cusip)?.toUpperCase().replace(/[\s-]/g, "") ?? null;
  return {
    banco,
    operacao: bruto.operacao === "venda" ? "venda" : "compra",
    numeroNegocio: str(bruto.numeroNegocio),
    dataOperacao,
    dataLiquidacao: dataISO(bruto.dataLiquidacao),
    descricao: str(bruto.descricao) ?? "Papel sem descrição",
    ticker: str(bruto.ticker),
    isin: isin && isin.length === 12 ? isin : null,
    cusip: cusip && cusip.length === 9 ? cusip : null,
    tipoAtivo: tipo,
    quantidade: num(bruto.quantidade),
    preco: num(bruto.preco),
    principal: num(bruto.principal),
    jurosAcruados: num(bruto.jurosAcruados),
    comissao: num(bruto.comissao),
    taxas: num(bruto.taxas),
    valorLiquido: num(bruto.valorLiquido),
    moeda: str(bruto.moeda) ?? "USD",
    taxaCupom: bruto.taxaCupom == null ? null : num(bruto.taxaCupom),
    vencimento: dataISO(bruto.vencimento),
    periodicidade: per,
  };
}

/** Conferência aritmética da nota. Retorna avisos (vazio = tudo bate). */
export function validarNota(n: NotaNegociacao): string[] {
  const avisos: string[] = [];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const principalCalc = n.tipoAtivo === "titulo" ? (n.quantidade * n.preco) / 100 : n.quantidade * n.preco;
  if (n.quantidade > 0 && n.preco > 0 && Math.abs(principalCalc - n.principal) > Math.max(1, n.principal * 0.0005)) {
    avisos.push(
      `Quantidade × preço = ${r2(principalCalc).toFixed(2)}, mas o principal lido é ${n.principal.toFixed(2)}. Confira quantidade, preço e principal.`
    );
  }
  const custos = n.jurosAcruados + n.comissao + n.taxas;
  const liquidoCalc = n.operacao === "compra" ? n.principal + custos : n.principal + n.jurosAcruados - n.comissao - n.taxas;
  if (Math.abs(liquidoCalc - n.valorLiquido) > 0.02) {
    avisos.push(
      `Principal ${n.operacao === "compra" ? "+" : "±"} juros/comissão/taxas = ${r2(liquidoCalc).toFixed(2)}, mas o valor líquido lido é ${n.valorLiquido.toFixed(2)}. Confira os valores.`
    );
  }
  if (!n.isin && !n.cusip) avisos.push("A nota não trouxe ISIN nem CUSIP — confira se o papel foi identificado corretamente.");
  if (n.tipoAtivo === "titulo" && (!n.vencimento || n.taxaCupom == null)) {
    avisos.push("Título sem vencimento ou cupom na nota — preencha antes de confirmar, para o acruo e a agenda funcionarem.");
  }
  return avisos;
}

/** Lê a nota (PDF ou foto) com o modelo da Anthropic. */
export async function extrairNotaComIA(midia: MidiaNota): Promise<NotaNegociacao> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NotaError("A chave da IA (ANTHROPIC_API_KEY) não está configurada — não dá para ler a nota.");

  const bloco =
    midia.mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: midia.base64 } }
      : { type: "image", source: { type: "base64", media_type: midia.mediaType, data: midia.base64 } };

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: [bloco, { type: "text", text: PROMPT }] }],
    }),
  });
  if (!resp.ok) {
    const corpo = await resp.text().catch(() => "");
    console.error("[extrairNotaComIA]", resp.status, corpo.slice(0, 500));
    if (resp.status === 401) throw new NotaError("A chave da IA foi recusada (401). Troque a ANTHROPIC_API_KEY na Vercel.");
    if (resp.status === 413 || /too large|exceeds/i.test(corpo)) {
      throw new NotaError("O arquivo é grande demais para leitura. Envie uma foto menor ou o PDF da nota.");
    }
    throw new NotaError(`Falha na leitura da nota pela IA (${resp.status}).`);
  }
  const json = await resp.json();
  const texto: string = json.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
  return normalizarNota(extrairJsonObjeto(texto) as Record<string, unknown>);
}
