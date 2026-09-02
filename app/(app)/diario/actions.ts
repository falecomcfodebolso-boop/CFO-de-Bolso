"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function createLancamentoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite lançar no diário." };
  }

  const data = String(formData.get("data") || "");
  const historico = String(formData.get("historico") || "").trim();
  const contas = formData.getAll("linha_conta").map(String);
  const tipos = formData.getAll("linha_tipo").map(String);
  const valores = formData.getAll("linha_valor").map(String);

  if (!data || !historico) return { error: "Preencha data e histórico do lançamento." };

  const linhas = contas
    .map((conta_code, i) => ({
      conta_code,
      tipo: tipos[i],
      valor: parseFloat((valores[i] || "0").replace(",", ".")),
    }))
    .filter((l) => l.conta_code && l.valor > 0);

  if (linhas.length < 2) {
    return { error: "Um lançamento precisa de pelo menos 2 linhas (um débito e um crédito)." };
  }

  const totalD = linhas.filter((l) => l.tipo === "D").reduce((a, l) => a + l.valor, 0);
  const totalC = linhas.filter((l) => l.tipo === "C").reduce((a, l) => a + l.valor, 0);
  if (Math.abs(totalD - totalC) > 0.005) {
    return {
      error: `Lançamento não está balanceado: débitos = ${totalD.toFixed(2)}, créditos = ${totalC.toFixed(2)}.`,
    };
  }

  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", currentOrgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const proximoNumero = (maxNumero?.numero ?? 0) + 1;

  const { error } = await supabase.rpc("create_lancamento", {
    p_org_id: currentOrgId,
    p_numero: proximoNumero,
    p_data: data,
    p_historico: historico,
    p_linhas: linhas,
  });

  if (error) return { error: error.message };

  revalidatePath("/diario");
  revalidatePath("/balancete");
  revalidatePath("/razoes");
  return null;
}
