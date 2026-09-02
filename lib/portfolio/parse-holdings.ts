import { extrairTextoPdf } from "@/lib/import/parsers";

/**
 * Uma posição de investimento (título/ativo) proposta a partir da leitura de
 * um extrato de custódia/corretora em PDF — antes de virar de fato uma linha
 * na tabela `ativos`. O usuário revisa e confirma antes de qualquer gravação.
 */
export type AtivoProposto = {
  identificador: string;
  nome: string;
  valorMercado: number;
  taxaCupom: number | null; // fração (ex: 0.044 = 4,4% a.a.), null se taxa flutuante
  dataVencimento: string | null; // YYYY-MM-DD
};

export class ParseHoldingsError extends Error {}

// ---------------------------------------------------------------------
// Extratos de custódia/corretora no exterior (ex: Bradesco Bank
// International, via Pershing LLC) trazem uma seção "Portfolio Holdings"
// listando os títulos em carteira. O layout é uma tabela larga, quebrada em
// várias linhas por título:
//   <descrição do título, 1-3 linhas>
//   Security Identifier: <CUSIP/ISIN>
//   <data de aquisição><possível marca de rodapé colada, ex: "3,12"> <qtd> <custo unit.> <custo total> <preço mercado> <valor de mercado> [<G/L> <juros> <renda anual> <yield%>]
//   Original Cost Basis: $<valor>
// Um mesmo título pode ter mais de um "lote" (mais de uma linha de dados),
// cada um seguido do seu próprio "Original Cost Basis" — nesse caso somamos
// o valor de mercado de todos os lotes.
//
// Datas nesse formato são americanas (MM/DD/AA — mês primeiro).
// ---------------------------------------------------------------------

const IGNORAR_LINHA_REGEX =
  /^(Original Cost Basis:|Total Covered|Total\s|Corporate Bonds|FIXED INCOME|Portfolio Holdings|Date Acquired|Current|Cost Basis|Unrealized|Gain\/Loss|Accrued|Interest|Estimated|Annual Income|Yield|Security Identifier:)/i;
const NOVA_SECAO_REGEX = /^(Corporate Bonds|FIXED INCOME|Portfolio Holdings)/i;
const PREFIXO_LOTE_REGEX = /^\d{1,2}\/\d{1,2}\/\d{2,4}[\d,]*\s+(.*)$/;
const NUMERO_REGEX = /-?\$?\d[\d,]*\.?\d*%?/g;
const CUPOM_VENCIMENTO_REGEX =
  /(?:(\d+\.\d+)%\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:B\/E\s+|REG\s+)?DTD/;
const JANELA_MAX_LOTES = 15;

function parseNumeroAmericano(raw: string): number | null {
  let s = raw.trim().replace(/^\$\s*/, "");
  const negativo = s.startsWith("-");
  s = s.replace(/[()\-]/g, "").replace(/,/g, "");
  if (!s) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

function paraIso(mes: string, dia: string, anoRaw: string): string {
  const ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/**
 * Recebe o texto já extraído do PDF e devolve as posições encontradas na
 * seção "Portfolio Holdings" mais recente (a primeira que aparece no
 * documento — extratos de vários meses combinados em um único PDF trazem o
 * mês mais recente primeiro).
 */
export function parseHoldingsDeTexto(textoCompleto: string): AtivoProposto[] {
  const todasLinhas = textoCompleto.split(/\r?\n/).map((l) => l.trim());

  const inicioIdx = todasLinhas.findIndex((l) => l === "Portfolio Holdings");
  if (inicioIdx === -1) {
    throw new ParseHoldingsError(
      'Não encontrei uma seção "Portfolio Holdings" neste PDF — ele pode não ser um extrato de custódia/corretora, ou ter um layout diferente do esperado.'
    );
  }

  // Quando o PDF combina vários meses num único arquivo (comum em extratos
  // de custódia), a seção "Portfolio Holdings" se repete uma vez por mês —
  // e o mês mais recente vem primeiro. Paramos assim que aparecer o
  // cabeçalho de período (ex: "June 1, 2026 - June 30, 2026") do mês
  // seguinte ao da seção atual, pra não misturar títulos de meses
  // diferentes nem duplicar o mesmo título repetido em cada mês.
  const periodoRegex = /^[A-Z][a-z]+ \d{1,2}, \d{4} - [A-Z][a-z]+ \d{1,2}, \d{4}$/;
  const periodoAtual = [...todasLinhas.slice(0, inicioIdx)].reverse().find((l) => periodoRegex.test(l)) ?? null;

  let fimIdx = todasLinhas.length;
  if (periodoAtual) {
    for (let i = inicioIdx + 1; i < todasLinhas.length; i++) {
      if (periodoRegex.test(todasLinhas[i]) && todasLinhas[i] !== periodoAtual) {
        fimIdx = i;
        break;
      }
    }
  }

  const linhas = todasLinhas.slice(inicioIdx, fimIdx).filter(Boolean);

  const propostas: AtivoProposto[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^Security Identifier:\s*(\S+)/);
    if (!m) continue;
    const identificador = m[1];

    const nomePartes: string[] = [];
    for (let k = i - 1; k >= 0 && nomePartes.length < 4; k--) {
      if (IGNORAR_LINHA_REGEX.test(linhas[k])) break;
      nomePartes.unshift(linhas[k]);
    }
    const nome = nomePartes.join(" ").replace(/\s+/g, " ").trim();
    if (!nome) continue;

    let valorMercadoTotal = 0;
    let qtdLotes = 0;
    for (let j = i + 1; j < linhas.length && j < i + JANELA_MAX_LOTES; j++) {
      if (/^Security Identifier:/.test(linhas[j]) || NOVA_SECAO_REGEX.test(linhas[j])) break;
      const lote = linhas[j].match(PREFIXO_LOTE_REGEX);
      if (!lote) continue;
      const numeros = (lote[1].match(NUMERO_REGEX) ?? []).filter((tok) => !tok.endsWith("%"));
      if (numeros.length < 5) continue;
      const valorMercado = parseNumeroAmericano(numeros[4]);
      if (valorMercado !== null) {
        valorMercadoTotal += valorMercado;
        qtdLotes++;
      }
    }
    if (qtdLotes === 0) continue;

    const cupomVenc = nome.match(CUPOM_VENCIMENTO_REGEX);
    const taxaCupom = cupomVenc?.[1] ? parseFloat(cupomVenc[1]) / 100 : null;
    let dataVencimento: string | null = null;
    if (cupomVenc?.[2]) {
      const p = cupomVenc[2].match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (p) dataVencimento = paraIso(p[1], p[2], p[3]);
    }

    propostas.push({
      identificador,
      nome,
      valorMercado: Math.round(valorMercadoTotal * 100) / 100,
      taxaCupom,
      dataVencimento,
    });
  }

  if (propostas.length === 0) {
    throw new ParseHoldingsError(
      'Encontrei a seção "Portfolio Holdings", mas não consegui reconhecer nenhum título dentro dela. O layout pode ser diferente do esperado.'
    );
  }

  return propostas;
}

export async function parseHoldingsDePdf(buffer: ArrayBuffer): Promise<AtivoProposto[]> {
  const texto = await extrairTextoPdf(buffer);
  if (!texto || texto.trim().length < 10) {
    throw new ParseHoldingsError(
      "O PDF não retornou nenhum texto — provavelmente é um extrato escaneado/fotografado."
    );
  }
  return parseHoldingsDeTexto(texto);
}
