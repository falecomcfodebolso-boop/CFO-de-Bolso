"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { lerArquivoGenerico } from "@/lib/import/genericos";
import { parseDataFlexivel, parseValorFlexivel, ParseError } from "@/lib/import/parsers";
import { extrairCodigoDeCelula, normalizarTexto } from "@/lib/import/mapeamento";

export type AnaliseArquivo =
  | { ok: true; headers: string[]; amostra: string[][]; totalLinhas: number }
  | { ok: false; erro: string };

export async function analisarArquivoAtivosAction(_prev: unknown, formData: FormData): Promise<AnaliseArquivo> {
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

const TIPOS_VALIDOS = new Set(["renda_fixa", "fundo", "acao", "outro"]);

function normalizarTipo(raw: string): string {
  const n = normalizarTexto(raw);
  if (!n) return "renda_fixa";
  if (n.includes("fundo") || n.includes("fund")) return "fundo";
  if (n.includes("acao") || n.includes("acoes") || n.includes("stock") || n.includes("equity")) return "acao";
  if (n.includes("renda fixa") || n.includes("bond") || n.includes("fixed")) return "renda_fixa";
  if (TIPOS_VALIDOS.has(n)) return n;
  return "outro";
}

/** Carga em massa de ativos da carteira (renda fixa, fundos, ações etc.) a partir de qualquer CSV/XLS/XLSX. */
export async function importarAtivosAction(_prev: unknown, formData: FormData): Promise<ResultadoImportacao> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { erro: "Seu papel (viewer) não permite importar dados." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o arquivo novamente." };

  const colNome = colIndex(formData, "col_nome");
  const colCustodiante = colIndex(formData, "col_custodiante");
  const colTipo = colIndex(formData, "col_tipo");
  const colValor = colIndex(formData, "col_valor");
  const colCupom = colIndex(formData, "col_cupom");
  const colVencimento = colIndex(formData, "col_vencimento");
  const colContaCode = colIndex(formData, "col_conta_code");

  if (colNome < 0 || colValor < 0) {
    return { erro: "Selecione ao menos as colunas de nome do ativo e valor antes de confirmar." };
  }

  let linhas: string[][];
  try {
    const buffer = await arquivo.arrayBuffer();
    ({ linhas } = await lerArquivoGenerico(arquivo.name, buffer));
  } catch (e) {
    return { erro: e instanceof ParseError ? e.message : "Não consegui reler o arquivo." };
  }

  const { data: contas } = await supabase.from("plano_de_contas").select("code").eq("org_id", currentOrgId);
  const codigosValidos = new Set((contas ?? []).map((c) => c.code as string));

  const avisos: string[] = [];
  const paraCriar: Record<string, unknown>[] = [];

  linhas.forEach((linha, i) => {
    const nome = String(linha[colNome] ?? "").trim();
    const valorRaw = String(linha[colValor] ?? "").trim();
    if (!nome && !valorRaw) return;

    if (!nome) {
      avisos.push(`Linha ${i + 2}: sem nome do ativo — ignorada.`);
      return;
    }
    const valor = parseValorFlexivel(valorRaw);
    if (valor === null) {
      avisos.push(`Linha ${i + 2}: valor "${valorRaw}" inválido — ignorada.`);
      return;
    }

    const custodiante = colCustodiante >= 0 ? String(linha[colCustodiante] ?? "").trim() || null : null;
    const tipo = colTipo >= 0 ? normalizarTipo(String(linha[colTipo] ?? "")) : "renda_fixa";

    let taxa_cupom: number | null = null;
    if (colCupom >= 0) {
      const cupomRaw = String(linha[colCupom] ?? "").trim();
      const cupomValor = cupomRaw ? parseValorFlexivel(cupomRaw) : null;
      taxa_cupom = cupomValor !== null ? cupomValor / 100 : null;
    }

    let data_vencimento: string | null = null;
    if (colVencimento >= 0) {
      const vencRaw = String(linha[colVencimento] ?? "").trim();
      data_vencimento = vencRaw ? parseDataFlexivel(vencRaw) : null;
      if (vencRaw && !data_vencimento) {
        avisos.push(`Linha ${i + 2}: data de vencimento "${vencRaw}" não reconhecida — deixada em branco.`);
      }
    }

    let conta_code: string | null = null;
    if (colContaCode >= 0) {
      const contaRaw = String(linha[colContaCode] ?? "").trim();
      if (contaRaw) {
        const extraido = extrairCodigoDeCelula(contaRaw);
        if (codigosValidos.has(contaRaw)) conta_code = contaRaw;
        else if (codigosValidos.has(extraido)) conta_code = extraido;
        else avisos.push(`Linha ${i + 2}: conta "${contaRaw}" não encontrada no plano de contas — vínculo deixado em branco.`);
      }
    }

    paraCriar.push({
      org_id: currentOrgId,
      nome,
      custodiante,
      tipo,
      valor_atual: Math.abs(valor),
      taxa_cupom,
      data_vencimento,
      conta_code,
    });
  });

  if (paraCriar.length === 0) {
    return { erro: "Nenhuma linha pôde ser importada — confira os avisos.", avisos };
  }

  const { error } = await supabase.from("ativos").insert(paraCriar);
  if (error) return { erro: error.message, avisos };

  revalidatePath("/carteira");
  revalidatePath("/vencimentos");
  revalidatePath("/dashboard");
  return { criadas: paraCriar.length, avisos };
}
