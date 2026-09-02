"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { classificarConta, type Natureza } from "@/lib/accounting/classificacao";

export type ActionState = { error?: string } | null;

export async function createContaAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite criar contas." };
  }

  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const natureza = String(formData.get("natureza") || "");
  const parentCode = String(formData.get("parent_code") || "").trim() || null;

  if (!code || !name || !natureza) {
    return { error: "Preencha código, nome e natureza da conta." };
  }

  const classificacao = classificarConta(natureza as Natureza, name);

  const { error } = await supabase.from("plano_de_contas").insert({
    org_id: currentOrgId,
    code,
    name,
    natureza,
    parent_code: parentCode,
    ...classificacao,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `Já existe uma conta com o código ${code}.` };
    }
    return { error: error.message };
  }

  revalidatePath("/plano-de-contas");
  return null;
}
