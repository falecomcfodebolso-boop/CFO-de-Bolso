"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  detectarTipoArquivo,
  parseArquivo,
  ParseError,
  type TransacaoExtraida,
  type TipoArquivoImportacao,
} from "@/lib/import/parsers";
import { sugerirClassificacoes } from "@/lib/import/classify";
import { parseHoldingsDePdf, type AtivoProposto } from "@/lib/portfolio/parse-holdings";
import {
  montarPropostasAcruoEMercado,
  type PropostaApuracao,
  type PropostaMarcacao,
} from "@/lib/accounting/montar-propostas-acruo";
import type { EntradaAcruoExtrato } from "@/lib/accounting/parse-extrato-acruo";

export type ActionState = { error?: string } | null;

/**
 * Estado retornado pelo upload unificado. Um PDF de Statement de custódia
 * (Itaú Private Bank ou Bradesco Bank/Pershing) pode trazer, no mesmo
 * arquivo: transações de caixa, posições em carteira, juros acruados e
 * marcação a mercado. Em vez de exigir 3 uploads separados (Importar,
 * Carteira → Importar, Ajustes → Importar), este upload único tenta ler
 * tudo o que existir no arquivo e devolve cada seção pra revisão — nada é
 * gravado (viram lançamento/ativo/apuração de verdade) até o usuário
 * confirmar cada seção individualmente.
 */
export type UploadUnificadoState = {
  error?: string;
  loteId?: string;
  totalTransacoesBanco?: number;
  dataBase?: string;
  formato?: "itau" | "pershing";
  propostasAtivos?: AtivoProposto[];
  propostasAcruo?: PropostaApuracao[];
  naoReconhecidas?: EntradaAcruoExtrato[];
  propostasMercado?: PropostaMarcacao[];
} | null;

export async function uploadImportUnificadoAction(
  _prev: UploadUnificadoState,
  formData: FormData
): Promise<UploadUnificadoState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite importar extratos." };
  }

  const contaBancariaCode = String(formData.get("conta_bancaria_code") || "");
  const file = formData.get("arquivo") as File | null;

  if (!file || file.size === 0) return { error: "Escolha um arquivo para importar." };

  const tipo = detectarTipoArquivo(file.name);
  if (!tipo) {
    return { error: "Formato não reconhecido. Envie um arquivo .ofx, .csv, .xls/.xlsx ou .pdf." };
  }
  if (!contaBancariaCode) {
    return { error: "Escolha a conta bancária deste extrato (usada se o arquivo tiver movimentação de caixa)." };
  }

  const buffer = await file.arrayBuffer();

  // Transações de caixa (extrato bancário "tradicional") — tentamos sempre,
  // independente do formato; se o arquivo não tiver nada nesse formato, o
  // parser simplesmente não encontra nenhuma linha e seguimos adiante.
  let transacoes: TransacaoExtraida[] = [];
  let erroTransacoes: string | null = null;
  try {
    transacoes = await parseArquivo(tipo as TipoArquivoImportacao, buffer);
  } catch (e) {
    erroTransacoes = e instanceof ParseError ? e.message : `Não consegui ler o arquivo: ${(e as Error).message}`;
  }

  // As demais leituras (posições de custódia, acruamento, marcação a
  // mercado) só existem em PDFs de Statement — não fazem sentido pra
  // OFX/CSV/XLS, que são só extrato de conta corrente.
  let propostasAtivos: AtivoProposto[] = [];
  let propostasAcruo: PropostaApuracao[] = [];
  let naoReconhecidas: EntradaAcruoExtrato[] = [];
  let propostasMercado: PropostaMarcacao[] = [];
  let dataBase: string | undefined;
  let formato: "itau" | "pershing" | undefined;

  if (tipo === "pdf") {
    try {
      propostasAtivos = await parseHoldingsDePdf(buffer);
    } catch {
      // Sem seção "Portfolio Holdings" nesse PDF — não é obrigatória aqui.
    }

    const resultadoAcruo = await montarPropostasAcruoEMercado(supabase, currentOrgId, buffer);
    if (!resultadoAcruo.error) {
      propostasAcruo = resultadoAcruo.propostas ?? [];
      naoReconhecidas = resultadoAcruo.naoReconhecidas ?? [];
      propostasMercado = resultadoAcruo.propostasMercado ?? [];
      dataBase = resultadoAcruo.dataBase ?? undefined;
      formato = resultadoAcruo.formato;
    }
    // Erro aqui é silencioso de propósito: pode ser só que esse PDF não é um
    // Statement de acruamento (ex.: é um extrato de conta corrente comum).
  }

  const temOutrasPropostas =
    propostasAtivos.length > 0 || propostasAcruo.length > 0 || propostasMercado.length > 0;

  if (transacoes.length === 0 && !temOutrasPropostas) {
    if (erroTransacoes) return { error: erroTransacoes };
    return { error: "Não encontrei nenhuma transação, posição ou apuração reconhecível nesse arquivo." };
  }

  // Cria o lote de transações bancárias, se o arquivo trouxe alguma.
  let loteId: string | undefined;
  let totalTransacoesBanco: number | undefined;
  if (transacoes.length > 0) {
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

    loteId = lote.id;
    totalTransacoesBanco = transacoes.length;

    // IMPORTANTE: sem .order() aqui de propósito — ver uploadImportAction original.
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
      // silencioso — sugestão de IA é best-effort
    }
  }

  // Caso comum (extrato de conta corrente simples, sem posições/acruamento
  // no mesmo PDF): mantém o fluxo de sempre, direto pra tela de conciliação.
  if (loteId && !temOutrasPropostas) {
    redirect(`/importar/${loteId}`);
  }

  return {
    loteId,
    totalTransacoesBanco,
    dataBase,
    formato,
    propostasAtivos: propostasAtivos.length > 0 ? propostasAtivos : undefined,
    propostasAcruo: propostasAcruo.length > 0 ? propostasAcruo : undefined,
    naoReconhecidas: naoReconhecidas.length > 0 ? naoReconhecidas : undefined,
    propostasMercado: propostasMercado.length > 0 ? propostasMercado : undefined,
  };
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
