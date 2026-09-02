"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string } | null;

export async function confirmarTransacaoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite confirmar lançamentos." };
  }

  const transacaoId = String(formData.get("transacao_id") || "");
  const loteId = String(formData.get("lote_id") || "");
  const contaCode = String(formData.get("conta_code") || "");

  if (!transacaoId || !contaCode) return { error: "Escolha a conta de contrapartida." };

  const { data: transacao, error: transacaoError } = await supabase
    .from("import_transacoes")
    .select("id, data, descricao, valor, status, lote_id, import_lotes(conta_bancaria_code)")
    .eq("id", transacaoId)
    .eq("org_id", currentOrgId)
    .single();

  if (transacaoError || !transacao) return { error: "Transação não encontrada." };
  if (transacao.status !== "pendente") return { error: "Essa transação já foi conciliada ou ignorada." };

  const contaBancaria = (transacao.import_lotes as unknown as { conta_bancaria_code: string } | null)
    ?.conta_bancaria_code;
  if (!contaBancaria) return { error: "Não encontrei a conta bancária deste lote." };

  const valorAbs = Math.abs(Number(transacao.valor));
  const entrada = Number(transacao.valor) > 0;

  const linhas = [
    { conta_code: contaBancaria, tipo: entrada ? "D" : "C", valor: valorAbs },
    { conta_code: contaCode, tipo: entrada ? "C" : "D", valor: valorAbs },
  ];

  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", currentOrgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const proximoNumero = (maxNumero?.numero ?? 0) + 1;

  const { data: lancamentoId, error: rpcError } = await supabase.rpc("create_lancamento", {
    p_org_id: currentOrgId,
    p_numero: proximoNumero,
    p_data: transacao.data,
    p_historico: transacao.descricao,
    p_linhas: linhas,
  });

  if (rpcError) return { error: rpcError.message };

  const { error: updateError } = await supabase
    .from("import_transacoes")
    .update({ status: "conciliado", conta_confirmada: contaCode, lancamento_id: lancamentoId })
    .eq("id", transacaoId)
    .eq("org_id", currentOrgId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/importar/${loteId}`);
  revalidatePath("/diario");
  revalidatePath("/balancete");
  revalidatePath("/razoes");
  return null;
}

export async function ignorarTransacaoAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite ignorar transações." };
  }

  const transacaoId = String(formData.get("transacao_id") || "");
  const loteId = String(formData.get("lote_id") || "");

  const { error } = await supabase
    .from("import_transacoes")
    .update({ status: "ignorado" })
    .eq("id", transacaoId)
    .eq("org_id", currentOrgId)
    .eq("status", "pendente");

  if (error) return { error: error.message };

  revalidatePath(`/importar/${loteId}`);
  return null;
}
