"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function createAtivoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite cadastrar ativos." };
  }

  const nome = String(formData.get("nome") || "").trim();
  const custodiante = String(formData.get("custodiante") || "").trim() || null;
  const tipo = String(formData.get("tipo") || "renda_fixa");
  const valor_atual = parseFloat(String(formData.get("valor_atual") || "0").replace(",", "."));
  const taxaRaw = String(formData.get("taxa_cupom") || "").trim();
  const taxa_cupom = taxaRaw ? parseFloat(taxaRaw.replace(",", ".")) / 100 : null;
  const data_vencimento = String(formData.get("data_vencimento") || "").trim() || null;
  const conta_code = String(formData.get("conta_code") || "").trim() || null;
  const quantidadeRaw = String(formData.get("quantidade") || "").trim();
  const quantidade = quantidadeRaw ? parseFloat(quantidadeRaw.replace(",", ".")) : null;
  const valorFaceRaw = String(formData.get("valor_face") || "").trim();
  const valor_face = valorFaceRaw ? parseFloat(valorFaceRaw.replace(",", ".")) : null;

  if (!nome || !valor_atual) return { error: "Informe ao menos o nome e o valor do ativo." };

  const { error } = await supabase.from("ativos").insert({
    org_id: currentOrgId,
    nome,
    custodiante,
    tipo,
    valor_atual,
    taxa_cupom,
    data_vencimento,
    conta_code,
    quantidade,
    valor_face,
  });

  if (error) return { error: error.message };

  revalidatePath("/carteira");
  revalidatePath("/vencimentos");
  revalidatePath("/dashboard");
  return null;
}

export async function deleteAtivoAction(formData: FormData) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return;

  const id = String(formData.get("id") || "");
  await supabase.from("ativos").delete().eq("org_id", currentOrgId).eq("id", id);

  revalidatePath("/carteira");
  revalidatePath("/vencimentos");
}

/**
 * Atualiza a quantidade de papéis e/ou o valor de face unitário de um
 * ativo já cadastrado — usado na edição inline da tabela "Todos os
 * ativos", pra permitir preencher esses dois campos nos papéis já
 * importados (que hoje não têm esses valores) sem precisar recadastrar
 * o ativo do zero. Cada campo é salvo por um mini-formulário próprio na
 * tabela, então só atualiza o(s) campo(s) que realmente vieram no
 * formulário — não zera o outro campo quando só um deles é editado.
 */
export async function updateAtivoDetalhesAction(formData: FormData) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return;

  const id = String(formData.get("id") || "");
  if (!id) return;

  const updates: { quantidade?: number | null; valor_face?: number | null } = {};

  if (formData.has("quantidade")) {
    const quantidadeRaw = String(formData.get("quantidade") || "").trim();
    updates.quantidade = quantidadeRaw ? parseFloat(quantidadeRaw.replace(",", ".")) : null;
  }
  if (formData.has("valor_face")) {
    const valorFaceRaw = String(formData.get("valor_face") || "").trim();
    updates.valor_face = valorFaceRaw ? parseFloat(valorFaceRaw.replace(",", ".")) : null;
  }
  if (Object.keys(updates).length === 0) return;

  await supabase.from("ativos").update(updates).eq("org_id", currentOrgId).eq("id", id);

  revalidatePath("/carteira");
}
