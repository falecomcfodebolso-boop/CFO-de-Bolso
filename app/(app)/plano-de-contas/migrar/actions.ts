"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { lerArquivoGenerico } from "@/lib/import/genericos";
import { parseDataFlexivel, parseValorFlexivel, ParseError } from "@/lib/import/parsers";
import { normalizarNatureza, normalizarTexto, type Natureza } from "@/lib/import/mapeamento";
import { classificarConta } from "@/lib/accounting/classificacao";

export type AnaliseArquivo =
  | { ok: true; headers: string[]; amostra: string[][]; totalLinhas: number }
  | { ok: false; erro: string };

/** Lê o arquivo e devolve cabeçalhos + amostra, para a etapa de mapeamento de colunas. */
export async function analisarArquivoAction(_prev: unknown, formData: FormData): Promise<AnaliseArquivo> {
  const { currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { ok: false, erro: "Seu papel (viewer) não permite importar dados." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Selecione um arquivo." };

  try {
    const buffer = await arquivo.arrayBuffer();
    const { headers, linhas } = await lerArquivoGenerico(arquivo.name, buffer);
    return { ok: true, headers, amostra: linhas.slice(0, 8), totalLinhas: linhas.length };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof ParseError ? e.message : "Não consegui ler o arquivo. Confira o formato (.csv, .xls, .xlsx).",
    };
  }
}

export type ResultadoImportacao = { erro?: string; criadas?: number; avisos?: string[] };

function colIndex(formData: FormData, campo: string): number {
  const raw = formData.get(campo);
  const n = Number(raw);
  return raw === null || raw === "" || Number.isNaN(n) ? -1 : n;
}

/** Carga em massa do plano de contas a partir de um arquivo exportado de outro sistema. */
export async function importarContasAction(_prev: unknown, formData: FormData): Promise<ResultadoImportacao> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { erro: "Seu papel (viewer) não permite importar dados." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo novamente." };

  const colCode = colIndex(formData, "col_code");
  const colName = colIndex(formData, "col_name");
  const colNatureza = colIndex(formData, "col_natureza");
  const colParent = colIndex(formData, "col_parent_code");

  if (colCode < 0 || colName < 0 || colNatureza < 0) {
    return { erro: "Selecione as colunas de código, nome e natureza antes de confirmar." };
  }

  let linhas: string[][];
  try {
    const buffer = await arquivo.arrayBuffer();
    ({ linhas } = await lerArquivoGenerico(arquivo.name, buffer));
  } catch (e) {
    return { erro: e instanceof ParseError ? e.message : "Não consegui reler o arquivo." };
  }

  const { data: existentes } = await supabase.from("plano_de_contas").select("code").eq("org_id", currentOrgId);
  const codigosExistentes = new Set((existentes ?? []).map((c) => c.code as string));
  const vistoNestaImportacao = new Set<string>();
  const avisos: string[] = [];

  const paraCriar = linhas.reduce<Record<string, unknown>[]>((acc, linha, i) => {
    const code = String(linha[colCode] ?? "").trim();
    const name = String(linha[colName] ?? "").trim();
    const naturezaRaw = String(linha[colNatureza] ?? "").trim();
    const parentCode = colParent >= 0 ? String(linha[colParent] ?? "").trim() || null : null;

    if (!code || !name) {
      avisos.push(`Linha ${i + 2}: sem código ou nome — ignorada.`);
      return acc;
    }
    const natureza = normalizarNatureza(naturezaRaw);
    if (!natureza) {
      avisos.push(`Linha ${i + 2}: natureza "${naturezaRaw}" não reconhecida — ignorada.`);
      return acc;
    }
    if (codigosExistentes.has(code) || vistoNestaImportacao.has(code)) {
      avisos.push(`Linha ${i + 2}: código "${code}" já existe — ignorada.`);
      return acc;
    }
    vistoNestaImportacao.add(code);
    acc.push({
      org_id: currentOrgId,
      code,
      name,
      natureza,
      parent_code: parentCode,
      ...classificarConta(natureza as Natureza, name),
    });
    return acc;
  }, []);

  if (paraCriar.length === 0) {
    return { erro: "Nenhuma linha pôde ser importada — confira os avisos.", avisos };
  }

  const { error } = await supabase.from("plano_de_contas").insert(paraCriar);
  if (error) return { erro: error.message, avisos };

  revalidatePath("/plano-de-contas");
  return { criadas: paraCriar.length, avisos };
}

/** Carga em massa dos saldos de abertura, lançados como um único lançamento contábil na data informada. */
export async function importarSaldosAction(_prev: unknown, formData: FormData): Promise<ResultadoImportacao> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { erro: "Seu papel (viewer) não permite importar dados." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo novamente." };

  const colConta = colIndex(formData, "col_conta");
  const colValor = colIndex(formData, "col_valor");
  const dataAbertura = String(formData.get("data_abertura") || "").trim();
  const contaContrapartida = String(formData.get("conta_contrapartida") || "").trim() || null;

  if (colConta < 0 || colValor < 0) return { erro: "Selecione as colunas de conta e valor antes de confirmar." };
  if (!dataAbertura) return { erro: "Informe a data de abertura." };

  let linhas: string[][];
  try {
    const buffer = await arquivo.arrayBuffer();
    ({ linhas } = await lerArquivoGenerico(arquivo.name, buffer));
  } catch (e) {
    return { erro: e instanceof ParseError ? e.message : "Não consegui reler o arquivo." };
  }

  const { data: contas } = await supabase
    .from("plano_de_contas")
    .select("code, name, natureza")
    .eq("org_id", currentOrgId);
  const porCode = new Map((contas ?? []).map((c) => [c.code as string, c]));
  const porNome = new Map((contas ?? []).map((c) => [normalizarTexto(c.name as string), c]));

  const avisos: string[] = [];
  const linhasLancamento: { conta_code: string; tipo: "D" | "C"; valor: number }[] = [];

  linhas.forEach((linha, i) => {
    const chave = String(linha[colConta] ?? "").trim();
    const valorRaw = String(linha[colValor] ?? "").trim();
    if (!chave && !valorRaw) return;

    const conta = porCode.get(chave) ?? porNome.get(normalizarTexto(chave));
    if (!conta) {
      avisos.push(`Linha ${i + 2}: conta "${chave}" não encontrada no plano de contas — ignorada.`);
      return;
    }
    const valor = parseValorFlexivel(valorRaw);
    if (valor === null || valor === 0) {
      avisos.push(`Linha ${i + 2}: valor "${valorRaw}" inválido ou zero — ignorada.`);
      return;
    }

    const ladoNormalDebito = conta.natureza === "ATIVO" || conta.natureza === "DESPESA";
    const debito = ladoNormalDebito ? valor > 0 : valor < 0;
    linhasLancamento.push({ conta_code: conta.code as string, tipo: debito ? "D" : "C", valor: Math.abs(valor) });
  });

  if (linhasLancamento.length === 0) {
    return { erro: "Nenhuma linha pôde ser importada — confira os avisos.", avisos };
  }

  const totalD = linhasLancamento.filter((l) => l.tipo === "D").reduce((a, l) => a + l.valor, 0);
  const totalC = linhasLancamento.filter((l) => l.tipo === "C").reduce((a, l) => a + l.valor, 0);
  const diferenca = Math.round((totalD - totalC) * 100) / 100;

  if (Math.abs(diferenca) > 0.01) {
    if (!contaContrapartida) {
      return {
        erro: `Os saldos não fecham (débitos ${totalD.toFixed(2)} vs. créditos ${totalC.toFixed(2)}, diferença de ${diferenca.toFixed(2)}). Selecione uma conta de contrapartida para lançar a diferença, ou corrija a planilha.`,
        avisos,
      };
    }
    const contaAjuste = porCode.get(contaContrapartida);
    if (!contaAjuste) return { erro: "Conta de contrapartida inválida.", avisos };
    linhasLancamento.push({
      conta_code: contaAjuste.code as string,
      tipo: diferenca > 0 ? "C" : "D",
      valor: Math.abs(diferenca),
    });
  }

  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", currentOrgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numero = (maxNumero?.numero ?? 0) + 1;

  const { error } = await supabase.rpc("create_lancamento", {
    p_org_id: currentOrgId,
    p_numero: numero,
    p_data: dataAbertura,
    p_historico: "Saldos de abertura (importação em massa)",
    p_linhas: linhasLancamento,
    p_intercompany_org_id: null,
  });
  if (error) return { erro: error.message, avisos };

  revalidatePath("/diario");
  revalidatePath("/balancete");
  revalidatePath("/razoes");
  return { criadas: linhasLancamento.length, avisos };
}

const LIMITE_LINHAS_LANCAMENTOS = 500;

/** Carga em massa de lançamentos históricos — cada linha do arquivo vira um lançamento de 2 linhas (débito/crédito). */
export async function importarLancamentosAction(_prev: unknown, formData: FormData): Promise<ResultadoImportacao> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { erro: "Seu papel (viewer) não permite importar dados." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo novamente." };

  const colData = colIndex(formData, "col_data");
  const colHistorico = colIndex(formData, "col_historico");
  const colDebito = colIndex(formData, "col_debito");
  const colCredito = colIndex(formData, "col_credito");
  const colValor = colIndex(formData, "col_valor");

  if ([colData, colHistorico, colDebito, colCredito, colValor].some((c) => c < 0)) {
    return { erro: "Selecione todas as colunas obrigatórias antes de confirmar." };
  }

  let linhas: string[][];
  try {
    const buffer = await arquivo.arrayBuffer();
    ({ linhas } = await lerArquivoGenerico(arquivo.name, buffer));
  } catch (e) {
    return { erro: e instanceof ParseError ? e.message : "Não consegui reler o arquivo." };
  }

  if (linhas.length > LIMITE_LINHAS_LANCAMENTOS) {
    return {
      erro: `O arquivo tem ${linhas.length} linhas — por segurança, importe no máximo ${LIMITE_LINHAS_LANCAMENTOS} lançamentos por vez (divida o arquivo em partes e importe em várias rodadas).`,
    };
  }

  const { data: contas } = await supabase.from("plano_de_contas").select("code, name").eq("org_id", currentOrgId);
  const porCode = new Map((contas ?? []).map((c) => [c.code as string, c.code as string]));
  const porNome = new Map((contas ?? []).map((c) => [normalizarTexto(c.name as string), c.code as string]));
  const resolverConta = (chave: string) => porCode.get(chave) ?? porNome.get(normalizarTexto(chave)) ?? null;

  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", currentOrgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  let numero = maxNumero?.numero ?? 0;

  const avisos: string[] = [];
  let criadas = 0;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const dataRaw = String(linha[colData] ?? "").trim();
    const historico = String(linha[colHistorico] ?? "").trim() || "Importado";
    const debitoRaw = String(linha[colDebito] ?? "").trim();
    const creditoRaw = String(linha[colCredito] ?? "").trim();
    const valorRaw = String(linha[colValor] ?? "").trim();

    if (!dataRaw && !debitoRaw && !creditoRaw && !valorRaw) continue;

    const data = parseDataFlexivel(dataRaw);
    const valor = parseValorFlexivel(valorRaw);
    const contaDebito = resolverConta(debitoRaw);
    const contaCredito = resolverConta(creditoRaw);

    if (!data) {
      avisos.push(`Linha ${i + 2}: data "${dataRaw}" inválida — ignorada.`);
      continue;
    }
    if (valor === null || valor <= 0) {
      avisos.push(`Linha ${i + 2}: valor "${valorRaw}" inválido — ignorada.`);
      continue;
    }
    if (!contaDebito) {
      avisos.push(`Linha ${i + 2}: conta débito "${debitoRaw}" não encontrada — ignorada.`);
      continue;
    }
    if (!contaCredito) {
      avisos.push(`Linha ${i + 2}: conta crédito "${creditoRaw}" não encontrada — ignorada.`);
      continue;
    }

    numero += 1;
    const { error } = await supabase.rpc("create_lancamento", {
      p_org_id: currentOrgId,
      p_numero: numero,
      p_data: data,
      p_historico: historico,
      p_linhas: [
        { conta_code: contaDebito, tipo: "D", valor: Math.abs(valor) },
        { conta_code: contaCredito, tipo: "C", valor: Math.abs(valor) },
      ],
      p_intercompany_org_id: null,
    });
    if (error) {
      avisos.push(`Linha ${i + 2}: erro ao gravar — ${error.message}`);
      numero -= 1;
      continue;
    }
    criadas++;
  }

  if (criadas > 0) {
    revalidatePath("/diario");
    revalidatePath("/balancete");
    revalidatePath("/razoes");
    revalidatePath("/consolidado");
  }

  return { criadas, avisos };
}
