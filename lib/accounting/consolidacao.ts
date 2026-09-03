import type { SupabaseClient } from "@supabase/supabase-js";
import { getBalanco, getDRE, type Balanco, type Dre, type MovimentoClassificado } from "./demonstrativos";

// =====================================================================
// Consolidação de demonstrações financeiras entre empresas do mesmo
// grupo (mesmo login) e equivalência patrimonial (MEP).
//
// IMPORTANTE — limitações desta consolidação simplificada:
// - Soma 100% dos ativos/passivos das controladas (participação > 50%)
//   e elimina as operações marcadas como "intercompany" entre elas.
// - NÃO elimina o saldo da conta de Investimentos nos livros da
//   investidora contra o patrimônio líquido da controlada na data da
//   aquisição (isso exigiria saber o valor pago e pode gerar ágio ou
//   deságio) — se você tem uma conta "Investimentos" com o valor pago
//   pela participação, ela continua aparecendo no ativo consolidado
//   por fora, então pode haver uma contagem duplicada nesse valor.
// - Coligadas/não controladoras (participação ≤ 50%) NÃO entram linha a
//   linha no Balanço/DRE consolidados (isso é o correto pelo método de
//   equivalência patrimonial) — aparecem só no resumo de participações.
// Revise com um contador antes de usar isso oficialmente.
// =====================================================================

export type TipoParticipacao = "CONTROLADA" | "COLIGADA";

export type Participacao = {
  id: string;
  investidora_org_id: string;
  investida_org_id: string;
  percentual: number;
  data_referencia: string;
  investida_nome: string;
  investida_currency: string;
  tipo: TipoParticipacao;
};

export function classificarParticipacao(percentual: number): TipoParticipacao {
  return percentual > 0.5 ? "CONTROLADA" : "COLIGADA";
}

export async function getParticipacoes(supabase: SupabaseClient, investidoraOrgId: string): Promise<Participacao[]> {
  const { data, error } = await supabase
    .from("participacoes_societarias")
    .select("id, investidora_org_id, investida_org_id, percentual, data_referencia, organizations!investida_org_id(name, base_currency)")
    .eq("investidora_org_id", investidoraOrgId);

  if (error) throw error;

  return (data ?? []).map((p) => {
    const org = p.organizations as unknown as { name: string; base_currency: string } | null;
    return {
      id: p.id,
      investidora_org_id: p.investidora_org_id,
      investida_org_id: p.investida_org_id,
      percentual: Number(p.percentual),
      data_referencia: p.data_referencia,
      investida_nome: org?.name ?? "(empresa)",
      investida_currency: org?.base_currency ?? "USD",
      tipo: classificarParticipacao(Number(p.percentual)),
    };
  });
}

// ---------------------------------------------------------------------
// Eliminação de operações intercompany entre duas empresas do grupo
// ---------------------------------------------------------------------

type EliminacaoBP = {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
};

type EliminacaoDRE = {
  receita: number;
  despesa: number;
};

async function getMovimentosIntercompany(
  supabase: SupabaseClient,
  orgAId: string,
  orgBId: string,
  ate: string,
  desde?: string
): Promise<MovimentoClassificado[]> {
  let query = supabase
    .from("v_movimento_contas")
    .select("*")
    .in("org_id", [orgAId, orgBId])
    .lte("data", ate);
  if (desde) query = query.gte("data", desde);

  const { data, error } = await query.returns<(MovimentoClassificado & { org_id: string; intercompany_org_id: string | null })[]>();
  if (error) throw error;

  return (data ?? []).filter(
    (m) =>
      (m.org_id === orgAId && m.intercompany_org_id === orgBId) ||
      (m.org_id === orgBId && m.intercompany_org_id === orgAId)
  );
}

/** Soma o que precisa ser eliminado do Balanço consolidado (ativo/passivo que uma empresa do grupo tem contra a outra). */
export async function getEliminacaoBP(
  supabase: SupabaseClient,
  orgAId: string,
  orgBId: string,
  data: string
): Promise<EliminacaoBP> {
  const movs = await getMovimentosIntercompany(supabase, orgAId, orgBId, data);
  const eliminacao: EliminacaoBP = { ativoCirculante: 0, ativoNaoCirculante: 0, passivoCirculante: 0, passivoNaoCirculante: 0 };

  for (const m of movs) {
    const valor = Number(m.valor_saldo);
    // Caixa não é eliminado: é dinheiro real que efetivamente saiu de uma
    // empresa do grupo e entrou na outra (contas bancárias distintas),
    // diferente de um saldo a receber/pagar em aberto entre elas.
    if (m.natureza === "ATIVO" && !m.is_caixa) {
      if (m.circulante) eliminacao.ativoCirculante += valor;
      else eliminacao.ativoNaoCirculante += valor;
    } else if (m.natureza === "PASSIVO") {
      if (m.circulante) eliminacao.passivoCirculante += valor;
      else eliminacao.passivoNaoCirculante += valor;
    }
  }

  return eliminacao;
}

/** Soma o que precisa ser eliminado da DRE consolidada (receita de uma empresa do grupo que é despesa/custo da outra). */
export async function getEliminacaoDRE(
  supabase: SupabaseClient,
  orgAId: string,
  orgBId: string,
  inicio: string,
  fim: string
): Promise<EliminacaoDRE> {
  const movs = await getMovimentosIntercompany(supabase, orgAId, orgBId, fim, inicio);
  const eliminacao: EliminacaoDRE = { receita: 0, despesa: 0 };

  for (const m of movs) {
    if (m.natureza === "RECEITA") eliminacao.receita += Number(m.valor_saldo);
    if (m.natureza === "DESPESA") eliminacao.despesa += Number(m.valor_saldo);
  }

  return eliminacao;
}

// ---------------------------------------------------------------------
// Balanço Patrimonial consolidado
// ---------------------------------------------------------------------

export type BalancoConsolidado = {
  data: string;
  empresas: { orgId: string; nome: string; percentual: number }[];
  ativoCirculante: number;
  ativoNaoCirculante: number;
  ativoTotal: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  passivoTotal: number;
  patrimonioLiquidoControladora: number;
  participacaoNaoControladores: number;
  patrimonioLiquidoConsolidado: number;
  eliminacaoAtivo: number;
  eliminacaoPassivo: number;
};

export async function getBalancoConsolidado(
  supabase: SupabaseClient,
  investidoraOrgId: string,
  investidoraNome: string,
  data: string
): Promise<BalancoConsolidado | null> {
  const participacoes = (await getParticipacoes(supabase, investidoraOrgId)).filter((p) => p.tipo === "CONTROLADA");
  if (participacoes.length === 0) return null;

  const base = await getBalanco(supabase, investidoraOrgId, data);

  let ativoCirculante = base.ativoCirculante;
  let ativoNaoCirculante = base.ativoNaoCirculante;
  let passivoCirculante = base.passivoCirculante;
  let passivoNaoCirculante = base.passivoNaoCirculante;
  let patrimonioLiquidoControladora = base.patrimonioLiquido;
  let participacaoNaoControladores = 0;
  let eliminacaoAtivo = 0;
  let eliminacaoPassivo = 0;

  const empresas = [{ orgId: investidoraOrgId, nome: investidoraNome, percentual: 1 }];

  for (const p of participacoes) {
    const controlada = await getBalanco(supabase, p.investida_org_id, data);
    ativoCirculante += controlada.ativoCirculante;
    ativoNaoCirculante += controlada.ativoNaoCirculante;
    passivoCirculante += controlada.passivoCirculante;
    passivoNaoCirculante += controlada.passivoNaoCirculante;

    patrimonioLiquidoControladora += controlada.patrimonioLiquido * p.percentual;
    participacaoNaoControladores += controlada.patrimonioLiquido * (1 - p.percentual);

    const elim = await getEliminacaoBP(supabase, investidoraOrgId, p.investida_org_id, data);
    ativoCirculante -= elim.ativoCirculante;
    ativoNaoCirculante -= elim.ativoNaoCirculante;
    passivoCirculante -= elim.passivoCirculante;
    passivoNaoCirculante -= elim.passivoNaoCirculante;
    eliminacaoAtivo += elim.ativoCirculante + elim.ativoNaoCirculante;
    eliminacaoPassivo += elim.passivoCirculante + elim.passivoNaoCirculante;

    empresas.push({ orgId: p.investida_org_id, nome: p.investida_nome, percentual: p.percentual });
  }

  return {
    data,
    empresas,
    ativoCirculante,
    ativoNaoCirculante,
    ativoTotal: ativoCirculante + ativoNaoCirculante,
    passivoCirculante,
    passivoNaoCirculante,
    passivoTotal: passivoCirculante + passivoNaoCirculante,
    patrimonioLiquidoControladora,
    participacaoNaoControladores,
    patrimonioLiquidoConsolidado: patrimonioLiquidoControladora + participacaoNaoControladores,
    eliminacaoAtivo,
    eliminacaoPassivo,
  };
}

// ---------------------------------------------------------------------
// DRE consolidada
// ---------------------------------------------------------------------

export type DreConsolidada = {
  periodoInicio: string;
  periodoFim: string;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  lucroBruto: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  resultadoAntesImpostos: number;
  impostosSobreLucro: number;
  lucroLiquidoConsolidado: number;
  participacaoNaoControladoresNoResultado: number;
  lucroLiquidoAtribuivelControladora: number;
  eliminacaoReceita: number;
  eliminacaoDespesa: number;
};

export async function getDREConsolidada(
  supabase: SupabaseClient,
  investidoraOrgId: string,
  inicio: string,
  fim: string
): Promise<DreConsolidada | null> {
  const participacoes = (await getParticipacoes(supabase, investidoraOrgId)).filter((p) => p.tipo === "CONTROLADA");
  if (participacoes.length === 0) return null;

  const base = await getDRE(supabase, investidoraOrgId, inicio, fim);

  const acc = {
    receitaBruta: base.receitaBruta,
    deducoes: base.deducoes,
    custos: base.custos,
    despesasOperacionais: base.despesasOperacionais,
    resultadoAntesImpostos: base.resultadoAntesImpostos,
    impostosSobreLucro: base.impostosSobreLucro,
  };
  let participacaoNaoControladoresNoResultado = 0;
  let eliminacaoReceita = 0;
  let eliminacaoDespesa = 0;

  for (const p of participacoes) {
    const c: Dre = await getDRE(supabase, p.investida_org_id, inicio, fim);
    acc.receitaBruta += c.receitaBruta;
    acc.deducoes += c.deducoes;
    acc.custos += c.custos;
    acc.despesasOperacionais += c.despesasOperacionais;
    acc.resultadoAntesImpostos += c.resultadoAntesImpostos;
    acc.impostosSobreLucro += c.impostosSobreLucro;

    participacaoNaoControladoresNoResultado += c.lucroLiquido * (1 - p.percentual);

    const elim = await getEliminacaoDRE(supabase, investidoraOrgId, p.investida_org_id, inicio, fim);
    acc.receitaBruta -= elim.receita;
    acc.despesasOperacionais -= elim.despesa;
    eliminacaoReceita += elim.receita;
    eliminacaoDespesa += elim.despesa;
  }

  const receitaLiquida = acc.receitaBruta - acc.deducoes;
  const lucroBruto = receitaLiquida - acc.custos;
  const resultadoOperacional = lucroBruto - acc.despesasOperacionais;
  const lucroLiquidoConsolidado = acc.resultadoAntesImpostos - acc.impostosSobreLucro;

  return {
    periodoInicio: inicio,
    periodoFim: fim,
    receitaBruta: acc.receitaBruta,
    deducoes: acc.deducoes,
    receitaLiquida,
    custos: acc.custos,
    lucroBruto,
    despesasOperacionais: acc.despesasOperacionais,
    resultadoOperacional,
    resultadoAntesImpostos: acc.resultadoAntesImpostos,
    impostosSobreLucro: acc.impostosSobreLucro,
    lucroLiquidoConsolidado,
    participacaoNaoControladoresNoResultado,
    lucroLiquidoAtribuivelControladora: lucroLiquidoConsolidado - participacaoNaoControladoresNoResultado,
    eliminacaoReceita,
    eliminacaoDespesa,
  };
}

// ---------------------------------------------------------------------
// Resumo por participação (usado tanto para controladas quanto
// coligadas — para coligadas, é a única visão de consolidação: MEP)
// ---------------------------------------------------------------------

export type ResumoParticipacao = {
  participacao: Participacao;
  patrimonioLiquidoInvestida: number;
  lucroLiquidoInvestidaNoPeriodo: number;
  valorPelaEquivalencia: number;
  resultadoDeEquivalenciaNoPeriodo: number;
};

export async function getResumoParticipacoes(
  supabase: SupabaseClient,
  investidoraOrgId: string,
  data: string,
  inicioPeriodo: string
): Promise<ResumoParticipacao[]> {
  const participacoes = await getParticipacoes(supabase, investidoraOrgId);
  const resultado: ResumoParticipacao[] = [];

  for (const p of participacoes) {
    const balanco: Balanco = await getBalanco(supabase, p.investida_org_id, data);
    const dre: Dre = await getDRE(supabase, p.investida_org_id, inicioPeriodo, data);

    resultado.push({
      participacao: p,
      patrimonioLiquidoInvestida: balanco.patrimonioLiquido,
      lucroLiquidoInvestidaNoPeriodo: dre.lucroLiquido,
      valorPelaEquivalencia: balanco.patrimonioLiquido * p.percentual,
      resultadoDeEquivalenciaNoPeriodo: dre.lucroLiquido * p.percentual,
    });
  }

  return resultado;
}
