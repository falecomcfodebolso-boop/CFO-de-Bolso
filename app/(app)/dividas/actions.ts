"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function createDividaAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite cadastrar dívidas." };
  }

  const nome = String(formData.get("nome") || "").trim();
  const credor = String(formData.get("credor") || "").trim() || null;
  const tipo = String(formData.get("tipo") || "emprestimo");
  const indexador = String(formData.get("indexador") || "PREFIXADO");
  const valor_atual = parseFloat(String(formData.get("valor_atual") || "0").replace(",", "."));
  const valorOriginalRaw = String(formData.get("valor_original") || "").trim();
  const valor_original = valorOriginalRaw ? parseFloat(valorOriginalRaw.replace(",", ".")) : null;
  const taxaRaw = String(formData.get("taxa_juros") || "").trim();
  const taxa_juros = taxaRaw ? parseFloat(taxaRaw.replace(",", ".")) / 100 : null;
  const data_contratacao = String(formData.get("data_contratacao") || "").trim() || null;
  const data_vencimento = String(formData.get("data_vencimento") || "").trim() || null;
  const conta_code = String(formData.get("conta_code") || "").trim() || null;
  const garantia = String(formData.get("garantia") || "").trim() || null;

  if (!nome || !valor_atual) return { error: "Informe ao menos o nome e o saldo devedor da dívida." };

  const { error } = await supabase.from("dividas").insert({
    org_id: currentOrgId,
    nome,
    credor,
    tipo,
    indexador,
    valor_atual,
    valor_original,
    taxa_juros,
    data_contratacao,
    data_vencimento,
    conta_code,
    garantia,
  });

  if (error) return { error: error.message };

  revalidatePath("/dividas");
  revalidatePath("/vencimentos");
  revalidatePath("/dashboard");
  return null;
}

export async function deleteDividaAction(formData: FormData) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return;

  const id = String(formData.get("id") || "");
  await supabase.from("dividas").delete().eq("org_id", currentOrgId).eq("id", id);

  revalidatePath("/dividas");
  revalidatePath("/vencimentos");
}
