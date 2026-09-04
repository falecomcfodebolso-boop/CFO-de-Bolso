import { extrairTextoPdf } from "@/lib/import/parsers";

export class ParseAcruoError extends Error {}

export type EntradaAcruoExtrato = {
  /** Nome do papel tal como aparece no extrato (linha de descrição da posição). */
  nome: string;
  /** ISIN do papel, quando o extrato traz um (alguns floaters/discount notes não trazem). */
  isin: string | null;
  /** Juros acruados informados pelo custodiante para esse papel, na data-base do extrato. */
  accruedInterest: number;
};

export type ExtratoAcruoParseado = {
  /** Data-base do extrato (a mais recente entre as "Market Value as of ..." encontradas, ou o fim do período no formato Pershing), YYYY-MM-DD. */
  dataBase: string | null;
  entradas: EntradaAcruoExtrato[];
  /** Qual custodiante/formato foi reconhecido — usado só pra rotular a fonte na tela de importação. */
  formato: "itau" | "pershing";
};

// Cada posição de renda fixa no "Statement" do Itaú Private Bank ocupa um bloco de linhas
// (nome, opcionalmente "Coupon Rate: ...", opcionalmente "ISIN: ...", "Country of the issuer",
// moeda, taxa de câmbio, quantidade+custo médio, preço médio, data de abertura, valor de
// mercado, preço unitário, data do último preço, e por fim a linha com
// "<ganho/perda não realizado> <juros acruados> <yield de compra>") — extraído via pdf-parse,
// que emite uma linha por campo (não uma linha por "coluna visual" como outras ferramentas de
// extração de PDF). O ponto fixo mais confiável em todo bloco é essa última linha numérica (o
// "accrued row"): a partir dela, andamos pra trás até achar a primeira linha que não é um dos
// campos conhecidos — essa é o nome do papel — capturando o ISIN pelo caminho, se houver.
const RE_ACCRUED_ROW = /^(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+([\d.]+%|-)$/;
const RE_ISIN = /^ISIN:\s*(\S+)/;
const RE_FIXED_INCOME_HEADER = /^FIXED INCOME Currency/;
const RE_FIXED_INCOME_TOTAL = /^Total\s+[\d,]+\.\d{2}\s+-?[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d.]+%$/;

const FIELD_LINE_REGEXES: RegExp[] = [
  /^Coupon Rate:/,
  /^ISIN:/,
  /^Country of the issuer/,
  /^(USD|EUR|BRL|GBP)$/,
  /^-?\d+(\.\d+)?$/,
  /^\d{1,2}\/\d{1,2}\/\d{4}$/,
  /^-?[\d,]+\.\d{2}$/,
  /^[\d,]+(\.\d+)?\s+[\d,]+\.\d{2}$/,
  RE_ACCRUED_ROW,
  /^([\d.]+%|-)$/,
  /^-?[\d.]+%\s+[\d.]+%$/,
  /^(Treasury|US Corporate Bonds|Emerging Market Debt.*|High Yield Developed Markets|FIXED INCOME.*|Currency|Exchange|Rate|Quantity Average Cost Value|Average Cost Price|Position Opening Date|Market Value \(USD\)|Unit Market Price|Last Price Date|Unrealized Gain\/Loss Accrued Interest Purchase Yield %|Current Yield %|Monthly Gain % % of|Portfolio|Total\s.*)$/,
];

function ehLinhaDeCampo(linha: string): boolean {
  if (linha === "") return true;
  return FIELD_LINE_REGEXES.some((re) => re.test(linha));
}

function parseValor(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

/** Data mais recente entre "Market Value as of DD/MM/YYYY" (a última é sempre a data-base atual). */
function extrairDataBase(texto: string): string | null {
  const matches = [...texto.matchAll(/Market Value as of\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g)];
  if (matches.length === 0) return null;
  const datas = matches.map((m) => {
    const dia = m[1].padStart(2, "0");
    const mes = m[2].padStart(2, "0");
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${mes}-${dia}`;
  });
  return datas.sort().at(-1) ?? null;
}

function parseEntradasItau(linhas: string[]): EntradaAcruoExtrato[] {
  const startIdx = linhas.findIndex((l) => RE_FIXED_INCOME_HEADER.test(l));
  if (startIdx === -1) return [];
  let endIdx = linhas.findIndex((l, i) => i > startIdx && RE_FIXED_INCOME_TOTAL.test(l));
  if (endIdx === -1) endIdx = linhas.length;

  const entradas: EntradaAcruoExtrato[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    const m = RE_ACCRUED_ROW.exec(linhas[i]);
    if (!m) continue;

    let isin: string | null = null;
    let nomeIdx = -1;
    for (let j = i - 1; j >= Math.max(startIdx, i - 20); j--) {
      const linha = linhas[j];
      const isinMatch = RE_ISIN.exec(linha);
      if (isinMatch) isin = isinMatch[1];
      if (!ehLinhaDeCampo(linha)) {
        nomeIdx = j;
        break;
      }
    }
    if (nomeIdx === -1) continue; // bloco não reconhecido — ignora em vez de adivinhar

    entradas.push({
      nome: linhas[nomeIdx],
      isin,
      accruedInterest: parseValor(m[2]),
    });
  }
  return entradas;
}

// =====================================================================
// Formato "Pershing" — usado pelo Statement do Bradesco Bank International
// (conta de custódia 3GM-..., seção "Portfolio Holdings" / "FIXED INCOME/
// DEBT SECURITIES"). Layout bem diferente do Itaú: cada posição tem o nome
// espalhado em 1-3 linhas, seguido de "Security Identifier: <CUSIP>" e uma
// (ou mais, se comprada em lotes/datas diferentes) linha densa com todos os
// campos numéricos juntos, ex.:
//   "09/06/223,12 100,000.0000 96.3000 96,300.00 99.8260 99,826.00 3,526.00 220.00 4,400.00 4.40%"
// (a "3,12" colada na data são números de nota de rodapé do PDF, sem
// espaço). Os campos são, em ordem: data de aquisição, quantidade, custo
// unitário, custo total, preço de mercado, valor de mercado, ganho/perda
// não realizado, juros acruados, renda anual estimada, yield estimado.
// Papéis com taxa flutuante às vezes não trazem os 3 últimos campos (o
// custodiante não reporta acruado pra eles nesse extrato) — nesse caso a
// posição é ignorada aqui (fica de fora da apuração) em vez de assumir 0.
// Quando o mesmo papel tem mais de uma linha de dados (lotes comprados em
// datas diferentes, inclusive com quebra de página no meio), os juros
// acruados de todas as linhas do bloco são somados.
const RE_PERSHING_SECTION_START = /^FIXED INCOME\/DEBT SECURITIES\b/;
const RE_PERSHING_SECTION_END = /^TOTAL FIXED INCOME\/DEBT SECURITIES\b/;
const RE_PERSHING_SEC_ID = /^Security Identifier:\s*(\S+)/;
const RE_PERSHING_ROW_FULL =
  /^(\d{2}\/\d{2}\/\d{2})[\d,]*\s+([\d,]+\.\d{4})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{2})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+([\d.]+)%$/;
const RE_PERSHING_ROW_SHORT =
  /^(\d{2}\/\d{2}\/\d{2})[\d,]*\s+([\d,]+\.\d{4})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{2})\s+([\d,]+\.\d{4})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})$/;
const RE_ISIN_INLINE = /ISIN#(\S+)/;

const PERSHING_STOP_NOME_REGEXES: RegExp[] = [
  /^Original Cost Basis:/,
  /^Corporate Bonds/,
  /^Total/,
  /^-- \d+ of \d+ --$/,
  /-SD$/,
  /Account Number:/,
  /^Page \d+ of \d+$/,
  /^Portfolio Holdings/,
  /^Date Acquired/,
  /^Current$/,
  /^Cost Basis Market Price Market Value$/,
  /^Unrealized$/,
  /^Gain\/Loss$/,
  /^Accrued$/,
  /^Interest$/,
  /^Estimated$/,
  /^Annual Income$/,
  /^Yield$/,
  /^FIXED INCOME/,
  /^[A-Za-z]+ \d{1,2}, \d{4} - [A-Za-z]+ \d{1,2}, \d{4}$/,
  /^PERSONAL OVERSEAS/,
  RE_PERSHING_ROW_FULL,
  RE_PERSHING_ROW_SHORT,
  RE_PERSHING_SEC_ID,
];

function ehLinhaDeParadaPershing(linha: string): boolean {
  if (linha === "") return true;
  return PERSHING_STOP_NOME_REGEXES.some((re) => re.test(linha));
}

function parseEntradasPershing(linhas: string[]): EntradaAcruoExtrato[] {
  const startIdx = linhas.findIndex((l) => RE_PERSHING_SECTION_START.test(l));
  if (startIdx === -1) return [];
  let endIdx = linhas.findIndex((l, i) => i > startIdx && RE_PERSHING_SECTION_END.test(l));
  if (endIdx === -1) endIdx = linhas.length;

  const secIdIdx: number[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    if (RE_PERSHING_SEC_ID.test(linhas[i])) secIdIdx.push(i);
  }

  const entradas: EntradaAcruoExtrato[] = [];
  for (let idx = 0; idx < secIdIdx.length; idx++) {
    const i = secIdIdx[idx];
    const cusipMatch = RE_PERSHING_SEC_ID.exec(linhas[i]);
    if (!cusipMatch) continue;
    const cusip = cusipMatch[1];
    const fimBloco = idx + 1 < secIdIdx.length ? secIdIdx[idx + 1] : endIdx;

    const partesNome: string[] = [];
    for (let j = i - 1; j >= Math.max(startIdx, i - 6); j--) {
      if (ehLinhaDeParadaPershing(linhas[j])) break;
      partesNome.unshift(linhas[j]);
    }
    const nome = partesNome.join(" ");
    if (!nome) continue; // bloco não reconhecido — ignora em vez de adivinhar
    const isinInline = RE_ISIN_INLINE.exec(nome)?.[1] ?? null;

    let accruedInterest: number | null = null;
    for (let k = i + 1; k < fimBloco; k++) {
      const full = RE_PERSHING_ROW_FULL.exec(linhas[k]);
      if (full) {
        accruedInterest = (accruedInterest ?? 0) + parseValor(full[8]);
        continue;
      }
      // RE_PERSHING_ROW_SHORT casa lotes de papéis de taxa flutuante sem juros acruados
      // reportados nesse extrato — não contam pra soma, mas também não são erro.
    }
    if (accruedInterest == null) continue; // custodiante não reportou acruado pra esse papel

    entradas.push({
      nome,
      isin: isinInline ?? cusip,
      accruedInterest: Math.round(accruedInterest * 100) / 100,
    });
  }
  return entradas;
}

const MESES_EN: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

/** Data-base do formato Pershing: fim do período declarado no cabeçalho ("July 1, 2026 - July 31, 2026"). */
function extrairDataBasePershing(texto: string): string | null {
  const m = texto.match(/[A-Za-z]+ \d{1,2}, \d{4} - ([A-Za-z]+) (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const mes = MESES_EN[m[1].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${mes}-${m[2].padStart(2, "0")}`;
}

/**
 * Extrai as posições de renda fixa (nome, ISIN/CUSIP, juros acruados) do "Statement" mensal de
 * um custodiante — reconhece o formato do Itaú Private Bank e o formato Pershing (Bradesco Bank
 * International). Não tenta ler valor de mercado/quantidade — isso já é coberto por
 * lib/portfolio/parse-holdings.ts (importação de Carteira); aqui o interesse é só a coluna de
 * juros acruados, usada para sugerir as apurações da tela de Ajustes.
 */
export async function parseExtratoAcruoDePdf(buffer: ArrayBuffer): Promise<ExtratoAcruoParseado> {
  const texto = await extrairTextoPdf(buffer);
  if (!texto || texto.trim().length === 0) {
    throw new ParseAcruoError(
      "O PDF não retornou nenhum texto — provavelmente é um extrato escaneado/fotografado."
    );
  }

  const linhas = texto.split(/\r?\n/).map((l) => l.trim());

  let entradas: EntradaAcruoExtrato[];
  let dataBase: string | null;
  let formato: "itau" | "pershing";
  if (linhas.some((l) => RE_FIXED_INCOME_HEADER.test(l))) {
    entradas = parseEntradasItau(linhas);
    dataBase = extrairDataBase(texto);
    formato = "itau";
  } else if (linhas.some((l) => RE_PERSHING_SECTION_START.test(l))) {
    entradas = parseEntradasPershing(linhas);
    dataBase = extrairDataBasePershing(texto);
    formato = "pershing";
  } else {
    throw new ParseAcruoError(
      "Não reconheci o formato deste PDF. Por enquanto este importador só lê o \"Statement\" do " +
        "Itaú Private Bank e o \"Portfolio Holdings\" (formato Pershing) do Bradesco Bank International."
    );
  }

  if (entradas.length === 0) {
    throw new ParseAcruoError(
      "Reconheci o formato do extrato, mas não consegui identificar nenhuma posição de renda fixa dentro dele."
    );
  }

  return { dataBase, entradas, formato };
}

// =====================================================================
// Valor de mercado dos fundos de renda variável ("categoria_acruo = mercado":
// Pimco, Vanguard SP 500, Oaktree, CP Note GLD) — usado pela tela de
// Marcação a Mercado (Ajustes) para sugerir o "valor reportado" de cada
// fundo a partir do mesmo Statement, em vez de o usuário digitar na mão.
//
// Diferente das posições de renda fixa (uma única seção "FIXED INCOME"),
// esses fundos aparecem espalhados em três seções distintas do PDF, com
// layouts de linha ligeiramente diferentes — a "High Yield Developed
// Markets" (dentro de FIXED INCOME, sem cupom), "ALTERNATIVES" e
// "EQUITIES". Em todas elas, porém, o "Market Value (USD)" está sempre
// exatamente 3 linhas antes da linha-âncora final do bloco (confirmado
// manualmente linha a linha nas três seções): a última linha do bloco é
// "<ganho/perda> <juros acruados|-> <yield>" no formato de renda fixa, ou
// "<ganho/perda> <% mensal> <% da carteira>" no formato Alternatives/
// Equities. Por isso, em vez de tentar reconhecer o bloco inteiro (como
// faz o parser de acruo acima), aqui a busca é direcionada: localiza a
// linha "ISIN: <isin-alvo>" de cada fundo já cadastrado e anda pra frente
// até achar uma das duas âncoras, pegando o valor 3 linhas antes dela.
const RE_ALT_EQUITY_ROW = /^(-?[\d,]+\.\d{2})\s+(-?[\d.]+%)\s+([\d.]+%)$/;
const RE_MONEY = /^-?[\d,]+\.\d{2}$/;

export type EntradaMercadoExtrato = {
  isin: string;
  /** Nome do fundo tal como aparece no extrato, para exibição/conferência. */
  nome: string;
  /** "Market Value (USD)" informado pelo custodiante para esse fundo, na data-base do extrato. */
  valorMercado: number;
};

/**
 * Extrai o valor de mercado de fundos específicos (pelo ISIN) do Statement do Itaú Private
 * Bank. Recebe a lista de ISINs a procurar (dos Ativos de categoria 'mercado' já cadastrados)
 * em vez de tentar reconhecer todas as seções do extrato — os fundos que a usuária ainda não
 * cadastrou, ou papéis fora dessas 3 seções, simplesmente não aparecem no resultado.
 */
export async function parseValoresMercadoDePdf(
  buffer: ArrayBuffer,
  isinsAlvo: string[]
): Promise<{ dataBase: string | null; entradas: EntradaMercadoExtrato[] }> {
  const texto = await extrairTextoPdf(buffer);
  if (!texto || texto.trim().length === 0) {
    throw new ParseAcruoError(
      "O PDF não retornou nenhum texto — provavelmente é um extrato escaneado/fotografado."
    );
  }
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());

  const entradas: EntradaMercadoExtrato[] = [];
  for (const isinAlvo of isinsAlvo) {
    for (let k = 0; k < linhas.length; k++) {
      const m = RE_ISIN.exec(linhas[k]);
      if (!m || m[1] !== isinAlvo) continue;

      let nome: string | null = null;
      for (let j = k - 1; j >= Math.max(0, k - 5); j--) {
        if (linhas[j] !== "") {
          nome = linhas[j];
          break;
        }
      }

      let valorMercado: number | null = null;
      for (let i = k + 1; i <= Math.min(linhas.length - 1, k + 15); i++) {
        if (RE_ACCRUED_ROW.test(linhas[i]) || RE_ALT_EQUITY_ROW.test(linhas[i])) {
          const candidato = linhas[i - 3];
          if (candidato && RE_MONEY.test(candidato)) {
            valorMercado = parseValor(candidato);
          }
          break;
        }
      }

      if (nome && valorMercado != null) {
        entradas.push({ isin: isinAlvo, nome, valorMercado });
        break; // achou uma ocorrência válida deste ISIN — não precisa continuar procurando
      }
      // essa ocorrência do ISIN não tinha uma âncora reconhecível por perto (ex.: menção num
      // resumo de portfólio, sem o bloco de detalhe) — continua procurando outra ocorrência.
    }
  }

  return { dataBase: extrairDataBase(texto), entradas };
}
