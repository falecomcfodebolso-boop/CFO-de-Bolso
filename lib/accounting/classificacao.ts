/**
 * Heurísticas de classificação automática de contas do Plano de Contas
 * para viabilizar as demonstrações financeiras (DRE, Balanço, DFC, DMPL)
 * sem exigir que o usuário classifique cada conta manualmente.
 *
 * A classificação é aplicada no momento da criação da conta (manual ou
 * via IA) com base no nome informado. O usuário pode ajustar depois na
 * tela de Plano de Contas.
 */

export type Natureza = "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA" | "CONTROLE";

export type GrupoDre =
  | "receita_bruta"
  | "deducoes"
  | "custos"
  | "despesas_operacionais"
  | "receitas_financeiras"
  | "despesas_financeiras"
  | "impostos_sobre_lucro"
  | "outras_receitas_despesas";

export type GrupoDfc = "operacional" | "investimento" | "financiamento";

export type Classificacao = {
  circulante: boolean | null;
  is_caixa: boolean;
  grupo_dre: GrupoDre | null;
  grupo_dfc: GrupoDfc | null;
};

const PALAVRAS_CAIXA = [
  "caixa",
  "banco",
  "conta corrente",
  "conta movimento",
  "equivalentes de caixa",
  "aplicaç",
  "cdb",
  "poupança",
];
const PALAVRAS_FINANCEIRA_DESPESA = [
  "juros pass",
  "juros de empr",
  "despesa financeira",
  "iof",
  "tarifa banc",
  "encargo financeiro",
];
const PALAVRAS_FINANCEIRA_RECEITA = ["juros", "rendimento", "receita financeira"];
const PALAVRAS_CUSTO = ["custo da merc", "cmv", "custo do servi", "csp", "custo de produ", "cpv"];
const PALAVRAS_IMPOSTO_LUCRO = ["irpj", "csll", "imposto de renda", "contribuição social sobre"];
const PALAVRAS_DEDUCAO = [
  "devolu",
  "imposto sobre vendas",
  "icms sobre vendas",
  "iss sobre",
  "pis sobre",
  "cofins sobre",
  "abatimento",
];
const PALAVRAS_NAO_CIRCULANTE_ATIVO = [
  "imobilizado",
  "intangível",
  "investimento perman",
  "imóve",
  "veículo",
  "máquina",
  "equipamento",
  "participaç societ",
  "depreciação acumulada",
];
const PALAVRAS_NAO_CIRCULANTE_PASSIVO = [
  "empréstimo de longo prazo",
  "financiamento de longo prazo",
  "financiamento lp",
  "empréstimo lp",
];

function contemAlguma(texto: string, palavras: string[]) {
  const t = texto.toLowerCase();
  return palavras.some((p) => t.includes(p));
}

export function classificarConta(natureza: Natureza, name: string): Classificacao {
  const nome = name || "";

  if (natureza === "ATIVO") {
    const isCaixa = contemAlguma(nome, PALAVRAS_CAIXA);
    const naoCirculante = contemAlguma(nome, PALAVRAS_NAO_CIRCULANTE_ATIVO);
    return {
      circulante: !naoCirculante,
      is_caixa: isCaixa,
      grupo_dre: null,
      grupo_dfc: isCaixa ? null : naoCirculante ? "investimento" : "operacional",
    };
  }

  if (natureza === "PASSIVO") {
    const naoCirculante = contemAlguma(nome, PALAVRAS_NAO_CIRCULANTE_PASSIVO);
    return {
      circulante: !naoCirculante,
      is_caixa: false,
      grupo_dre: null,
      grupo_dfc: naoCirculante ? "financiamento" : "operacional",
    };
  }

  if (natureza === "PL") {
    return { circulante: null, is_caixa: false, grupo_dre: null, grupo_dfc: "financiamento" };
  }

  if (natureza === "RECEITA") {
    if (contemAlguma(nome, PALAVRAS_FINANCEIRA_RECEITA)) {
      return { circulante: null, is_caixa: false, grupo_dre: "receitas_financeiras", grupo_dfc: "operacional" };
    }
    if (contemAlguma(nome, PALAVRAS_DEDUCAO)) {
      return { circulante: null, is_caixa: false, grupo_dre: "deducoes", grupo_dfc: "operacional" };
    }
    return { circulante: null, is_caixa: false, grupo_dre: "receita_bruta", grupo_dfc: "operacional" };
  }

  if (natureza === "DESPESA") {
    if (contemAlguma(nome, PALAVRAS_IMPOSTO_LUCRO)) {
      return { circulante: null, is_caixa: false, grupo_dre: "impostos_sobre_lucro", grupo_dfc: "operacional" };
    }
    if (contemAlguma(nome, PALAVRAS_FINANCEIRA_DESPESA)) {
      return { circulante: null, is_caixa: false, grupo_dre: "despesas_financeiras", grupo_dfc: "operacional" };
    }
    if (contemAlguma(nome, PALAVRAS_CUSTO)) {
      return { circulante: null, is_caixa: false, grupo_dre: "custos", grupo_dfc: "operacional" };
    }
    return { circulante: null, is_caixa: false, grupo_dre: "despesas_operacionais", grupo_dfc: "operacional" };
  }

  return { circulante: null, is_caixa: false, grupo_dre: null, grupo_dfc: null };
}

export const GRUPO_DRE_LABEL: Record<GrupoDre, string> = {
  receita_bruta: "Receita Bruta",
  deducoes: "Deduções da Receita",
  custos: "Custos",
  despesas_operacionais: "Despesas Operacionais",
  receitas_financeiras: "Receitas Financeiras",
  despesas_financeiras: "Despesas Financeiras",
  impostos_sobre_lucro: "Impostos sobre o Lucro",
  outras_receitas_despesas: "Outras Receitas/Despesas",
};

export const GRUPO_DFC_LABEL: Record<GrupoDfc, string> = {
  operacional: "Atividades Operacionais",
  investimento: "Atividades de Investimento",
  financiamento: "Atividades de Financiamento",
};
