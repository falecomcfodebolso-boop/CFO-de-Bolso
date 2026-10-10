import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrupoDfc, GrupoDre, Natureza } from "./classificacao";
import { arredondarCentavos } from "@/lib/format";

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
  eh_abertura: boolean;
  eh_encerramento: boolean;
};

/**
 * Todos os movimentos da organização até `ate` (inclusive), opcionalmente a partir de `desde`.
 *
 * Lançamentos de ENCERRAMENTO (eh_encerramento = true — zeram Receita/Despesa no fim do
 * exercício e transferem o líquido pra conta de PL "Resultado do Exercício") são sempre
 * ignorados quando a consulta é por um PERÍODO (`desde` informado): DRE e DMPL precisam
 * mostrar o resultado real do período, não o lançamento que zera as contas pro período
 * seguinte. Já uma consulta "desde sempre até uma data" (`desde` omitido — usada pelo
 * Balanço, Carteira, Dashboard) precisa enxergar o encerramento normalmente, porque é
 * exatamente ele que zera a Receita/Despesa acumulada a partir do exercício seguinte.
 */
async function getMovimentos(supabase: SupabaseClient, orgId: string, ate: string, desde?: string) {
  let query = supabase.from("v_movimento_contas").select("*").eq("org_id", orgId).lte("data", ate);
  if (desde) query = query.gte("data", desde);
  const { data, error } = await query.returns<MovimentoClassificado[]>();
  if (error) throw error;
  const movs = data ?? [];
  return desde ? movs.filter((m) => !m.eh_encerramento) : movs;
}

function diaAnterior(dataISO: string) {
  const d = new Date(`${dataISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Agrupamento por "conta mãe" — compartilhado entre todas as demonstrações
// (Balanço, DRE, DFC) que mostram contas-folha e se beneficiam de um
// subtotal intermediário pra facilitar a leitura.
// ---------------------------------------------------------------------

export type ContaSaldo = { code: string; name: string; saldo: number };

/**
 * Contas-filha agrupadas sob uma "conta mãe" (ex.: "1.1.3 — Aplicações
 * Financeiras - Banco Itaú" agrupando "1.1.3.001", "1.1.3.002", ...) — o
 * agrupamento é inferido pelo prefixo do código (truncando o último
 * segmento), não por `parent_code` (que hoje não é preenchido no cadastro
 * de contas). `subtotal` é a soma dos saldos das `contas`.
 */
export type GrupoContas = { code: string; name: string; subtotal: number; contas: ContaSaldo[] };

/** Busca o nome de cada conta do plano de contas da org, por código — usado pra "rotular" os grupos de conta-mãe inferidos por prefixo. */
async function getNomePorCodigo(supabase: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("plano_de_contas").select("code, name").eq("org_id", orgId);
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.code as string, c.name as string]));
}

/** Agrupa uma lista de contas-folha pela "conta mãe" (código sem o último segmento). */
function agruparPorContaMae(contas: ContaSaldo[], nomePorCodigo: Map<string, string>): GrupoContas[] {
  const porPai = new Map<string, ContaSaldo[]>();
  for (const c of contas) {
    const partes = c.code.split(".");
    const paiCode = partes.length > 1 ? partes.slice(0, -1).join(".") : c.code;
    if (!porPai.has(paiCode)) porPai.set(paiCode, []);
    porPai.get(paiCode)!.push(c);
  }
  return Array.from(porPai.entries())
    .map(([paiCode, itens]) => ({
      code: paiCode,
      name: nomePorCodigo.get(paiCode) ?? paiCode,
      subtotal: arredondarCentavos(itens.reduce((acc, c) => acc + c.saldo, 0)),
      contas: itens,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// ---------------------------------------------------------------------
// DRE — Demonstração do Resultado do Exercício
// ---------------------------------------------------------------------

/** Soma `valor_saldo` por conta dentro de um grupo da DRE. `absoluto: true` pras categorias de despesa/dedução, cujo sinal já é consistente dentro do grupo (ver uso de `Math.abs` nos totais agregados abaixo). */
function contasPorGrupoDre(movs: MovimentoClassificado[], grupo: GrupoDre, absoluto: boolean): ContaSaldo[] {
  const porConta = new Map<string, { name: string; saldo: number }>();
  for (const m of movs) {
    if (m.grupo_dre !== grupo) continue;
    const atual = porConta.get(m.conta_code) ?? { name: m.conta_name, saldo: 0 };
    atual.saldo += Number(m.valor_saldo);
    porConta.set(m.conta_code, atual);
  }
  return Array.from(porConta.entries())
    .map(([code, c]) => ({ code, name: c.name, saldo: arredondarCentavos(absoluto ? Math.abs(c.saldo) : c.saldo) }))
    .filter((c) => Math.abs(c.saldo) > 0.001)
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Caso especial do grupo "outras_receitas_despesas": mistura contas de RECEITA e DESPESA — cada conta aparece com o sinal que já teria na exibição (receita positiva, despesa negativa), pra somar certinho no total "outras". */
function contasOutrasReceitasDespesas(movs: MovimentoClassificado[]): ContaSaldo[] {
  const porConta = new Map<string, { name: string; natureza: Natureza; saldo: number }>();
  for (const m of movs) {
    if (m.grupo_dre !== "outras_receitas_despesas") continue;
    const atual = porConta.get(m.conta_code) ?? { name: m.conta_name, natureza: m.natureza, saldo: 0 };
    atual.saldo += Number(m.valor_saldo);
    porConta.set(m.conta_code, atual);
  }
  return Array.from(porConta.entries())
    .map(([code, c]) => ({
      code,
      name: c.name,
      saldo: arredondarCentavos(c.natureza === "DESPESA" ? -Math.abs(c.saldo) : c.saldo),
    }))
    .filter((c) => Math.abs(c.saldo) > 0.001)
    .sort((a, b) => a.code.localeCompare(b.code));
}

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
  // Contas-folha de cada categoria, agrupadas por "conta mãe" — usado pra
  // mostrar subtotais intermediários na DRE (ex.: detalhar quais contas
  // compõem "Despesas Operacionais"), facilitando a leitura.
  gruposReceitaBruta: GrupoContas[];
  gruposDeducoes: GrupoContas[];
  gruposCustos: GrupoContas[];
  gruposDespesasOperacionais: GrupoContas[];
  gruposReceitasFinanceiras: GrupoContas[];
  gruposDespesasFinanceiras: GrupoContas[];
  gruposOutras: GrupoContas[];
  gruposImpostosSobreLucro: GrupoContas[];
};

export async function getDRE(
  supabase: SupabaseClient,
  orgId: string,
  inicio: string,
  fim: string
): Promise<Dre> {
  const [movs, nomePorCodigo] = await Promise.all([
    getMovimentos(supabase, orgId, fim, inicio),
    getNomePorCodigo(supabase, orgId),
  ]);

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

  const gruposReceitaBruta = agruparPorContaMae(contasPorGrupoDre(movs, "receita_bruta", false), nomePorCodigo);
  const gruposDeducoes = agruparPorContaMae(contasPorGrupoDre(movs, "deducoes", true), nomePorCodigo);
  const gruposCustos = agruparPorContaMae(contasPorGrupoDre(movs, "custos", true), nomePorCodigo);
  const gruposDespesasOperacionais = agruparPorContaMae(
    contasPorGrupoDre(movs, "despesas_operacionais", true),
    nomePorCodigo
  );
  const gruposReceitasFinanceiras = agruparPorContaMae(
    contasPorGrupoDre(movs, "receitas_financeiras", false),
    nomePorCodigo
  );
  const gruposDespesasFinanceiras = agruparPorContaMae(
    contasPorGrupoDre(movs, "despesas_financeiras", true),
    nomePorCodigo
  );
  const gruposOutras = agruparPorContaMae(contasOutrasReceitasDespesas(movs), nomePorCodigo);
  const gruposImpostosSobreLucro = agruparPorContaMae(
    contasPorGrupoDre(movs, "impostos_sobre_lucro", true),
    nomePorCodigo
  );

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
    gruposReceitaBruta,
    gruposDeducoes,
    gruposCustos,
    gruposDespesasOperacionais,
    gruposReceitasFinanceiras,
    gruposDespesasFinanceiras,
    gruposOutras,
    gruposImpostosSobreLucro,
  };
}

// ---------------------------------------------------------------------
// Balanço Patrimonial
// ---------------------------------------------------------------------

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
  // Mesmas contas acima, só que agrupadas por "conta mãe" (código truncado
  // no último segmento) — usado pra mostrar subtotais intermediários no
  // Balanço, facilitando a leitura (ex.: ver o total de "Aplicações
  // Financeiras - Itaú" sem somar papel a papel).
  gruposAtivoCirculante: GrupoContas[];
  gruposAtivoNaoCirculante: GrupoContas[];
  gruposPassivoCirculante: GrupoContas[];
  gruposPassivoNaoCirculante: GrupoContas[];
  gruposPl: GrupoContas[];
};

export async function getBalanco(supabase: SupabaseClient, orgId: string, data: string): Promise<Balanco> {
  const [movs, nomePorCodigo] = await Promise.all([
    getMovimentos(supabase, orgId, data),
    getNomePorCodigo(supabase, orgId),
  ]);

  const porConta = new Map<string, { name: string; natureza: Natureza; circulante: boolean | null; saldo: number }>();
  for (const m of movs) {
    if (m.natureza !== "ATIVO" && m.natureza !== "PASSIVO" && m.natureza !== "PL") continue;
    const atual = porConta.get(m.conta_code) ?? {
      name: m.conta_name,
      natureza: m.natureza,
      circulante: m.circulante,
      saldo: 0,
    };
    atual.saldo = arredondarCentavos(atual.saldo + Number(m.valor_saldo));
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

  const gruposAtivoCirculante = agruparPorContaMae(contasAtivoCirculante, nomePorCodigo);
  const gruposAtivoNaoCirculante = agruparPorContaMae(contasAtivoNaoCirculante, nomePorCodigo);
  const gruposPassivoCirculante = agruparPorContaMae(contasPassivoCirculante, nomePorCodigo);
  const gruposPassivoNaoCirculante = agruparPorContaMae(contasPassivoNaoCirculante, nomePorCodigo);
  const gruposPl = agruparPorContaMae(contasPl, nomePorCodigo);

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
    gruposAtivoCirculante,
    gruposAtivoNaoCirculante,
    gruposPassivoCirculante,
    gruposPassivoNaoCirculante,
    gruposPl,
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
  // Contrapartidas de cada categoria, agrupadas por "conta mãe" — mostra
  // quais contas compuseram, por ex., as Atividades de Investimento.
  gruposOperacional: GrupoContas[];
  gruposInvestimento: GrupoContas[];
  gruposFinanciamento: GrupoContas[];
};

export async function getDFC(supabase: SupabaseClient, orgId: string, inicio: string, fim: string): Promise<Dfc> {
  const [movsAteInicio, movsPeriodo, nomePorCodigo] = await Promise.all([
    getMovimentos(supabase, orgId, diaAnterior(inicio)),
    getMovimentos(supabase, orgId, fim, inicio),
    getNomePorCodigo(supabase, orgId),
  ]);

  const saldoInicialCaixa = movsAteInicio
    .filter((m) => m.is_caixa)
    .reduce((acc, m) => acc + Number(m.valor_saldo), 0);

  const porLancamento = new Map<string, MovimentoClassificado[]>();
  for (const m of movsPeriodo) {
    const arr = porLancamento.get(m.lancamento_id) ?? [];
    arr.push(m);
    porLancamento.set(m.lancamento_id, arr);
  }

  let operacional = 0;
  let investimento = 0;
  let financiamento = 0;

  const porContaOperacional = new Map<string, { name: string; saldo: number }>();
  const porContaInvestimento = new Map<string, { name: string; saldo: number }>();
  const porContaFinanciamento = new Map<string, { name: string; saldo: number }>();

  const acumular = (
    mapa: Map<string, { name: string; saldo: number }>,
    code: string,
    name: string,
    parte: number
  ) => {
    const atual = mapa.get(code) ?? { name, saldo: 0 };
    atual.saldo += parte;
    mapa.set(code, atual);
  };

  for (const linhas of porLancamento.values()) {
    // Lançamentos de "saldo de abertura" (importação em massa de saldos
    // iniciais) misturam, nas mesmas linhas, o saldo inicial de Caixa com
    // os saldos iniciais de todos os outros ativos/PL — não é uma
    // movimentação de caixa do período, é a fotografia do dia zero. Se
    // não forem ignorados aqui, o saldo inicial de Caixa seria rateado
    // entre as contrapartidas como se fosse Atividade Operacional/
    // Investimento real, gerando valores sem sentido econômico. Esse
    // saldo de Caixa já é considerado corretamente em saldoInicialCaixa,
    // acima, que soma os saldos de Caixa até o dia anterior ao período.
    if (linhas[0]?.eh_abertura) continue;

    const linhasCaixa = linhas.filter((l) => l.is_caixa);
    if (linhasCaixa.length === 0) continue;

    const linhasOutras = linhas.filter((l) => !l.is_caixa);
    if (linhasOutras.length === 0) continue; // transferência entre caixas: não afeta o total

    const cashDelta = linhasCaixa.reduce((acc, l) => acc + Number(l.valor_saldo), 0);
    const totalOutras = linhasOutras.reduce((acc, l) => acc + Number(l.valor), 0);

    for (const l of linhasOutras) {
      const peso = totalOutras > 0 ? Number(l.valor) / totalOutras : 1 / linhasOutras.length;
      const parte = cashDelta * peso;
      if (l.grupo_dfc === "investimento") {
        investimento += parte;
        acumular(porContaInvestimento, l.conta_code, l.conta_name, parte);
      } else if (l.grupo_dfc === "financiamento") {
        financiamento += parte;
        acumular(porContaFinanciamento, l.conta_code, l.conta_name, parte);
      } else {
        operacional += parte;
        acumular(porContaOperacional, l.conta_code, l.conta_name, parte);
      }
    }
  }

  const paraContas = (mapa: Map<string, { name: string; saldo: number }>): ContaSaldo[] =>
    Array.from(mapa.entries())
      .map(([code, c]) => ({ code, name: c.name, saldo: arredondarCentavos(c.saldo) }))
      .filter((c) => Math.abs(c.saldo) > 0.001)
      .sort((a, b) => a.code.localeCompare(b.code));

  const gruposOperacional = agruparPorContaMae(paraContas(porContaOperacional), nomePorCodigo);
  const gruposInvestimento = agruparPorContaMae(paraContas(porContaInvestimento), nomePorCodigo);
  const gruposFinanciamento = agruparPorContaMae(paraContas(porContaFinanciamento), nomePorCodigo);

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
    gruposOperacional,
    gruposInvestimento,
    gruposFinanciamento,
  };
}

// ---------------------------------------------------------------------
// DMPL — Demonstração das Mutações do Patrimônio Líquido
// ---------------------------------------------------------------------

export type DmplConta = { code: string; name: string; saldoInicial: number; movimento: number; saldoFinal: number };

/** Mesmo agrupamento por "conta mãe" das demais demonstrações, mas pra contas de DMPL (que têm 3 colunas: saldo inicial, movimento do período e saldo final). */
export type GrupoDmpl = {
  code: string;
  name: string;
  saldoInicial: number;
  movimento: number;
  saldoFinal: number;
  contas: DmplConta[];
};

function agruparDmplPorContaMae(contas: DmplConta[], nomePorCodigo: Map<string, string>): GrupoDmpl[] {
  const porPai = new Map<string, DmplConta[]>();
  for (const c of contas) {
    const partes = c.code.split(".");
    const paiCode = partes.length > 1 ? partes.slice(0, -1).join(".") : c.code;
    if (!porPai.has(paiCode)) porPai.set(paiCode, []);
    porPai.get(paiCode)!.push(c);
  }
  return Array.from(porPai.entries())
    .map(([paiCode, itens]) => ({
      code: paiCode,
      name: nomePorCodigo.get(paiCode) ?? paiCode,
      saldoInicial: arredondarCentavos(itens.reduce((acc, c) => acc + c.saldoInicial, 0)),
      movimento: arredondarCentavos(itens.reduce((acc, c) => acc + c.movimento, 0)),
      saldoFinal: arredondarCentavos(itens.reduce((acc, c) => acc + c.saldoFinal, 0)),
      contas: itens,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export type Dmpl = {
  periodoInicio: string;
  periodoFim: string;
  saldoInicial: number;
  aportes: number;
  distribuicoes: number;
  resultadoPeriodo: number;
  saldoFinal: number;
  contas: DmplConta[];
  // Mesmas contas acima, agrupadas por "conta mãe" — facilita a leitura
  // quando há mais de uma conta de capital/reserva do mesmo grupo.
  grupos: GrupoDmpl[];
};

export async function getDMPL(supabase: SupabaseClient, orgId: string, inicio: string, fim: string): Promise<Dmpl> {
  const [movsAteInicio, movsPeriodo, dre, nomePorCodigo] = await Promise.all([
    getMovimentos(supabase, orgId, diaAnterior(inicio)),
    getMovimentos(supabase, orgId, fim, inicio),
    getDRE(supabase, orgId, inicio, fim),
    getNomePorCodigo(supabase, orgId),
  ]);

  const saldoInicialPorConta = new Map<string, { name: string; saldo: number }>();
  for (const m of movsAteInicio) {
    if (m.natureza !== "PL") continue;
    const atual = saldoInicialPorConta.get(m.conta_code) ?? { name: m.conta_name, saldo: 0 };
    atual.saldo = arredondarCentavos(atual.saldo + Number(m.valor_saldo));
    saldoInicialPorConta.set(m.conta_code, atual);
  }

  const movimentoPorConta = new Map<string, { name: string; movimento: number }>();
  for (const m of movsPeriodo) {
    if (m.natureza !== "PL") continue;
    const atual = movimentoPorConta.get(m.conta_code) ?? { name: m.conta_name, movimento: 0 };
    atual.movimento = arredondarCentavos(atual.movimento + Number(m.valor_saldo));
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

  const grupos = agruparDmplPorContaMae(contas, nomePorCodigo);

  const saldoInicial = contas.reduce((acc, c) => acc + c.saldoInicial, 0);
  const aportes = contas.reduce((acc, c) => acc + (c.movimento > 0 ? c.movimento : 0), 0);
  const distribuicoes = contas.reduce((acc, c) => acc + (c.movimento < 0 ? c.movimento : 0), 0);
  const resultadoPeriodo = dre.lucroLiquido;
  const saldoFinal = saldoInicial + aportes + distribuicoes + resultadoPeriodo;

  return {
    periodoInicio: inicio,
    periodoFim: fim,
    saldoInicial,
    aportes,
    distribuicoes,
    resultadoPeriodo,
    saldoFinal,
    contas,
    grupos,
  };
}
