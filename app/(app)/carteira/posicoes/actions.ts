"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, canWrite } from "@/lib/org";
import {
  lerEConciliarPosicoes,
  aplicarAtualizacoesPosicao,
  type ResultadoConciliacao,
} from "@/lib/portfolio/posicoes-extrato";

export type LerPosicoesState = { error?: string; resultado?: ResultadoConciliacao; arquivo?: string } | null;

export async function lerPosicoesAction(_prev: LerPosicoesState, formData: FormData): Promise<LerPosicoesState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { error: "Seu papel (viewer) não permite atualizar posições." };

  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) return { error: "Escolha o PDF do extrato de investimentos." };
  if (!file.name.toLowerCase().endsWith(".pdf")) return { error: "Envie o extrato em PDF." };

  const { error, resultado } = await lerEConciliarPosicoes(supabase, currentOrgId, await file.arrayBuffer());
  if (error) return { error };
  return { resultado, arquivo: file.name };
}

export async function aplicarPosicoesAction(
  resultado: ResultadoConciliacao,
  ativoIds: string[],
  cuponsAceitos: string[],
  arquivo: string
): Promise<{ error?: string; atualizadas?: number; cuponsCorrigidos?: number }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { error: "Seu papel (viewer) não permite atualizar posições." };
  if (ativoIds.length === 0) return { error: "Selecione ao menos uma posição." };

  const r = await aplicarAtualizacoesPosicao(supabase, currentOrgId, resultado, {
    ativoIds,
    cuponsAceitos,
    fonte: `Extrato ${resultado.custodiante} ${resultado.dataBase} (${arquivo})`,
  });
  if (r.error) return { error: r.error };

  revalidatePath("/carteira");
  revalidatePath("/vencimentos");
  return { atualizadas: r.atualizadas, cuponsCorrigidos: r.cuponsCorrigidos };
}
