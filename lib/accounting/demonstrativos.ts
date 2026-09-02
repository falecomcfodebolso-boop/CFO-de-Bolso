import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrupoDfc, GrupoDre, Natureza } from "./classificacao";

export type MovimentoClassificado = {
  lancamento_linha_id: string;
  lancamento_id: string;
  conta_code: string;
  conta_name: string;
  natureza: Natureza;
  circulante: boolean | null;
  is_caixa: boolean;
  grupo_dre: GrupoDre | null;
  grupo_dfc: GrupoDfc | null;
  data: string;
  tipo: "D" | "C";
  valor: number;
  valor_saldo: number;
};

/** Todos os movimentos da organização até `ate` (inclusive), opcionalmente a partir de `desde`. */
async function getMovimentos(supabase: SupabaseClient, orgId: string, ate: string, desde?: string) {
  let query = supabase.from("v_movimento_contas").select("*").eq("org_id", orgId).lte("data", ate);
  if (desde) query = query.gte("data", desde);
  const { data, error } = await query.returns<MovimentoClassificado[]>();
  if (error) throw error;
  return data ?? [];
}

function diaAnterior(dataISO: string) {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// DRE — Demonstração do Resultado do Exercício
// ---------------------------------------------------------------------

export type Dre = {
  periodoInicio: string;
  periodoFim: string;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  lucroBruto: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  receitasFinanceiras: number;
  despesasFinanceiras: number;
  outras: number;
  resultadoAntesImpostos: number;
  impostosSobreLucro: number;
  lucroLiquido: number;
  temMovimento: boolean;
};

export async function getDRE(
  supabase: SupabaseClient,
  orgId: string,
  inicio: string,
  fim: string
): Promise<Dre> {
  const movs = await getMovimentos(supabase, orgId, fim, inicio);

  const somaGrupo = (grupo: GrupoDre) =>
    movs.filter((m) => m.grupo_dre === grupo).reduce((acc, m) => acc + Number(m.valor_saldo), 0);

  const receitaBruta = somaGrupo("receita_bruta");
  const deducoes = Math.abs(somaGrupo("deducoes"));
  const receitaLiquida = receitaBruta - deducoes;
  const custos = Math.abs(somaGrupo("custos"));
  const lucroBruto = receitaLiquida - custos;
  const despesasOperacionais = Math.abs(somaGrupo("despesas_operacionais"));
  const resultadoOperacional = lucroBruto - despesasOperacionais;
  const receitasFinanceiras = somaGrupo("receitas_financeiras");
  const despesasFinanceiras = Math.abs(somaGrupo("despesas_financeiras"));

  const outrasReceitas = movs
    .filter((m) => m.grupo_dre === "outras_receitas_despesas" && m.natureza === "RECEITA")
    .reduce((acc, m) => acc + Number(m.valor_saldo), 0);
  const outrasDespesas = Math.abs(
    movs
      .filter((m) => m.grupo_dre === "outras_receitas_despesas" && m.natureza === "DESPESA")
      .reduce((acc, m) => acc + Number(m.valor_saldo), 0)
  );
  const outras = outrasReceitas - outrasDespesas;

  const resultadoAntesImpostos = resultadoOperacional + receitasFinanceiras - despesasFinanceiras + outras;
  const impostosSobreLucro = Math.abs(somaGrupo("impostos_sobre_lucro"));
  const lucroLiquido = resultadoAntesImpostos - impostosSobreLucro;

  return {
    periodoInicio: inicio,
    periodoFim: fim,
    receitaBruta,
    deducoes,
    receitaLiquida,
    custos,
    lucroBruto,
    despesasOperacionais,
    resultadoOperacional,
    receitasFinanceiras,
    despesasFinanceiras,
    outras,
    resultadoAntesImpostos,
    impostosSobreLucro,
    lucroLiquido,
    temMovimento: movs.some((m) => m.natureza === "RECEITA" || m.natureza === "DESPESA"),
  };
}

// ---------------------------------------------------------------------
// Balanço Patrimonial
// ---------------------------------------------------------------------

export type ContaSaldo = { code: string; name: string; saldo: number };

export type Balanco = {
  data: string;
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  passivoTotal: number;
  capitalEReservas: number;
  resultadoDoExercicio: number;
  patrimonioLiquido: number;
  passivoMaisPl: number;
  diferenca: number;
  contasAtivoCirculante: ContaSaldo[];
  contasAtivoNaoCirculante: ContaSaldo[];
  contasPassivoCirculante: ContaSaldo[];
  contasPassivoNaoCirculante: ContaSaldo[];
  contasPl: ContaSaldo[];
};

export async function getBalanco(supabase: SupabaseClient, orgId: string, data: string): Promise<Balanco> {
  const movs = await getMovimentos(supabase, orgId, data);

  const porConta = new Map<string, { name: string; natureza: Natureza; circulante: boolean | null; saldo: number }>();
  for (const m of movs) {
    if (m.natureza !== "ATIVO" && m.natureza !== "PASSIVO" && m.natureza !== "PL") continue;
    const atual = porConta.get(m.conta_code) ?? {
      name: m.conta_name,
      natureza: m.natureza,
      circulante: m.circulante,
      saldo: 0,
    };
    atual.saldo += Number(m.valor_saldo);
    porConta.set(m.conta_code, atual);
  }

  const listar = (natureza: Natureza, circulante: boolean | null) =>
    Array.from(porConta.entries())
      .filter(([, c]) => c.natureza === natureza && c.circulante === circulante)
      .map(([code, c]) => ({ code, name: c.name, saldo: c.saldo }))
      .filter((c) => Math.abs(c.saldo) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));

  const contasAtivoCirculante = listar("ATIVO", true);
  const contasAtivoNaoCirculante = listar("ATIVO", false);
  const contasPassivoCirculante = listar("PASSIVO", true);
  const contasPassivoNaoCirculante = listar("PASSIVO", false);
  const contasPl = listar("PL", null);

  const somar = (arr: ContaSaldo[]) => arr.reduce((acc, c) => acc + c.saldo, 0);

  const ativoCirculante = somar(contasAtivoCirculante);
  const ativoNaoCirculante = somar(contasAtivoNaoCirculante);
  const ativoTotal = ativoCirculante + ativoNaoCirculante;

  const passivoCirculante = somar(contasPassivoCirculante);
  const passivoNaoCirculante = somar(contasPassivoNaoCirculante);
  const passivoTotal = passivoCirculante + passivoNaoCirculante;

  const capitalEReservas = somar(contasPl);

  // O resultado do período corrente ainda não foi "fechado" contra o PL
  // (não há lançamento de apuração/encerramento) — por isso é somado ao
  // PL aqui, como linha própria, para o Balanço fechar com o Ativo.
  const resultadoDoExercicio = movs.reduce((acc, m) => {
    if (m.natureza === "RECEITA") return acc + Number(m.valor_saldo);
    if (m.natureza === "DESPESA") return acc - Number(m.valor_saldo);
    return acc;
  }, 0);

  const patrimonioLiquido = capitalEReservas + resultadoDoExercicio;
  const passivoMaisPl = passivoTotal + patrimonioLiquido;

  return {
    data,
    ativoCirculante,
    ativoNaoCirculante,
    ativoTotal,
    passivoCirculante,
    passivoNaoCirculante,
    passivoTotal,
    capitalEReservas,
    resultadoDoExercicio,
    patrimonioLiquido,
    passivoMaisPl,
    diferenca: ativoTotal - passivoMaisPl,
    contasAtivoCirculante,
    contasAtivoNaoCirculante,
    contasPassivoCirculante,
    contasPassivoNaoCirculante,
    contasPl,
  };
}

// ---------------------------------------------------------------------
// DFC — Demonstração do Fluxo de Caixa (método direto, por lançamento)
// ---------------------------------------------------------------------
// Para cada lançamento do período que movimenta uma conta de Caixa e
// Equivalentes de Caixa, a variação de caixa é distribuída (proporcional
// ao valor de cada linha) entre as contrapartidas do mesmo lançamento,
// usando a classificação grupo_dfc de cada contrapartida. Lançamentos
// que só transferem entre contas de caixa (ex: banco → banco) não geram
// nenhuma categoria, pois não alteram o total de caixa da organização.

export type Dfc = {
  periodoInicio: string;
  periodoFim: string;
  saldoInicialCaixa: number;
  saldoFinalCaixa: number;
  operacional: number;
  investimento: number;
  financiamento: number;
  variacaoCaixa: number;
};

export async function getDFC(supabase: SupabaseClient, orgId: string, inicio: string, fim: string): Promise<Dfc> {
  const movsAteInicio = await getMovimentos(supabase, orgId, diaAnterior(inicio));
  const saldoInicialCaixa = movsAteInicio
    .filter((m) => m.is_caixa)
    .reduce((acc, m) => acc + Number(m.valor_saldo), 0);

  const movsPeriodo = await getMovimentos(supabase, orgId, fim, inicio);

  const porLancamento = new Map<string, MovimentoClassificado[]>();
  for (const m of movsPeriodo) {
    const arr = porLancamento.get(m.lancamento_id) ?? [];
    arr.push(m);
    porLancamento.set(m.lancamento_id, arr);
  }

  let operacional = 0;
  let investimento = 0;
  let financiamento = 0;

  for (const linhas of porLancamento.values()) {
    const linhasCaixa = linhas.filter((l) => l.is_caixa);
    if (linhasCaixa.length === 0) continue;

    const linhasOutras = linhas.filter((l) => !l.is_caixa);
    if (linhasOutras.length === 0) continue; // transferência entre caixas: não afeta o total

    const cashDelta = linhasCaixa.reduce((acc, l) => acc + Number(l.valor_saldo), 0);
    const totalOutras = linhasOutras.reduce((acc, l) => acc + Number(l.valor), 0);

    for (const l of linhasOutras) {
      const peso = totalOutras > 0 ? Number(l.valor) / totalOutras : 1 / linhasOutras.length;
      const parte = cashDelta * peso;
      if (l.grupo_dfc === "investimento") investimento += parte;
      else if (l.grupo_dfc === "financiamento") financiamento += parte;
      else operacional += parte;
    }
  }

  const variacaoCaixa = operacional + investimento + financiamento;

  return {
    periodoInicio: inicio,
    periodoFim: fim,
    saldoInicialCaixa,
    saldoFinalCaixa: saldoInicialCaixa + variacaoCaixa,
    operacional,
    investimento,
    financiamento,
    variacaoCaixa,
  };
}

// ---------------------------------------------------------------------
// DMPL — Demonstração das Mutações do Patrimônio Líquido
// ---------------------------------------------------------------------

export type DmplConta = { code: string; name: string; saldoInicial: number; movimento: number; saldoFinal: number };

export type Dmpl = {
  periodoInicio: string;
  periodoFim: string;
  saldoInicial: number;
  aportes: number;
  distribuicoes: number;
  resultadoPeriodo: number;
  saldoFinal: number;
  contas: DmplConta[];
};

export async function getDMPL(supabase: SupabaseClient, orgId: string, inicio: string, fim: string): Promise<Dmpl> {
  const [movsAteInicio, movsPeriodo, dre] = await Promise.all([
    getMovimentos(supabase, orgId, diaAnterior(inicio)),
    getMovimentos(supabase, orgId, fim, inicio),
    getDRE(supabase, orgId, inicio, fim),
  ]);

  const saldoInicialPorConta = new Map<string, { name: string; saldo: number }>();
  for (const m of movsAteInicio) {
    if (m.natureza !== "PL") continue;
    const atual = saldoInicialPorConta.get(m.conta_code) ?? { name: m.conta_name, saldo: 0 };
    atual.saldo += Number(m.valor_saldo);
    saldoInicialPorConta.set(m.conta_code, atual);
  }

  const movimentoPorConta = new Map<string, { name: string; movimento: number }>();
  for (const m of movsPeriodo) {
    if (m.natureza !== "PL") continue;
    const atual = movimentoPorConta.get(m.conta_code) ?? { name: m.conta_name, movimento: 0 };
    atual.movimento += Number(m.valor_saldo);
    movimentoPorConta.set(m.conta_code, atual);
  }

  const codigos = new Set([...saldoInicialPorConta.keys(), ...movimentoPorConta.keys()]);
  const contas: DmplConta[] = Array.from(codigos)
    .map((code) => {
      const inicial = saldoInicialPorConta.get(code)?.saldo ?? 0;
      const mov = movimentoPorConta.get(code)?.movimento ?? 0;
      const name = saldoInicialPorConta.get(code)?.name ?? movimentoPorConta.get(code)?.name ?? code;
      return { code, name, saldoInicial: inicial, movimento: mov, saldoFinal: inicial + mov };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const saldoInicial = contas.reduce((acc, c) => acc + c.saldoInicial, 0);
  const aportes = contas.reduce((acc, c) => acc + (c.movimento > 0 ? c.movimento : 0), 0);
  const distribuicoes = contas.reduce((acc, c) => acc + (c.movimento < 0 ? c.movimento : 0), 0);
  const resultadoPeriodo = dre.lucroLiquido;
  const saldoFinal = saldoInicial + aportes + distribuicoes + resultadoPeriodo;

  return { periodoInicio: inicio, periodoFim: fim, saldoInicial, aportes, distribuicoes, resultadoPeriodo, saldoFinal, contas };
}
