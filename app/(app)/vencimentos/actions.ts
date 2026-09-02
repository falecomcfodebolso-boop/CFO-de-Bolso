"use server";

import { requireOrgContext, canManageMembers } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function saveAlertConfigAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canManageMembers(currentMembership.role)) {
    return { error: "Somente owner/admin podem configurar alertas." };
  }

  const dias = String(formData.get("dias") || "5,4,3,2,1")
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  const hora_local = String(formData.get("hora_local") || "10:00");
  const timezone = String(formData.get("timezone") || "America/Sao_Paulo");
  const canal = String(formData.get("canal") || "push");

  const { data: existing } = await supabase
    .from("alert_configs")
    .select("id")
    .eq("org_id", currentOrgId)
    .maybeSingle();

  const payload = { org_id: currentOrgId, dias_antecedencia: dias, hora_local, timezone, canal, ativo: true };

  const { error } = existing
    ? await supabase.from("alert_configs").update(payload).eq("id", existing.id)
    : await supabase.from("alert_configs").insert(payload);

  if (error) return { error: error.message };

  revalidatePath("/vencimentos");
  return null;
}
