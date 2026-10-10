"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionState = { error?: string; duplicata?: { numero: number } } | null;

/**
 * Checa se já existe um lançamento com a MESMA data, mesma conta de
 * contrapartida (a conta bancária do lote) e mesmo valor — sinal forte de
 * que essa transação do extrato já foi lançada antes (ex.: o usuário
 * reimportou o mesmo PDF sem perceber). Nada aqui impede duas transações
 * legítimas e coincidentes de mesma data/valor — por isso quem chama
 * sempre permite "forçar" o lançamento mesmo com duplicata detectada.
 */
async function encontrarLancamentoDuplicado(
  supabase: SupabaseClient,
  orgId: string,
  data: string,
  contaCode: string,
  valor: number
): Promise<{ numero: number } | null> {
  const { data: lancsNaData } = await supabase
    .from("lancamentos")
    .select("id, numero")
    .eq("org_id", orgId)
    .eq("data", data);
  if (!lancsNaData || lancsNaData.length === 0) return null;

  const idsLanc = lancsNaData.map((l) => l.id);
  const { data: linhaIgual } = await supabase
    .from("lancamento_linhas")
    .select("lancamento_id")
    .eq("org_id", orgId)
    .eq("conta_code", contaCode)
    .eq("valor", valor)
    .in("lancamento_id", idsLanc)
    .limit(1)
    .maybeSingle();
  if (!linhaIgual) return null;

  const lanc = lancsNaData.find((l) => l.id === linhaIgual.lancamento_id);
  return lanc ? { numero: lanc.numero } : null;
}

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

  const forcar = String(formData.get("forcar") || "") === "1";
  if (!forcar) {
    const duplicata = await encontrarLancamentoDuplicado(
      supabase,
      currentOrgId,
      transacao.data,
      contaBancaria,
      valorAbs
    );
    if (duplicata) {
      return {
        error: `Já existe o lançamento #${duplicata.numero} com a mesma data, conta e valor — provável duplicata (ex.: reimportação do mesmo extrato). Marque "lançar mesmo assim" se for mesmo uma transação diferente.`,
        duplicata,
      };
    }
  }

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

export type ConfirmarVariasResultado = {
  error?: string;
  confirmadas?: number;
  // Transações puladas por parecerem já lançadas antes (mesma data/conta/
  // valor) — não contam como erro, mas também não foram lançadas; quem
  // chama decide se oferece "lançar mesmo assim" (ver `forcar` em `itens`).
  duplicatas?: { transacaoId: string; numero: number }[];
};

/**
 * Confirma (lança de verdade no Diário) várias transações pendentes de uma
 * vez, cada uma com sua própria conta de contrapartida — usado pelo botão
 * "Lançar selecionadas" na tela de revisão, pra não precisar clicar
 * "Lançar" transação por transação.
 */
export async function confirmarVariasAction(
  loteId: string,
  itens: { transacaoId: string; contaCode: string; forcar?: boolean }[]
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
  const duplicatas: { transacaoId: string; numero: number }[] = [];

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

    if (!item.forcar) {
      const duplicata = await encontrarLancamentoDuplicado(
        supabase,
        currentOrgId,
        transacao.data,
        lote.conta_bancaria_code,
        valorAbs
      );
      if (duplicata) {
        duplicatas.push({ transacaoId: item.transacaoId, numero: duplicata.numero });
        continue;
      }
    }

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

  if (duplicatas.length > 0) {
    const resumoDuplicatas = `${duplicatas.length} parece(m) já lançada(s) antes (mesma data/conta/valor — ver lançamento(s) #${duplicatas
      .map((d) => d.numero)
      .slice(0, 5)
      .join(", #")}${duplicatas.length > 5 ? "..." : ""}); marque "lançar mesmo assim" se forem mesmo diferentes.`;
    return {
      confirmadas,
      duplicatas,
      error: erros.length > 0 ? `${resumoDuplicatas} Falhas: ${erros.slice(0, 3).join("; ")}` : resumoDuplicatas,
    };
  }

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
