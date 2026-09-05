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
import { sugerirClassificacaoCupomAcruo } from "@/lib/accounting/detectar-cupom-acruo";
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
  ativosJaCadastrados?: string[];
  propostasAcruo?: PropostaApuracao[];
  naoReconhecidas?: EntradaAcruoExtrato[];
  propostasMercado?: PropostaMarcacao[];
} | null;

/**
 * Remove nomes de acentuação e pontuação e normaliza espaços — usado pra
 * comparar o nome de um título lido do PDF com o nome (curto, apelidado)
 * do Ativo já cadastrado (ex.: "Bank Amer (XP/Bradesco)" vs "BANK OF
 * AMERICA CORP 4.4% ...").
 */
function normalizarNomeTitulo(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9& ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALAVRAS_GENERICAS_DEMAIS = new Set(["CORP", "BANK", "CO", "INC", "SA", "THE", "AND"]);

/**
 * Compara o nome de um Ativo já cadastrado (geralmente um apelido curto,
 * às vezes com sufixo "(Grupo)") com o nome completo de um título lido do
 * PDF de custódia — best-effort: se algum "token" característico do nome
 * do Ativo (emissor, ex: "AMER", "GOLDMAN", "ITAU") aparece dentro do nome
 * do título do PDF (ou vice-versa), considera que é o mesmo papel.
 */
function nomesProvavelmenteMesmoTitulo(nomeAtivo: string, nomeProposta: string): boolean {
  const base = normalizarNomeTitulo(nomeAtivo.replace(/\([^)]*\)\s*$/, ""));
  const alvo = normalizarNomeTitulo(nomeProposta);
  if (!base || !alvo) return false;
  const tokens = base.split(" ").filter((t) => t.length >= 4 && !PALAVRAS_GENERICAS_DEMAIS.has(t));
  if (tokens.length === 0) return false;
  return tokens.some((t) => alvo.includes(t) || t.includes(alvo));
}

/**
 * Filtra da lista de propostas de novos ativos (lidas da seção "Portfolio
 * Holdings" do PDF) qualquer título que já bate com um Ativo existente na
 * organização — por ISIN/CUSIP (quando cadastrado) ou, na falta dele
 * (como é o caso do grupo "XP/Bradesco" hoje), por nome. Sem esse filtro,
 * um PDF de custódia cujos títulos já foram cadastrados manualmente (ou
 * por uma importação anterior) apareceria de novo inteiro em "Novas
 * posições para a Carteira", arriscando criar Ativos duplicados.
 */
function filtrarPropostasJaCadastradas(
  propostas: AtivoProposto[],
  ativosExistentes: { nome: string; isin: string | null }[]
): { novas: AtivoProposto[]; jaCadastrados: string[] } {
  const novas: AtivoProposto[] = [];
  const jaCadastrados: string[] = [];
  for (const p of propostas) {
    const bate = ativosExistentes.some((a) => {
      const isins = (a.isin ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (isins.includes(p.identificador)) return true;
      return nomesProvavelmenteMesmoTitulo(a.nome, p.nome);
    });
    if (bate) {
      jaCadastrados.push(p.nome);
    } else {
      novas.push(p);
    }
  }
  return { novas, jaCadastrados };
}

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

  let ativosJaCadastrados: string[] = [];
  if (tipo === "pdf") {
    try {
      const propostasLidas = await parseHoldingsDePdf(buffer);
      const { data: ativosExistentes } = await supabase
        .from("ativos")
        .select("nome, isin")
        .eq("org_id", currentOrgId);
      const filtradas = filtrarPropostasJaCadastradas(propostasLidas, ativosExistentes ?? []);
      propostasAtivos = filtradas.novas;
      ativosJaCadastrados = filtradas.jaCadastrados;
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
    propostasAtivos.length > 0 ||
    ativosJaCadastrados.length > 0 ||
    propostasAcruo.length > 0 ||
    propostasMercado.length > 0;

  if (transacoes.length === 0 && !temOutrasPropostas) {
    if (erroTransacoes) return { error: erroTransacoes };
    return { error: "Não encontrei nenhuma transação, posição ou apuração reconhecível nesse arquivo." };
  }

  // Cria o lote de transações bancárias, se o arquivo trouxe alguma. Só aqui a
  // conta bancária é obrigatória — ela não se aplica a Statements de custódia
  // (juros, posições) que não têm seção de caixa nenhuma.
  let loteId: string | undefined;
  let totalTransacoesBanco: number | undefined;
  if (transacoes.length > 0) {
    if (!contaBancariaCode) {
      return {
        error:
          "Esse arquivo tem movimentação de caixa — escolha a conta bancária deste extrato antes de importar.",
      };
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
      // Regra determinística primeiro (recebimento de cupom de um Ativo com
      // acruamento reconhecido por ISIN/CUSIP na descrição) — evita que a IA
      // sugira por engano a conta do próprio ativo em vez da conta de juros
      // acruados a receber (ver lib/accounting/detectar-cupom-acruo.ts).
      // Só cai na IA pro que essa regra não reconhecer.
      const sugestoesCupom = await sugerirClassificacaoCupomAcruo(transacoes, supabase, currentOrgId);
      const sugestoesIA = await sugerirClassificacoes(transacoes, contas ?? []);
      const sugestoes = transacoes.map((_, i) => sugestoesCupom.get(i) ?? sugestoesIA[i]);
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
  const temPropostasAcionaveis = propostasAtivos.length > 0 || propostasAcruo.length > 0 || propostasMercado.length > 0;
  if (loteId && !temPropostasAcionaveis && ativosJaCadastrados.length === 0) {
    redirect(`/importar/${loteId}`);
  }

  return {
    loteId,
    totalTransacoesBanco,
    dataBase,
    formato,
    propostasAtivos: propostasAtivos.length > 0 ? propostasAtivos : undefined,
    ativosJaCadastrados: ativosJaCadastrados.length > 0 ? ativosJaCadastrados : undefined,
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
