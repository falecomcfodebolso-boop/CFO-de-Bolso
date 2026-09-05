"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import {
  montarPropostasAcruoEMercado,
  type PropostaApuracao,
  type PropostaMarcacao,
} from "@/lib/accounting/montar-propostas-acruo";
import type { EntradaAcruoExtrato } from "@/lib/accounting/parse-extrato-acruo";

export type { PropostaApuracao, PropostaMarcacao };

export type ParseAcruoState = {
  error?: string;
  dataBase?: string;
  formato?: "itau" | "pershing";
  propostas?: PropostaApuracao[];
  naoReconhecidas?: EntradaAcruoExtrato[];
  propostasMercado?: PropostaMarcacao[];
} | null;

export async function parseExtratoAcruoPdfAction(
  _prev: ParseAcruoState,
  formData: FormData
): Promise<ParseAcruoState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite importar apurações." };
  }

  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) return { error: "Escolha um arquivo PDF para importar." };
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Por enquanto só é possível importar a partir de um arquivo PDF." };
  }

  const buffer = await file.arrayBuffer();
  const resultado = await montarPropostasAcruoEMercado(supabase, currentOrgId, buffer);
  if (resultado.error) return { error: resultado.error };

  return {
    dataBase: resultado.dataBase ?? undefined,
    formato: resultado.formato,
    propostas: resultado.propostas,
    naoReconhecidas: resultado.naoReconhecidas,
    propostasMercado: resultado.propostasMercado,
  };
}

export async function confirmarApuracoesAction(
  propostas: PropostaApuracao[],
  fonte: string
): Promise<{ error?: string; registradas?: number }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar apurações." };
  }
  if (propostas.length === 0) return { error: "Selecione ao menos um grupo para registrar." };

  const { error, count } = await supabase.from("ajustes_acruo").insert(
    propostas.map((p) => ({
      org_id: currentOrgId,
      ativo_id: null,
      conta_acruo_code: p.contaAcruoCode,
      conta_receita_code: p.contaReceitaCode,
      nome_grupo: p.nomeGrupo,
      data_base: p.dataBase,
      data_base_anterior: null,
      valor_reportado_banco: p.valorReportadoBanco,
      saldo_contabil_antes: p.saldoContabilAntes,
      acruo_calculado_interno: p.acruoCalculadoInterno,
      diferenca: p.diferenca,
      fonte,
      observacoes: "Sugerido automaticamente a partir da importação de PDF — revisar e lançar.",
      lancamento_id: null,
    })),
    { count: "exact" }
  );
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { registradas: count ?? propostas.length };
}

export async function confirmarMarcacoesAction(
  propostas: PropostaMarcacao[],
  fonte: string
): Promise<{ error?: string; registradas?: number }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar apurações." };
  }
  if (propostas.length === 0) return { error: "Selecione ao menos um fundo para registrar." };

  const { error, count } = await supabase.from("ajustes_marcacao_mercado").insert(
    propostas.map((p) => ({
      org_id: currentOrgId,
      ativo_id: p.ativoId,
      conta_ativo_code: p.contaAtivoCode,
      conta_ganho_perda_code: p.contaGanhoPerdaCode,
      nome_ativo: p.nomeAtivo,
      data_base: p.dataBase,
      valor_reportado_mercado: p.valorReportadoMercado,
      saldo_contabil_antes: p.saldoContabilAntes,
      diferenca: p.diferenca,
      fonte,
      observacoes: "Sugerido automaticamente a partir da importação de PDF — revisar e lançar.",
      lancamento_id: null,
    })),
    { count: "exact" }
  );
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { registradas: count ?? propostas.length };
}
