"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  detectarTipoArquivo,
  parseArquivo,
  ParseError,
} from "@/lib/import/parsers";
import { sugerirClassificacoes } from "@/lib/import/classify";

export type ActionState = { error?: string } | null;

export async function uploadImportAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite importar extratos." };
  }

  const contaBancariaCode = String(formData.get("conta_bancaria_code") || "");
  const file = formData.get("arquivo") as File | null;

  if (!contaBancariaCode) return { error: "Escolha a conta bancária deste extrato." };
  if (!file || file.size === 0) return { error: "Escolha um arquivo para importar." };

  const tipo = detectarTipoArquivo(file.name);
  if (!tipo) {
    return { error: "Formato não reconhecido. Envie um arquivo .ofx, .csv, .xls/.xlsx ou .pdf." };
  }

  let transacoes;
  try {
    const buffer = await file.arrayBuffer();
    transacoes = await parseArquivo(tipo, buffer);
  } catch (e) {
    if (e instanceof ParseError) return { error: e.message };
    return { error: `Não consegui ler o arquivo: ${(e as Error).message}` };
  }

  const { data: contas, error: contasError } = await supabase
    .from("plano_de_contas")
    .select("code, name, natureza")
    .eq("org_id", currentOrgId)
    .neq("code", contaBancariaCode);

  if (contasError) return { error: contasError.message };

  const { data: lote, error: loteError } = await supabase
    .from("import_lotes")
    .insert({
      org_id: currentOrgId,
      conta_bancaria_code: contaBancariaCode,
      nome_arquivo: file.name,
      tipo_arquivo: tipo,
      total_transacoes: transacoes.length,
    })
    .select("id")
    .single();

  if (loteError) return { error: loteError.message };

  // IMPORTANTE: sem .order() aqui de propósito — o Postgres preserva a
  // ordem das linhas do INSERT no RETURNING, e isso é usado logo abaixo
  // para casar cada linha inserida com sua sugestão de IA pelo índice.
  const { data: inseridas, error: insertError } = await supabase
    .from("import_transacoes")
    .insert(
      transacoes.map((t) => ({
        org_id: currentOrgId,
        lote_id: lote.id,
        data: t.data,
        descricao: t.descricao,
        valor: t.valor,
      }))
    )
    .select("id");

  if (insertError) return { error: insertError.message };

  // Sugestão de classificação via IA é "best effort": se falhar, a
  // importação já feita acima não é desfeita — o usuário classifica
  // manualmente na tela de conciliação.
  try {
    const sugestoes = await sugerirClassificacoes(transacoes, contas ?? []);
    const atualizacoes = inseridas
      .map((row, i) => ({ id: row.id, sugestao: sugestoes[i] }))
      .filter((u) => u.sugestao?.conta_code);

    await Promise.all(
      atualizacoes.map((u) =>
        supabase
          .from("import_transacoes")
          .update({
            conta_sugerida: u.sugestao!.conta_code,
            confianca_sugestao: u.sugestao!.confianca,
          })
          .eq("id", u.id)
      )
    );
  } catch {
    // silencioso — ver comentário acima
  }

  redirect(`/importar/${lote.id}`);
}

/**
 * Exclui uma importação (lote) inteira — usado quando o usuário subiu o
 * arquivo errado, subiu duplicado, ou desistiu antes de revisar/confirmar
 * as transações. Por segurança, só permite excluir se NENHUMA transação do
 * lote já foi confirmada (virou lançamento de verdade no Diário) — nesse
 * caso o usuário precisa desfazer o(s) lançamento(s) primeiro.
 */
export async function excluirLoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { error: "Seu papel (viewer) não permite excluir importações." };

  const loteId = String(formData.get("lote_id") || "");
  if (!loteId) return { error: "Importação não encontrada." };

  const { count, error: countError } = await supabase
    .from("import_transacoes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", currentOrgId)
    .eq("lote_id", loteId)
    .eq("status", "conciliado");

  if (countError) return { error: countError.message };
  if (count && count > 0) {
    return {
      error:
        "Essa importação já tem transações confirmadas (viraram lançamentos no Diário) — não é possível excluí-la. Ignore as transações pendentes manualmente, se quiser.",
    };
  }

  const { error } = await supabase.from("import_lotes").delete().eq("org_id", currentOrgId).eq("id", loteId);
  if (error) return { error: error.message };

  revalidatePath("/importar");
  return null;
}
