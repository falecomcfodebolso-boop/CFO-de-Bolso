"use server";

import { requireOrgContext, canManageMembers } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function criarParticipacaoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, currentOrgId, currentMembership, memberships } = await requireOrgContext();
  if (!canManageMembers(currentMembership.role)) {
    return { error: "Só o dono ou administrador da organização pode registrar uma participação societária." };
  }

  const investidaOrgId = String(formData.get("investida_org_id") || "").trim();
  const percentualPct = String(formData.get("percentual_pct") || "").trim();
  const dataReferencia = String(formData.get("data_referencia") || "").trim();

  if (!investidaOrgId) return { error: "Escolha a empresa investida." };
  if (investidaOrgId === currentOrgId) return { error: "A investida não pode ser a própria empresa atual." };
  if (!memberships.some((m) => m.org_id === investidaOrgId)) {
    return { error: "Você só pode registrar participação em empresas às quais também tem acesso." };
  }

  const percentual = parseFloat(percentualPct.replace(",", ".")) / 100;
  if (!percentual || percentual <= 0 || percentual > 1) {
    return { error: "Informe um percentual de participação entre 0,01% e 100%." };
  }

  const { error } = await supabase.from("participacoes_societarias").insert({
    investidora_org_id: currentOrgId,
    investida_org_id: investidaOrgId,
    percentual,
    data_referencia: dataReferencia || new Date().toISOString().slice(0, 10),
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/participacoes");
  revalidatePath("/consolidado");
  return null;
}

export async function excluirParticipacaoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canManageMembers(currentMembership.role)) {
    return { error: "Só o dono ou administrador da organização pode remover uma participação societária." };
  }

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Participação não encontrada." };

  const { error } = await supabase
    .from("participacoes_societarias")
    .delete()
    .eq("id", id)
    .eq("investidora_org_id", currentOrgId);

  if (error) return { error: error.message };

  revalidatePath("/participacoes");
  revalidatePath("/consolidado");
  return null;
}
