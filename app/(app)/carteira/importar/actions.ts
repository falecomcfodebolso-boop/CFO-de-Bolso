"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { parseHoldingsDePdf, ParseHoldingsError, type AtivoProposto } from "@/lib/portfolio/parse-holdings";

export type ParsePortfolioState = { error?: string; propostas?: AtivoProposto[] } | null;

export async function parsePortfolioPdfAction(
  _prev: ParsePortfolioState,
  formData: FormData
): Promise<ParsePortfolioState> {
  const { currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite importar posições." };
  }

  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) return { error: "Escolha um arquivo PDF para importar." };
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Por enquanto só é possível importar posições a partir de um arquivo PDF." };
  }

  try {
    const buffer = await file.arrayBuffer();
    const propostas = await parseHoldingsDePdf(buffer);
    return { propostas };
  } catch (e) {
    if (e instanceof ParseHoldingsError) return { error: e.message };
    return { error: `Não consegui ler o arquivo: ${(e as Error).message}` };
  }
}

export async function criarAtivosEmLoteAction(
  propostas: AtivoProposto[]
): Promise<{ error?: string; criados?: number }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite cadastrar ativos." };
  }
  if (propostas.length === 0) return { error: "Selecione ao menos um título para criar." };

  const { error, count } = await supabase
    .from("ativos")
    .insert(
      propostas.map((p) => ({
        org_id: currentOrgId,
        nome: p.nome,
        custodiante: "Custódia — importado de PDF",
        tipo: "renda_fixa",
        valor_atual: p.valorMercado,
        taxa_cupom: p.taxaCupom,
        data_vencimento: p.dataVencimento,
      })),
      { count: "exact" }
    );

  if (error) return { error: error.message };

  revalidatePath("/carteira");
  revalidatePath("/vencimentos");
  revalidatePath("/dashboard");
  return { criados: count ?? propostas.length };
}
