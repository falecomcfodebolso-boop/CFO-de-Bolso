// =====================================================================
// Posições (quantidade, valor de mercado, juros acruados) lidas do
// Statement mensal do custodiante — usadas para manter a Carteira e a
// Agenda de Vencimentos na mesma data-base da contabilidade.
//
// Este arquivo só trabalha sobre o TEXTO já extraído do PDF (pdf-parse),
// para poder ser testado sem PDF. A leitura do PDF fica em
// lib/portfolio/posicoes-extrato.ts.
//
// Dois formatos:
//  - Itaú Private Bank ("Statement"): cada posição termina numa linha-âncora
//    "<G/L> <juros acruados|0.00> <yield|->" (renda fixa) ou
//    "<G/L> <% mensal> <% carteira>" (Alternatives/Equities). O "Market Value
//    (USD)" está sempre 3 linhas antes da âncora e, na renda fixa, JÁ INCLUI
//    os juros acruados (ex.: HSBC 200.000 × 99,97% = 199.940 + 3.840,28 de
//    juros = 203.780,28). Aqui guardamos o valor LIMPO (sem juros), para ficar
//    comparável com o formato Pershing.
//  - Pershing (Bradesco Bank International): "Security Identifier: <CUSIP>"
//    seguido de uma ou mais linhas de lote "data qtd custo-unit custo preço
//    valor-mercado G/L [juros renda yield]". O valor de mercado já é limpo.
// =====================================================================

export type PosicaoExtrato = {
  /** Nome tal como aparece no extrato. */
  nome: string;
  /** ISIN (quando o extrato traz). */
  isin: string | null;
  /** CUSIP / Security Identifier (só no formato Pershing). */
  cusip: string | null;
  /** Quantidade (para títulos de renda fixa, é o valor de face). */
  quantidade: number | null;
  /** Preço unitário de mercado informado pelo custodiante. */
  precoMercado: number | null;
  /** Valor de mercado LIMPO (sem juros acruados), em USD. */
  valorMercado: number;
  /** Juros acruados informados pelo custodiante (0 quando não há). */
  jurosAcruados: number;
};

export type FormatoPosicoes = "itau" | "pershing";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (raw: string) => parseFloat(raw.replace(/[$,]/g, ""));

// ------------------------------ Itaú ------------------------------
const RE_ITAU_HEADER = /^FIXED INCOME Currency/;
const RE_ITAU_ACCRUED_ROW = /^(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+([\d.]+%|-)$/;
const RE_ITAU_ALT_ROW = /^(-?[\d,]+\.\d{2})\s+(-?[\d.]+%)\s+(-?[\d.]+%)$/;
const RE_ITAU_ISIN = /^ISIN:\s*(\S+)/;
const RE_ITAU_QTD = /^([\d,]+(?:\.\d+)?)\s+([\d,]+\.\d{2})$/;
const RE_MONEY = /^-?[\d,]+\.\d{2}$/;
const RE_NUM = /^-?[\d,]*\d(\.\d+)?$/;

const ITAU_CAMPOS: RegExp[] = [
  /^Coupon Rate:/,
  /^ISIN:/,
  /^Country of the issuer/,
  /^(USD|EUR|BRL|GBP)$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}(\s+(USD|EUR|BRL|GBP))?$/,
  /^-?[\d,]*\d(\.\d+)?$/,
  /^-?[\d,]+\.\d{2}$/,
  RE_ITAU_QTD,
  RE_ITAU_ACCRUED_ROW,
  RE_ITAU_ALT_ROW,
  /^([\d.]+%|-)$/,
  /^-?[\d.]+%\s+[\d.]+%$/,
];

function ehCampoItau(linha: string) {
  return linha === "" || ITAU_CAMPOS.some((re) => re.test(linha));
}

export function parsePosicoesItauTexto(texto: string): PosicaoExtrato[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const inicio = linhas.findIndex((l) => RE_ITAU_HEADER.test(l));
  if (inicio === -1) return [];

  const posicoes: PosicaoExtrato[] = [];
  for (let i = inicio; i < linhas.length; i++) {
    const acc = RE_ITAU_ACCRUED_ROW.exec(linhas[i]);
    const alt = acc ? null : RE_ITAU_ALT_ROW.exec(linhas[i]);
    if (!acc && !alt) continue;

    const mv = linhas[i - 3];
    const preco = linhas[i - 2];
    if (!mv || !RE_MONEY.test(mv)) continue;

    let isin: string | null = null;
    let quantidade: number | null = null;
    let nome: string | null = null;
    for (let j = i - 1; j >= Math.max(inicio, i - 20); j--) {
      const l = linhas[j];
      const mi = RE_ITAU_ISIN.exec(l);
      if (mi) isin = mi[1];
      const mq = RE_ITAU_QTD.exec(l);
      if (mq && quantidade == null) quantidade = num(mq[1]);
      if (!ehCampoItau(l)) {
        nome = l;
        break;
      }
    }
    if (!nome || quantidade == null) continue; // bloco não reconhecido — melhor ignorar do que adivinhar

    const juros = acc ? num(acc[2]) : 0;
    posicoes.push({
      nome,
      isin,
      cusip: null,
      quantidade,
      precoMercado: preco && RE_NUM.test(preco) ? num(preco) : null,
      valorMercado: r2(num(mv) - juros),
      jurosAcruados: r2(juros),
    });
  }
  return posicoes;
}

// ----------------------------- Pershing -----------------------------
const RE_P_SEC_ID = /^Security Identifier:\s*(\S+)/;
const RE_P_ROW =
  /^(\d{2}\/\d{2}\/\d{2})[\d,]*\s+([\d,]+\.\d{4})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{2})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})(?:\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+([\d.]+)%)?$/;
const RE_P_ISIN_INLINE = /ISIN#(\S+)/;
const RE_P_FIM_BLOCO = /^(TOTAL\s|Total Corporate|Total$)/;
const P_PARADA: RegExp[] = [
  /^Original Cost Basis:/,
  /^Corporate Bonds/,
  /^Total/,
  /^TOTAL/,
  /^-- \d+ of \d+ --$/,
  /-SD$/,
  /Account Number:/,
  /^Page \d+ of \d+$/,
  /^Portfolio Holdings/,
  /^Date Acquired/,
  /^Current$/,
  /^Cost Basis/,
  /^Unrealized$/,
  /^Gain\/Loss$/,
  /^Accrued$/,
  /^Interest$/,
  /^Estimated$/,
  /^Annual Income$/,
  /^Yield$/,
  /^FIXED INCOME/,
  /^EXCHANGE-TRADED/,
  /^EQUITIES/,
  /^MUTUAL FUNDS/,
  /% of Portfolio/,
  /^[A-Za-z]+ \d{1,2}, \d{4} - [A-Za-z]+ \d{1,2}, \d{4}$/,
  /^PERSONAL OVERSEAS/,
  RE_P_ROW,
  RE_P_SEC_ID,
];
const P_IGNORAR_NO_NOME = [/^Dividend Option:/, /^CUSIP:/];

export function parsePosicoesPershingTexto(texto: string): PosicaoExtrato[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const idx: number[] = [];
  linhas.forEach((l, i) => {
    if (RE_P_SEC_ID.test(l)) idx.push(i);
  });

  const posicoes: PosicaoExtrato[] = [];
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k];
    const cusip = RE_P_SEC_ID.exec(linhas[i])![1];
    const limite = k + 1 < idx.length ? idx[k + 1] : linhas.length;

    const partes: string[] = [];
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const l = linhas[j];
      if (P_IGNORAR_NO_NOME.some((re) => re.test(l))) continue;
      if (l === "" || P_PARADA.some((re) => re.test(l))) break;
      partes.unshift(l);
    }
    const nome = partes.join(" ").trim();
    if (!nome) continue;

    let quantidade = 0;
    let valorMercado = 0;
    let juros = 0;
    let preco: number | null = null;
    let lotes = 0;
    for (let j = i + 1; j < limite; j++) {
      const l = linhas[j];
      if (RE_P_FIM_BLOCO.test(l) && lotes > 0 && /^TOTAL\s/.test(l)) break;
      const m = RE_P_ROW.exec(l);
      if (!m) continue;
      lotes++;
      quantidade += num(m[2]);
      preco = num(m[5]);
      valorMercado += num(m[6]);
      if (m[8]) juros += num(m[8]);
    }
    if (lotes === 0) continue;

    posicoes.push({
      nome,
      isin: RE_P_ISIN_INLINE.exec(nome)?.[1] ?? null,
      cusip,
      quantidade: Math.round(quantidade * 10000) / 10000,
      precoMercado: preco,
      valorMercado: r2(valorMercado),
      jurosAcruados: r2(juros),
    });
  }
  return posicoes;
}

// ----------------------------- datas-base -----------------------------
const MESES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/** Data-base da posição. Itaú: a mais recente "Last Price Date"/"Market Value as of" ≤ fim do mês do extrato. */
export function dataBaseItau(texto: string): string | null {
  const m = [...texto.matchAll(/Market Value as of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map(
    (x) => `${x[3]}-${x[2].padStart(2, "0")}-${x[1].padStart(2, "0")}`
  );
  return m.sort().at(-1) ?? null;
}

export function dataBasePershing(texto: string): string | null {
  const m = texto.match(/[A-Za-z]+ \d{1,2}, \d{4} - ([A-Za-z]+) (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const mes = MESES[m[1].toLowerCase()];
  return mes ? `${m[3]}-${mes}-${m[2].padStart(2, "0")}` : null;
}

export function parsePosicoesDeTexto(
  texto: string
): { formato: FormatoPosicoes; dataBase: string | null; posicoes: PosicaoExtrato[] } | null {
  if (/^FIXED INCOME Currency/m.test(texto)) {
    return { formato: "itau", dataBase: dataBaseItau(texto), posicoes: parsePosicoesItauTexto(texto) };
  }
  if (/^Security Identifier:/m.test(texto)) {
    return { formato: "pershing", dataBase: dataBasePershing(texto), posicoes: parsePosicoesPershingTexto(texto) };
  }
  return null;
}
