// Helpers de mapeamento de colunas usados na migração/carga em massa de
// dados contábeis pré-existentes (plano de contas, saldos de abertura,
// lançamentos históricos). Isolado num arquivo sem dependências pesadas
// (sem ExcelJS/Papaparse) para poder ser importado também em componentes
// client (sugestão de mapeamento reagindo ao arquivo analisado), sem
// puxar libs server-only para o bundle do navegador.

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export type Natureza = "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA" | "CONTROLE";

const NATUREZA_PALAVRAS: Record<Natureza, string[]> = {
  ATIVO: ["ativo"],
  PASSIVO: ["passivo"],
  PL: ["patrimonio liquido", "patrimonio", " pl", "pl ", "capital social"],
  RECEITA: ["receita"],
  DESPESA: ["despesa", "custo"],
  CONTROLE: ["controle", "memorando", "memo"],
};

/** Extrai o código no início de uma célula do tipo "1.1.1.001 - Caixa - Banco Itaú" (comum quando a
 *  planilha de origem já mostra "código - nome da conta" numa coluna só de referência à conta). */
export function extrairCodigoDeCelula(valor: string): string {
  const m = valor.trim().match(/^([0-9]+(?:\.[0-9]+)*)\s*[-\u2013\u2014]/);
  return m ? m[1] : valor.trim();
}

/** Tenta reconhecer a natureza contábil a partir de texto livre (ex: exportado de outro sistema). */
export function normalizarNatureza(raw: string): Natureza | null {
  const norm = ` ${normalizarTexto(raw)} `;
  for (const nat of Object.keys(NATUREZA_PALAVRAS) as Natureza[]) {
    if (NATUREZA_PALAVRAS[nat].some((p) => norm.includes(p))) return nat;
  }
  return null;
}

export type CampoMapeavel = { campo: string; rotulo: string; obrigatorio: boolean; palavrasChave: string[] };

/** Para cada campo-alvo, sugere o índice da coluna do arquivo mais provável, por palavra-chave no cabeçalho. */
export function sugerirMapeamento(headers: string[], campos: CampoMapeavel[]): Record<string, number | null> {
  const norm = headers.map((h) => normalizarTexto(h));
  const sugestao: Record<string, number | null> = {};
  for (const { campo, palavrasChave } of campos) {
    const idx = norm.findIndex((h) => palavrasChave.some((p) => h.includes(p)));
    sugestao[campo] = idx;
  }
  return sugestao;
}

export const CAMPOS_CONTAS: CampoMapeavel[] = [
  { campo: "code", rotulo: "Código da conta", obrigatorio: true, palavrasChave: ["codigo", "code", "cod conta", "conta"] },
  { campo: "name", rotulo: "Nome da conta", obrigatorio: true, palavrasChave: ["nome", "descricao", "name"] },
  { campo: "natureza", rotulo: "Natureza (Ativo/Passivo/PL/Receita/Despesa)", obrigatorio: true, palavrasChave: ["natureza", "tipo", "grupo", "classe"] },
  { campo: "parent_code", rotulo: "Conta pai (opcional)", obrigatorio: false, palavrasChave: ["conta pai", "parent", "conta superior", "agrupador"] },
];

export const CAMPOS_SALDOS: CampoMapeavel[] = [
  { campo: "conta", rotulo: "Código ou nome da conta", obrigatorio: true, palavrasChave: ["codigo", "conta", "code"] },
  { campo: "valor", rotulo: "Saldo", obrigatorio: true, palavrasChave: ["saldo", "valor", "amount"] },
];

// O formato aceito é o de um diário contábil "de verdade": um lançamento pode ter várias linhas
// de débito e várias de crédito (não só uma de cada). Cada linha da planilha é uma perna (débito OU
// crédito) de um lançamento; uma nova linha do diário (identificada pela coluna Data preenchida)
// inicia um novo lançamento — linhas seguintes com Data em branco pertencem ao mesmo lançamento,
// exatamente como planilhas contábeis tradicionalmente organizam isso.
export const CAMPOS_LANCAMENTOS: CampoMapeavel[] = [
  { campo: "data", rotulo: "Data (preenchida só na 1ª linha de cada lançamento)", obrigatorio: true, palavrasChave: ["data", "date"] },
  { campo: "historico", rotulo: "Histórico/Descrição", obrigatorio: true, palavrasChave: ["historico", "descricao", "memo"] },
  { campo: "conta_debito", rotulo: "Conta débito", obrigatorio: false, palavrasChave: ["conta debito", "conta débito", "debit account"] },
  { campo: "valor_debito", rotulo: "Valor débito", obrigatorio: false, palavrasChave: ["valor debito", "valor débito", "debito", "debit"] },
  { campo: "conta_credito", rotulo: "Conta crédito", obrigatorio: false, palavrasChave: ["conta credito", "conta crédito", "credit account"] },
  { campo: "valor_credito", rotulo: "Valor crédito", obrigatorio: false, palavrasChave: ["valor credito", "valor crédito", "credito", "credit"] },
];
