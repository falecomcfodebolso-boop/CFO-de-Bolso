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

export type ConfirmarVariasResultado = { error?: string; confirmadas?: number };

/**
 * Confirma (lança de verdade no Diário) várias transações pendentes de uma
 * vez, cada uma com sua própria conta de contrapartida — usado pelo botão
 * "Lançar selecionadas" na tela de revisão, pra não precisar clicar
 * "Lançar" transação por transação.
 */
export async function confirmarVariasAction(
  loteId: string,
  itens: { transacaoId: string; contaCode: string }[]
): Promise<ConfirmarVariasResultado> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite confirmar lançamentos." };
  }
  if (itens.length === 0) return { error: "Selecione ao menos uma transação." };

  const { data: lote, error: loteError } = await supabase
    .from("import_lotes")
    .select("conta_bancaria_code")
    .eq("id", loteId)
    .eq("org_id", currentOrgId)
    .maybeSingle();
  if (loteError) return { error: loteError.message };
  if (!lote) return { error: "Importação não encontrada." };

  const ids = itens.map((i) => i.transacaoId);
  const { data: transacoesData, error: transacoesError } = await supabase
    .from("import_transacoes")
    .select("id, data, descricao, valor, status")
    .in("id", ids)
    .eq("org_id", currentOrgId)
    .eq("lote_id", loteId);
  if (transacoesError) return { error: transacoesError.message };

  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", currentOrgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  let proximoNumero = (maxNumero?.numero ?? 0) + 1;

  let confirmadas = 0;
  const erros: string[] = [];

  // Sequencial de propósito (não Promise.all): cada lançamento precisa de um
  // número sequencial exclusivo, e fazer isso em paralelo arriscaria duas
  // transações pegarem o mesmo número.
  for (const item of itens) {
    const transacao = (transacoesData ?? []).find((t) => t.id === item.transacaoId);
    if (!transacao) {
      erros.push("Uma transação selecionada não foi encontrada.");
      continue;
    }
    if (transacao.status !== "pendente") continue; // já foi tratada (ex: em outra aba) — pula silenciosamente

    const valorAbs = Math.abs(Number(transacao.valor));
    const entrada = Number(transacao.valor) > 0;
    const linhas = [
      { conta_code: lote.conta_bancaria_code, tipo: entrada ? "D" : "C", valor: valorAbs },
      { conta_code: item.contaCode, tipo: entrada ? "C" : "D", valor: valorAbs },
    ];

    const { data: lancamentoId, error: rpcError } = await supabase.rpc("create_lancamento", {
      p_org_id: currentOrgId,
      p_numero: proximoNumero,
      p_data: transacao.data,
      p_historico: transacao.descricao,
      p_linhas: linhas,
    });
    if (rpcError) {
      erros.push(`"${transacao.descricao.slice(0, 40)}": ${rpcError.message}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("import_transacoes")
      .update({ status: "conciliado", conta_confirmada: item.contaCode, lancamento_id: lancamentoId })
      .eq("id", item.transacaoId)
      .eq("org_id", currentOrgId);
    if (updateError) {
      erros.push(`"${transacao.descricao.slice(0, 40)}": ${updateError.message}`);
      continue;
    }

    proximoNumero++;
    confirmadas++;
  }

  revalidatePath(`/importar/${loteId}`);
  revalidatePath("/diario");
  revalidatePath("/balancete");
  revalidatePath("/razoes");

  if (erros.length > 0) {
    return {
      confirmadas,
      error: `Lancei ${confirmadas} de ${itens.length}. Falhas: ${erros.slice(0, 3).join("; ")}${
        erros.length > 3 ? " (e outras...)" : ""
      }`,
    };
  }
  return { confirmadas };
}
