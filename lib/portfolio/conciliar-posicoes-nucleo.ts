import type { FormatoPosicoes, PosicaoExtrato } from "@/lib/portfolio/posicoes-texto";

// =====================================================================
// Conciliação das posições do extrato com os Ativos cadastrados (pura,
// sem banco — testável). Ver lib/portfolio/conciliar-posicoes.ts.
// =====================================================================

export type AtivoParaConciliar = {
  id: string;
  nome: string;
  custodiante: string | null;
  isin: string | null;
  quantidade: number | string | null;
  categoria_acruo: string | null;
  data_vencimento: string | null;
  data_pagamento_anterior: string | null;
  periodicidade_cupom: string | null;
  valor_mercado?: number | string | null;
  data_posicao?: string | null;
};

export type AtualizacaoPosicao = {
  ativoId: string;
  nomeAtivo: string;
  nomeExtrato: string;
  identificador: string | null;
  quantidadeAntes: number | null;
  quantidade: number | null;
  valorMercadoAntes: number | null;
  valorMercado: number;
  jurosAcruados: number;
  precoMercado: number | null;
  /** Próximo cupom/último cupom recalculado pelo vencimento — só preenchido quando o cadastro está desatualizado. */
  dataPagamentoAnteriorAntes: string | null;
  dataPagamentoAnteriorSugerida: string | null;
  /** Data-base já gravada no Ativo é mais nova que a deste extrato — não sobrescreve. */
  maisAntigoQueCadastro: boolean;
};

export type AtivoAusente = { ativoId: string; nome: string; dataVencimento: string | null; vencido: boolean };

export type ResultadoConciliacao = {
  formato: FormatoPosicoes;
  dataBase: string;
  custodiante: string;
  atualizacoes: AtualizacaoPosicao[];
  /** Ativos deste custodiante que não aparecem no extrato (vendidos, vencidos ou cadastrados com outro identificador). */
  ausentes: AtivoAusente[];
  /** Posições do extrato que não batem com nenhum Ativo cadastrado. */
  semCadastro: PosicaoExtrato[];
};

export const MESES_PERIODO: Record<string, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

export function ehCustodianteBradesco(custodiante: string | null) {
  return /bradesco|xp|pershing/i.test(custodiante ?? "");
}

function normalizar(s: string) {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\((ITAU|XP\/BRADESCO|BRADESCO|XP)\)/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function idsDoAtivo(a: AtivoParaConciliar): string[] {
  return (a.isin ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function bateIdentificador(ids: string[], p: PosicaoExtrato): boolean {
  return ids.some(
    (id) =>
      (p.isin && id === p.isin.toUpperCase()) ||
      (p.cusip && id === p.cusip.toUpperCase()) ||
      // ISIN americano = "US" + CUSIP + dígito: um Ativo cadastrado com ISIN casa com o CUSIP do extrato
      (p.cusip && id.length === 12 && id.slice(2, 11) === p.cusip.toUpperCase())
  );
}

function ultimoDiaDoMes(ano: number, mes0: number) {
  return new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();
}

/** Soma (ou subtrai) meses mantendo o dia do vencimento (limitado ao último dia do mês). */
export function somarMesesNoDia(iso: string, meses: number, diaBase: number): string {
  const [a, m] = iso.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes0 = total % 12;
  const dia = Math.min(diaBase, ultimoDiaDoMes(ano, mes0));
  return `${ano}-${String(mes0 + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Último cupom ≤ dataBase, contado para trás a partir do vencimento. */
export function ultimoCupomAte(vencimento: string, periodicidade: string, dataBase: string): string | null {
  const meses = MESES_PERIODO[periodicidade];
  if (!meses || vencimento <= dataBase) return null;
  const dia = Number(vencimento.slice(8, 10));
  let cursor = vencimento;
  for (let guard = 0; guard < 600 && cursor > dataBase; guard++) cursor = somarMesesNoDia(cursor, -meses, dia);
  return cursor;
}

function diasEntre(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const numOuNull = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

export function conciliarPosicoes(
  formato: FormatoPosicoes,
  dataBase: string,
  posicoes: PosicaoExtrato[],
  todosAtivos: AtivoParaConciliar[]
): ResultadoConciliacao {
  const ativos = todosAtivos.filter((a) =>
    formato === "pershing" ? ehCustodianteBradesco(a.custodiante) : !ehCustodianteBradesco(a.custodiante)
  );
  const usadas = new Set<number>();
  const vinculos = new Map<string, number[]>();

  // 1) Por identificador (ISIN/CUSIP) — um Ativo pode juntar mais de um ISIN (ex.: DrillCo).
  for (const a of ativos) {
    const ids = idsDoAtivo(a);
    if (ids.length === 0) continue;
    const idx = posicoes.map((p, i) => (bateIdentificador(ids, p) && !usadas.has(i) ? i : -1)).filter((i) => i >= 0);
    if (idx.length > 0) {
      idx.forEach((i) => usadas.add(i));
      vinculos.set(a.id, idx);
    }
  }

  // 2) Pelo nome, só para Ativos sem ISIN cadastrado (ex.: JPM CP Note, CLN Glencore).
  for (const a of ativos) {
    if (vinculos.has(a.id) || idsDoAtivo(a).length > 0) continue;
    const nomeA = normalizar(a.nome);
    if (nomeA.length < 5) continue;
    const candidatos = posicoes
      .map((p, i) => ({ p, i }))
      .filter(({ p, i }) => !usadas.has(i) && normalizar(p.nome).includes(nomeA));
    if (candidatos.length === 1) {
      usadas.add(candidatos[0].i);
      vinculos.set(a.id, [candidatos[0].i]);
    }
  }

  const atualizacoes: AtualizacaoPosicao[] = [];
  const ausentes: AtivoAusente[] = [];
  for (const a of ativos) {
    const idx = vinculos.get(a.id);
    if (!idx) {
      ausentes.push({
        ativoId: a.id,
        nome: a.nome,
        dataVencimento: a.data_vencimento,
        vencido: !!a.data_vencimento && a.data_vencimento <= dataBase,
      });
      continue;
    }
    const ps = idx.map((i) => posicoes[i]);
    const quantidade = ps.every((p) => p.quantidade == null)
      ? null
      : Math.round(ps.reduce((s, p) => s + (p.quantidade ?? 0), 0) * 10000) / 10000;

    let sugerida: string | null = null;
    if (a.categoria_acruo === "periodico" && a.data_vencimento && a.periodicidade_cupom) {
      const calc = ultimoCupomAte(a.data_vencimento, a.periodicidade_cupom, dataBase);
      // Tolerância de 7 dias: o cadastro guarda a data efetiva de pagamento (dia útil), que
      // pode diferir alguns dias da data nominal. Mais que isso = cadastro ficou para trás.
      if (calc && (!a.data_pagamento_anterior || diasEntre(calc, a.data_pagamento_anterior) > 7)) sugerida = calc;
    }

    atualizacoes.push({
      ativoId: a.id,
      nomeAtivo: a.nome,
      nomeExtrato: ps.map((p) => p.nome).join(" + "),
      identificador: ps.map((p) => p.isin ?? p.cusip).filter(Boolean).join(", ") || null,
      quantidadeAntes: numOuNull(a.quantidade),
      quantidade,
      valorMercadoAntes: numOuNull(a.valor_mercado),
      valorMercado: r2(ps.reduce((s, p) => s + p.valorMercado, 0)),
      jurosAcruados: r2(ps.reduce((s, p) => s + p.jurosAcruados, 0)),
      precoMercado: ps.length === 1 ? ps[0].precoMercado : null,
      dataPagamentoAnteriorAntes: a.data_pagamento_anterior,
      dataPagamentoAnteriorSugerida: sugerida,
      maisAntigoQueCadastro: !!a.data_posicao && a.data_posicao > dataBase,
    });
  }

  return {
    formato,
    dataBase,
    custodiante: formato === "pershing" ? "XP/Bradesco" : "Itaú",
    atualizacoes,
    ausentes,
    semCadastro: posicoes.filter((_, i) => !usadas.has(i)),
  };
}

/** Próximo cupom a partir de hoje (inclusive), andando do último cupom pela periodicidade, limitado ao vencimento. */
export function proximoCupom(
  ultimoCupom: string | null,
  periodicidade: string | null,
  vencimento: string | null,
  hojeISO: string
): string | null {
  const meses = periodicidade ? MESES_PERIODO[periodicidade] : undefined;
  if (!meses || !ultimoCupom) return null;
  const dia = Number((vencimento ?? ultimoCupom).slice(8, 10));
  let cursor = ultimoCupom;
  for (let guard = 0; guard < 600 && cursor < hojeISO; guard++) cursor = somarMesesNoDia(cursor, meses, dia);
  if (vencimento && cursor > vencimento) return vencimento >= hojeISO ? vencimento : null;
  return cursor;
}
