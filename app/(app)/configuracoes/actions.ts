"use server";

import { requireOrgContext, canManageMembers } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function atualizarRegimeTributarioAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canManageMembers(currentMembership.role)) {
    return { error: "Só o dono ou administrador da organização pode alterar o regime tributário." };
  }

  const regime = String(formData.get("regime_tributario") || "").trim() || null;
  const atividade = String(formData.get("atividade_tributaria") || "").trim() || null;
  const aliquotaIssPct = String(formData.get("aliquota_iss_pct") || "").trim();
  const aliquotaIss = aliquotaIssPct ? parseFloat(aliquotaIssPct.replace(",", ".")) / 100 : null;
  const dataAbertura = String(formData.get("data_abertura_atividade") || "").trim() || null;
  const anexoSimples = String(formData.get("anexo_simples") || "").trim() || null;

  const { error } = await supabase.rpc("update_regime_tributario", {
    p_org_id: currentOrgId,
    p_regime_tributario: regime,
    p_atividade_tributaria: atividade,
    p_aliquota_iss: aliquotaIss,
    p_data_abertura_atividade: dataAbertura,
    p_anexo_simples: anexoSimples,
  });

  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  revalidatePath("/obrigacoes-fiscais");
  return null;
}
