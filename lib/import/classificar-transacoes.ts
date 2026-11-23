import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransacaoExtraida } from "./parsers";
import { sugerirClassificacoes, type ContaResumo, type SugestaoClassificacao } from "./classify";

// =====================================================================
// Classificação das transações de um extrato — ÚNICO ponto usado pela tela
// de Importar e pela automação. Três camadas, nesta ordem:
//
// 1) REGRA FIXA DE CUPOM (sem IA): recebimento de juros/cupom de um papel
//    com acruamento NUNCA é receita. A receita já é reconhecida mês a mês
//    na apuração de acruo; o recebimento só BAIXA o ativo de juros acruados
//    a receber (D Banco / C 1.1.2.x do grupo do papel). Lançar de novo como
//    receita conta o mesmo juro duas vezes.
// 2) IA para o resto, já avisada do banco do extrato e da regra acima.
// 3) TRAVAS sobre a resposta da IA: descarta (deixa em branco, para escolha
//    manual) qualquer sugestão de conta de OUTRO custodiante (ex.: conta
//    "(XP/Bradesco)" num extrato do Itaú) e qualquer receita sugerida para
//    um recebimento de cupom.
//
// E na hora de lançar, validarContrapartida() bloqueia o mesmo erro mesmo
// quando a conta é escolhida à mão.
// =====================================================================

const RE_CUPOM =
  /(BOND INTEREST|INTEREST RECEIVED|INTEREST PAYMENT|COUPON|BROK\.TRANS\W+INT\b|RECEBIMENTO DE JUROS|PAGAMENTO DE CUPOM)/i;
// Compra de título/fundo: a contrapartida precisa ser a conta DAQUELE ativo.
const RE_COMPRA = /(SECURITY PURCHASE|\bBOT\b|PURCHASED|\bBUY\b|COMPRA DE)/i;
const RE_ISIN_CUSIP = /\b([A-Z]{2}[A-Z0-9]{9}\d|[0-9A-Z]{9})\b/g;
const RE_DATA_CURTA = /(\d{2})[.,/](\d{2})[.,/](\d{2,4})/g;
const RE_FACE = /\$\s?([\d,]{4,})|\b(\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s+at\b/gi;
const TOKENS_GENERICOS = new Set(["CLN", "INC", "CORP", "BANK", "FIN", "GLOB", "GLOBAL", "INTL", "CO", "SA", "THE", "AND", "NOTE", "FUND", "ITAU", "BRADESCO", "XP"]);

export type Custodiante = "itau" | "bradesco" | null;

type AtivoPool = {
  nome: string;
  isin: string | null;
  data_vencimento: string | null;
  valor_face: number | null;
  /** null = papel sem acruo (ex.: marcado a mercado) — o cupom dele É receita. */
  conta_acruo_code: string | null;
  grupo_acruo_nome: string | null;
  custodiante: string | null;
};

/** Resultado da identificação do papel citado num recebimento de cupom. */
export type IdentificacaoCupom =
  | { tipo: "acruo"; conta: string } // papel com acruo → baixa juros acruados (nunca receita)
  | { tipo: "sem_acruo" } // papel identificado, sem acruo → receita é o correto
  | { tipo: "desconhecido" };

/** Palavras do nome da conta (≥3 letras, sem as genéricas) que aparecem na descrição. */
function nomeDaContaNaDescricao(nomeConta: string, descricao: string): boolean {
  const desc = new Set(normalizar(descricao).replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean));
  return normalizar(nomeConta)
    .replace(/\(.*?\)/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !TOKENS_GENERICOS.has(t) && !/^\d+$/.test(t))
    .some((t) => desc.has(t));
}

export function ehRecebimentoDeCupom(t: { descricao: string; valor: number }): boolean {
  return t.valor > 0 && RE_CUPOM.test(t.descricao);
}

/** "Itaú" ou "XP/Bradesco" pelo nome da conta (contas de caixa ficam de fora — transferência entre bancos é legítima). */
export function custodianteDaConta(nome: string): Custodiante {
  if (/XP\s*\/\s*Bradesco|Bradesco\s*\/\s*XP|\(XP/i.test(nome)) return "bradesco";
  if (/ita[uú]/i.test(nome)) return "itau";
  if (/bradesco/i.test(nome)) return "bradesco";
  return null;
}

function normalizar(s: string) {
  return s.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function grupoDoCustodiante(a: AtivoPool, custodiante: Custodiante) {
  if (!custodiante) return true;
  const doAtivo = a.grupo_acruo_nome
    ? a.grupo_acruo_nome === "XP/Bradesco"
      ? "bradesco"
      : "itau"
    : custodianteDaConta(a.custodiante ?? "");
  return doAtivo === custodiante;
}

/**
 * Identifica o papel citado na descrição de um recebimento de cupom (ISIN/CUSIP; senão por
 * pontuação: vencimento na descrição +3, nome +2, valor de face +1) entre os papéis DO MESMO
 * custodiante do extrato.
 */
export function identificarCupom(descricao: string, ativos: AtivoPool[]): IdentificacaoCupom {
  const resultado = (a: AtivoPool): IdentificacaoCupom =>
    a.conta_acruo_code ? { tipo: "acruo", conta: a.conta_acruo_code } : { tipo: "sem_acruo" };
  const desc = normalizar(descricao);

  for (const id of desc.match(RE_ISIN_CUSIP) ?? []) {
    const a = ativos.find((x) =>
      (x.isin ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .some((i) => i === id || i.slice(2, 11) === id)
    );
    if (a) return resultado(a);
  }

  const datas = new Set<string>();
  for (const m of desc.matchAll(RE_DATA_CURTA)) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    datas.add(`${ano}-${m[2]}-${m[1]}`);
  }
  const faces = new Set<number>();
  for (const m of descricao.matchAll(RE_FACE)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (n >= 1000) faces.add(n);
  }
  const tokensDesc = new Set(desc.replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean));

  let melhor = 0;
  let escolhidos: AtivoPool[] = [];
  for (const a of ativos) {
    let pts = 0;
    if (a.data_vencimento && datas.has(a.data_vencimento)) pts += 3;
    if (a.valor_face && faces.has(Number(a.valor_face))) pts += 1;
    const tokensNome = normalizar(a.nome)
      .replace(/\(.*?\)/g, " ")
      .replace(/[^A-Z ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !TOKENS_GENERICOS.has(t));
    if (tokensNome.some((t) => tokensDesc.has(t))) pts += 2;
    if (pts > melhor) {
      melhor = pts;
      escolhidos = [a];
    } else if (pts === melhor && pts > 0) {
      escolhidos.push(a);
    }
  }
  if (melhor > 0) {
    const desfechos = new Set(escolhidos.map((a) => a.conta_acruo_code ?? "SEM_ACRUO"));
    if (desfechos.size === 1) return resultado(escolhidos[0]);
  }
  // Papel não identificado, mas o custodiante só tem um grupo de acruo (ex.: XP/Bradesco → 1.1.2.006)
  const pools = new Set(ativos.map((a) => a.conta_acruo_code).filter((c): c is string => !!c));
  if (pools.size === 1) return { tipo: "acruo", conta: [...pools][0] };
  return { tipo: "desconhecido" };
}

async function carregarContexto(supabase: SupabaseClient, orgId: string, contaBancariaCode: string) {
  const [{ data: banco }, { data: ativosData }] = await Promise.all([
    supabase.from("plano_de_contas").select("name").eq("org_id", orgId).eq("code", contaBancariaCode).maybeSingle(),
    supabase
      .from("ativos")
      .select("nome, isin, data_vencimento, valor_face, conta_acruo_code, grupo_acruo_nome, custodiante")
      .eq("org_id", orgId),
  ]);
  const nomeBanco = (banco?.name as string | undefined) ?? contaBancariaCode;
  const custodiante = custodianteDaConta(nomeBanco);
  const ativos = ((ativosData ?? []) as AtivoPool[])
    .map((a) => ({ ...a, conta_acruo_code: a.conta_acruo_code ? a.conta_acruo_code.split(",")[0].trim() : null }))
    .filter((a) => grupoDoCustodiante(a, custodiante));
  return { nomeBanco, custodiante, ativos };
}

export async function classificarTransacoes(
  supabase: SupabaseClient,
  orgId: string,
  contaBancariaCode: string,
  transacoes: TransacaoExtraida[],
  contas: ContaResumo[]
): Promise<(SugestaoClassificacao | null)[]> {
  const { nomeBanco, custodiante, ativos } = await carregarContexto(supabase, orgId, contaBancariaCode);
  const porCodigo = new Map(contas.map((c) => [c.code, c]));

  // 1) Regra fixa de cupom
  const fixas = new Map<number, SugestaoClassificacao | null>();
  const cupomSemPapel = new Set<number>(); // cupom de papel não identificado: IA pode sugerir, mas nunca receita
  transacoes.forEach((t, index) => {
    if (!ehRecebimentoDeCupom(t)) return;
    const id = identificarCupom(t.descricao, ativos);
    if (id.tipo === "acruo") {
      fixas.set(index, porCodigo.has(id.conta) ? { index, conta_code: id.conta, confianca: "alta" } : null);
    } else if (id.tipo === "desconhecido") {
      cupomSemPapel.add(index);
    }
    // "sem_acruo": papel marcado a mercado — segue para a IA normalmente (receita é o correto)
  });

  // 2) IA para o que sobrou
  const restantes = transacoes.map((t, i) => ({ t, i })).filter(({ i }) => !fixas.has(i));
  let ia: SugestaoClassificacao[] = [];
  if (restantes.length > 0) {
    ia = await sugerirClassificacoes(
      restantes.map(({ t }) => t),
      contas,
      { nomeBanco }
    );
  }

  // 3) Travas sobre a IA
  const resultado: (SugestaoClassificacao | null)[] = transacoes.map((_, i) => fixas.get(i) ?? null);
  restantes.forEach(({ i }, k) => {
    const s = ia[k];
    if (!s?.conta_code) return;
    const conta = porCodigo.get(s.conta_code);
    if (!conta) return;
    const outroCustodiante =
      custodiante && !conta.code.startsWith("1.1.1.") && custodianteDaConta(conta.name) && custodianteDaConta(conta.name) !== custodiante;
    if (outroCustodiante) return;
    if (cupomSemPapel.has(i) && conta.natureza === "RECEITA") return;
    // Compra de ativo: só aceita a conta se o nome dela aparecer na descrição (evita, p.ex.,
    // "BOT 51 CSTNL" — compra do ETF — ir para a conta do título da GM).
    const t = transacoes[i];
    if (
      t.valor < 0 &&
      RE_COMPRA.test(t.descricao) &&
      conta.natureza === "ATIVO" &&
      !conta.code.startsWith("1.1.1.") &&
      !nomeDaContaNaDescricao(conta.name, t.descricao)
    )
      return;
    resultado[i] = { index: i, conta_code: s.conta_code, confianca: cupomSemPapel.has(i) ? "baixa" : s.confianca };
  });
  return resultado;
}

/**
 * Validação na hora de LANÇAR (vale para escolha manual também). Devolve a mensagem de erro, ou null se ok.
 */
export async function validarContrapartida(
  supabase: SupabaseClient,
  orgId: string,
  contaBancariaCode: string,
  transacao: { descricao: string; valor: number },
  contaCode: string
): Promise<string | null> {
  const { data: conta } = await supabase
    .from("plano_de_contas")
    .select("code, name, natureza")
    .eq("org_id", orgId)
    .eq("code", contaCode)
    .maybeSingle();
  if (!conta) return null;
  const { custodiante, ativos } = await carregarContexto(supabase, orgId, contaBancariaCode);

  if (ehRecebimentoDeCupom(transacao) && conta.natureza === "RECEITA") {
    const id = identificarCupom(transacao.descricao, ativos);
    if (id.tipo === "acruo") {
      return `"${transacao.descricao.slice(0, 50)}" é recebimento de cupom de papel com acruo: deve baixar os juros acruados a receber (${id.conta}), não ir para receita — a receita já foi reconhecida na apuração de acruo.`;
    }
  }
  const custConta = conta.code.startsWith("1.1.1.") ? null : custodianteDaConta(conta.name);
  if (custodiante && custConta && custConta !== custodiante) {
    return `A conta ${conta.code} (${conta.name}) é de outro custodiante — este extrato é do ${
      custodiante === "itau" ? "Itaú" : "Bradesco/XP"
    }.`;
  }
  return null;
}
