import type { TransacaoExtraida } from "./parsers";

// ---------------------------------------------------------------------
// "Account Details" do internet banking do Bradesco Bac Florida Bank,
// impresso em PDF pelo navegador (Ctrl+P na aba Transactions).
//
// O texto extraído desse PDF NÃO vem linha a linha como na tela: em cada
// página vêm primeiro todos os lançamentos no formato
//     OCT 21 / 2026 / ($42,432.03) / $847.68      (data, ano, valor, saldo)
// e só depois, na mesma ordem, todas as descrições, cada uma com 1 ou 2
// linhas ("BAC FLORIDA BANK BROK.TRANS BOT 51 CSTNL 3GM-" + "062156-1 ... PPD").
// Por isso o parser junta as duas listas pela posição dentro de cada página
// e confere a sequência de saldos (saldo anterior + valor = saldo) — se a
// conta não fechar ou o número de descrições não bater com o de valores,
// falha alto em vez de importar algo desalinhado.
// ---------------------------------------------------------------------

const MESES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};
const DATA_MES_DIA_REGEX = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})$/i;
const ANO_REGEX = /^(\d{4})$/;
const VALOR_REGEX = /^\(?-?\$[\d,]*\d\.\d{2}\)?$/;
const SEPARADOR_PAGINA_REGEX = /^--\s*\d+\s+of\s+\d+\s*--$/m;
const RUIDO_REGEX =
  /(Account Details \||^https?:\/\/|^Page totals:|^\d+\s*-\s*\d+\s+of\s+\d+\s+transactions|^Date\s+Description\s+Amount)/i;
const ICONE_OU_ESPACO_INICIAL_REGEX = /^[\s-]/;

function valor(raw: string): number {
  const negativo = raw.includes("(") || raw.includes("-");
  const n = parseFloat(raw.replace(/[^\d.]/g, ""));
  return negativo ? -n : n;
}

/** Identifica o formato: impressão da tela de transações do Bradesco Bac Florida. */
export function pareceBacFloridaOnline(texto: string): boolean {
  return /Bradesco Bac Florida/i.test(texto) && /BROK\.TRANS/i.test(texto);
}

export function parseBacFloridaOnline(texto: string): TransacaoExtraida[] {
  if (!pareceBacFloridaOnline(texto)) return [];

  type Entrada = { data: string; valor: number; saldo: number };
  const todas: (Entrada & { descricao: string })[] = [];

  for (const pagina of texto.split(SEPARADOR_PAGINA_REGEX)) {
    const linhas = pagina.split(/\r?\n/);
    const entradas: Entrada[] = [];
    const descricoes: string[][] = [];

    for (let i = 0; i < linhas.length; i++) {
      const bruta = linhas[i];
      const linha = bruta.replace(/[-]/g, "").trim();
      if (!linha || RUIDO_REGEX.test(linha)) continue;

      const md = linha.match(DATA_MES_DIA_REGEX);
      const ano = (linhas[i + 1] ?? "").trim().match(ANO_REGEX);
      const v = (linhas[i + 2] ?? "").trim();
      const s = (linhas[i + 3] ?? "").trim();
      if (md && ano && VALOR_REGEX.test(v) && VALOR_REGEX.test(s)) {
        const mes = String(MESES[md[1].toUpperCase()]).padStart(2, "0");
        const dia = md[2].padStart(2, "0");
        entradas.push({ data: `${ano[1]}-${mes}-${dia}`, valor: valor(v), saldo: valor(s) });
        i += 3;
        continue;
      }

      // Só conta como descrição o que vem DEPOIS dos lançamentos da página
      // (antes deles fica o cabeçalho: saudação, saldo atual etc.).
      if (entradas.length === 0) continue;
      const atual = descricoes[descricoes.length - 1];
      const anteriorFechou = !atual || /\bPPD$/.test(atual[atual.length - 1]);
      if (anteriorFechou || ICONE_OU_ESPACO_INICIAL_REGEX.test(bruta)) {
        descricoes.push([linha]);
      } else {
        atual.push(linha);
      }
    }

    if (entradas.length === 0) continue;
    if (descricoes.length !== entradas.length) {
      throw new Error(
        `Extrato do Bradesco Bac Florida: numa página há ${entradas.length} lançamento(s) mas ${descricoes.length} descrição(ões) — não dá para parear com segurança. Exporte em CSV/OFX ou envie o extrato mensal oficial.`
      );
    }
    entradas.forEach((e, k) => todas.push({ ...e, descricao: descricoes[k].join(" — ").slice(0, 300) }));
  }

  // Conferência dos saldos (lista vem do mais recente para o mais antigo).
  for (let k = 0; k < todas.length - 1; k++) {
    const esperado = Math.round((todas[k + 1].saldo + todas[k].valor) * 100) / 100;
    if (Math.abs(esperado - todas[k].saldo) >= 0.01) {
      throw new Error(
        `Extrato do Bradesco Bac Florida: o saldo não fecha no lançamento de ${todas[k].data} (${todas[k].valor.toFixed(2)}): esperado ${esperado.toFixed(2)}, extrato ${todas[k].saldo.toFixed(2)}.`
      );
    }
  }

  return todas
    .map(({ data, valor: v, descricao }) => ({ data, valor: v, descricao }))
    .reverse();
}
