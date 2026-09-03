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

export type Natureza = "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA";

const NATUREZA_PALAVRAS: Record<Natureza, string[]> = {
  ATIVO: ["ativo"],
  PASSIVO: ["passivo"],
  PL: ["patrimonio liquido", "patrimonio", " pl", "pl ", "capital social"],
  RECEITA: ["receita"],
  DESPESA: ["despesa", "custo"],
};

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

export const CAMPOS_LANCAMENTOS: CampoMapeavel[] = [
  { campo: "data", rotulo: "Data", obrigatorio: true, palavrasChave: ["data", "date"] },
  { campo: "historico", rotulo: "Histórico/Descrição", obrigatorio: true, palavrasChave: ["historico", "descricao", "memo"] },
  { campo: "debito", rotulo: "Conta débito", obrigatorio: true, palavrasChave: ["debito", "conta debito", "debit"] },
  { campo: "credito", rotulo: "Conta crédito", obrigatorio: true, palavrasChave: ["credito", "conta credito", "credit"] },
  { campo: "valor", rotulo: "Valor", obrigatorio: true, palavrasChave: ["valor", "amount"] },
];
