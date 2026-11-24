import type { NotaNegociacao } from "@/lib/import/nota-negociacao";
import { ultimoCupomAte } from "@/lib/portfolio/conciliar-posicoes-nucleo";

// =====================================================================
// Monta, a partir de uma nota de negociação de COMPRA, tudo o que será
// gravado: conta contábil do papel (nova ou existente), cadastro do Ativo
// (Carteira/Acruo/Vencimentos) e o lançamento:
//   D ativo (principal)
//   D juros acruados 1.1.2.x (juros pagos na compra — o 1º cupom baixa esse valor)
//   D despesas financeiras (comissão + taxas — custo de transação vai para o
//     resultado: os ETFs/fundos são avaliados a mercado no resultado, e nos
//     títulos o tratamento fica igual para não misturar critério)
//   C caixa do banco (valor líquido)
// Esta parte é pura (sem banco de dados), para ser testável.
// =====================================================================

export type Custodiante = "Itaú" | "XP/Bradesco";

export type AtivoContexto = {
  id: string;
  nome: string;
  custodiante: string | null;
  isin: string | null;
  conta_code: string | null;
  quantidade: number | string | null;
  valor_face: number | string | null;
  categoria_acruo: string | null;
  grupo_acruo_nome: string | null;
  conta_acruo_code: string | null;
  conta_receita_code: string | null;
  conta_ganho_perda_mercado_code: string | null;
};

export type ContaContexto = { code: string; name: string; natureza: string; is_leaf?: boolean | null };

export type LinhaProposta = { conta_code: string; conta_nome: string; tipo: "D" | "C"; valor: number };

export type PropostaNota = {
  nota: NotaNegociacao;
  custodiante: Custodiante;
  dataLancamento: string;
  historico: string;
  /** Ativo já existente (aumento de posição) ou null (papel novo). */
  ativoExistente: { id: string; nome: string; conta_code: string } | null;
  contaNova: { code: string; name: string; dataVencimento: string | null } | null;
  ativoNovo: {
    nome: string;
    custodiante: Custodiante;
    tipo: string;
    isin: string | null;
    quantidade: number;
    valor_face: number | null;
    valor_atual: number;
    taxa_cupom: number | null;
    data_vencimento: string | null;
    categoria_acruo: string;
    periodicidade_cupom: string | null;
    data_pagamento_anterior: string | null;
    grupo_acruo_nome: string | null;
    conta_acruo_code: string | null;
    conta_receita_code: string | null;
    conta_ganho_perda_mercado_code: string | null;
  } | null;
  linhas: LinhaProposta[];
  avisos: string[];
};

export function ehBradesco(c: string | null) {
  return /bradesco|xp|pershing/i.test(c ?? "");
}

function idsDoAtivo(a: AtivoContexto) {
  return (a.isin ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function bate(ids: string[], isin: string | null, cusip: string | null) {
  return ids.some(
    (id) =>
      (isin && id === isin) ||
      (cusip && id === cusip) ||
      (cusip && id.length === 12 && id.slice(2, 11) === cusip) ||
      (isin && cusip == null && id.length === 9 && isin.slice(2, 11) === id)
  );
}

function proximoCodigo(prefixo: string, contas: ContaContexto[]) {
  const sufixos = contas
    .filter((c) => c.code.startsWith(`${prefixo}.`) && c.code.split(".").length === prefixo.split(".").length + 1)
    .map((c) => parseInt(c.code.slice(prefixo.length + 1), 10))
    .filter((n) => Number.isFinite(n));
  const prox = (sufixos.length ? Math.max(...sufixos) : 0) + 1;
  return `${prefixo}.${String(prox).padStart(3, "0")}`;
}

function contaPorNome(contas: ContaContexto[], natureza: string, re: RegExp) {
  return contas.find((c) => c.natureza === natureza && c.is_leaf !== false && re.test(c.name)) ?? null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function mesesAte(dataISO: string, vencISO: string) {
  const [a1, m1] = dataISO.split("-").map(Number);
  const [a2, m2] = vencISO.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function montarPropostaNota(
  nota: NotaNegociacao,
  ctx: { ativos: AtivoContexto[]; contas: ContaContexto[]; custodiante?: Custodiante }
): PropostaNota {
  const avisos: string[] = [];
  const custodiante: Custodiante = ctx.custodiante ?? (nota.banco === "bradesco" ? "XP/Bradesco" : "Itaú");
  const brad = custodiante === "XP/Bradesco";
  const nomeConta = (code: string) => ctx.contas.find((c) => c.code === code)?.name ?? code;

  // Data do lançamento = data em que o caixa é debitado no extrato do banco (assim o
  // débito do extrato reconhece a compra como "já lançada" e não duplica):
  // Itaú debita na data da operação; Bradesco/Pershing na liquidação.
  const dataLancamento = brad ? nota.dataLiquidacao ?? nota.dataOperacao : nota.dataOperacao;

  const doCustodiante = ctx.ativos.filter((a) => ehBradesco(a.custodiante) === brad);
  let existente =
    nota.isin || nota.cusip
      ? doCustodiante.find((a) => a.conta_code && bate(idsDoAtivo(a), nota.isin, nota.cusip)) ?? null
      : null;
  // Sem ISIN/CUSIP na nota (ex.: Itaú só traz "iShares Core SP 500 - CSPX LN"): tenta pelo ticker
  // no nome do Ativo do mesmo custodiante — só se houver exatamente um candidato.
  if (!existente && nota.ticker && nota.ticker.length >= 3) {
    const re = new RegExp(`\\b${nota.ticker.replace(/[^A-Za-z0-9]/g, "")}\\b`, "i");
    const cands = doCustodiante.filter((a) => a.conta_code && re.test(a.nome));
    if (cands.length === 1) existente = cands[0];
  }

  // Contas de apoio do custodiante
  const caixa = brad
    ? contaPorNome(ctx.contas, "ATIVO", /caixa.*bradesco/i)
    : contaPorNome(ctx.contas, "ATIVO", /caixa.*ita[uú]/i);
  const despesa = brad
    ? contaPorNome(ctx.contas, "DESPESA", /despesas financeiras.*(bradesco|xp)/i)
    : contaPorNome(ctx.contas, "DESPESA", /despesas financeiras.*ita[uú]/i);
  if (!caixa) throw new Error(`Não encontrei a conta de caixa do ${custodiante} no Plano de Contas.`);
  if (!despesa && nota.comissao + nota.taxas > 0) {
    throw new Error(`Não encontrei a conta de despesas financeiras do ${custodiante} no Plano de Contas.`);
  }

  const ehTitulo = nota.tipoAtivo === "titulo";
  // Grupo de acruo / marcação a mercado: o mais usado pelos papéis do mesmo custodiante.
  const maisComum = <T,>(itens: T[], chave: (t: T) => string | null) => {
    const cont = new Map<string, { n: number; item: T }>();
    for (const it of itens) {
      const k = chave(it);
      if (!k) continue;
      const atual = cont.get(k);
      cont.set(k, { n: (atual?.n ?? 0) + 1, item: atual?.item ?? it });
    }
    return [...cont.values()].sort((a, b) => b.n - a.n)[0]?.item ?? null;
  };
  const grupoRef = maisComum(
    doCustodiante.filter((a) => a.categoria_acruo === "periodico" && a.conta_acruo_code && a.conta_receita_code),
    (a) => a.grupo_acruo_nome
  );
  const mercadoRef = maisComum(
    doCustodiante.filter((a) => a.conta_ganho_perda_mercado_code),
    (a) => a.conta_ganho_perda_mercado_code
  );

  let contaAtivo: string;
  let contaNova: PropostaNota["contaNova"] = null;
  let ativoNovo: PropostaNota["ativoNovo"] = null;
  const nomeCurto = nota.descricao
    .replace(/ISIN#?\s*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 70);

  if (existente) {
    contaAtivo = existente.conta_code as string;
    avisos.push(`Papel já cadastrado na Carteira (${existente.nome}) — a compra aumenta essa posição.`);
  } else {
    const longoPrazo = ehTitulo && nota.vencimento != null && mesesAte(nota.dataOperacao, nota.vencimento) > 12;
    const prefixo = longoPrazo ? (brad ? "1.2.4" : "1.2.3") : brad ? "1.1.4" : "1.1.3";
    contaAtivo = proximoCodigo(prefixo, ctx.contas);
    contaNova = { code: contaAtivo, name: `${nomeCurto} (${custodiante})`, dataVencimento: nota.vencimento };

    const periodicidade = ehTitulo ? nota.periodicidade ?? "semestral" : null;
    if (ehTitulo && !nota.periodicidade) avisos.push("A nota não informa a periodicidade do cupom — assumi semestral; ajuste se necessário.");
    if (ehTitulo && !grupoRef) avisos.push(`Não encontrei um grupo de juros acruados do ${custodiante} para vincular o título.`);
    if (!ehTitulo && !mercadoRef) avisos.push(`Não encontrei a conta de marcação a mercado do ${custodiante}.`);

    ativoNovo = {
      nome: `${nomeCurto} (${custodiante})`,
      custodiante,
      tipo: ehTitulo ? "renda_fixa" : nota.tipoAtivo === "acao" ? "acao" : "fundo",
      isin: nota.isin ?? nota.cusip,
      quantidade: nota.quantidade,
      valor_face: ehTitulo ? nota.quantidade : null,
      valor_atual: r2(nota.principal),
      taxa_cupom: ehTitulo && nota.taxaCupom != null ? nota.taxaCupom / 100 : null,
      data_vencimento: ehTitulo ? nota.vencimento : null,
      categoria_acruo: ehTitulo ? "periodico" : "mercado",
      periodicidade_cupom: periodicidade,
      data_pagamento_anterior:
        ehTitulo && nota.vencimento && periodicidade
          ? ultimoCupomAte(nota.vencimento, periodicidade, nota.dataLiquidacao ?? nota.dataOperacao)
          : null,
      grupo_acruo_nome: ehTitulo ? grupoRef?.grupo_acruo_nome ?? null : null,
      conta_acruo_code: ehTitulo ? grupoRef?.conta_acruo_code ?? null : null,
      conta_receita_code: ehTitulo ? grupoRef?.conta_receita_code ?? null : null,
      conta_ganho_perda_mercado_code: ehTitulo ? null : mercadoRef?.conta_ganho_perda_mercado_code ?? null,
    };
  }

  // Conta de juros acruados: a do grupo do papel (existente ou novo).
  const contaJuros = existente
    ? existente.conta_acruo_code ?? grupoRef?.conta_acruo_code ?? null
    : ativoNovo?.conta_acruo_code ?? null;
  if (nota.jurosAcruados > 0 && !contaJuros) {
    throw new Error("A nota tem juros acruados pagos, mas não encontrei a conta de juros acruados (1.1.2.x) do papel.");
  }

  const linhas: LinhaProposta[] = [
    { conta_code: contaAtivo, conta_nome: contaNova?.name ?? nomeConta(contaAtivo), tipo: "D", valor: r2(nota.principal) },
  ];
  if (nota.jurosAcruados > 0) {
    linhas.push({ conta_code: contaJuros!, conta_nome: nomeConta(contaJuros!), tipo: "D", valor: r2(nota.jurosAcruados) });
  }
  const custos = r2(nota.comissao + nota.taxas);
  if (custos > 0) linhas.push({ conta_code: despesa!.code, conta_nome: despesa!.name, tipo: "D", valor: custos });
  const totalD = r2(linhas.reduce((s, l) => s + l.valor, 0));
  linhas.push({ conta_code: caixa.code, conta_nome: caixa.name, tipo: "C", valor: totalD });
  if (Math.abs(totalD - nota.valorLiquido) > 0.02) {
    avisos.push(`O total do lançamento (${totalD.toFixed(2)}) difere do valor líquido da nota (${nota.valorLiquido.toFixed(2)}).`);
  }

  const qtd = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(nota.quantidade);
  const historico =
    `Compra ${nota.ticker && !nomeCurto.toUpperCase().includes(nota.ticker.toUpperCase()) ? `${nota.ticker} ` : ""}${nomeCurto} — ${qtd} a ${nota.preco}` +
    `${nota.numeroNegocio ? ` (nota ${nota.numeroNegocio})` : ""}` +
    `${custos > 0 ? `; comissão/taxas ${custos.toFixed(2)} em despesa` : ""}`;

  return {
    nota,
    custodiante,
    dataLancamento,
    historico: historico.replace(/\s+/g, " ").trim().slice(0, 300),
    ativoExistente: existente ? { id: existente.id, nome: existente.nome, conta_code: existente.conta_code as string } : null,
    contaNova,
    ativoNovo,
    linhas,
    avisos,
  };
}
