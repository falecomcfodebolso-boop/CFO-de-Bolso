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
  /** Data-base do extrato (a mais recente entre as "Market Value as of ..." encontradas), YYYY-MM-DD. */
  dataBase: string | null;
  entradas: EntradaAcruoExtrato[];
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

/**
 * Extrai as posições de renda fixa (nome, ISIN, juros acruados) do "Statement" mensal do Itaú
 * Private Bank. Não tenta ler valor de mercado/quantidade — isso já é coberto por
 * lib/portfolio/parse-holdings.ts (importação de Carteira); aqui o interesse é só a coluna
 * "Accrued Interest", usada para sugerir as apurações da tela de Ajustes.
 */
export async function parseExtratoAcruoDePdf(buffer: ArrayBuffer): Promise<ExtratoAcruoParseado> {
  const texto = await extrairTextoPdf(buffer);
  if (!texto || texto.trim().length === 0) {
    throw new ParseAcruoError(
      "O PDF não retornou nenhum texto — provavelmente é um extrato escaneado/fotografado."
    );
  }

  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  const startIdx = linhas.findIndex((l) => RE_FIXED_INCOME_HEADER.test(l));
  if (startIdx === -1) {
    throw new ParseAcruoError(
      "Não encontrei a seção \"Fixed Income\" no PDF. Por enquanto este importador só reconhece o " +
        "formato de \"Statement\" do Itaú Private Bank."
    );
  }
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

  if (entradas.length === 0) {
    throw new ParseAcruoError(
      "Encontrei a seção \"Fixed Income\", mas não consegui reconhecer nenhuma posição dentro dela."
    );
  }

  return { dataBase: extrairDataBase(texto), entradas };
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
