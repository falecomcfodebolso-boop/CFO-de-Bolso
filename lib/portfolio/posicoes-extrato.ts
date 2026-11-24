import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairTextoPdf } from "@/lib/import/parsers";
import { parsePosicoesDeTexto } from "@/lib/portfolio/posicoes-texto";
import {
  conciliarPosicoes,
  type AtivoParaConciliar,
  type ResultadoConciliacao,
} from "@/lib/portfolio/conciliar-posicoes-nucleo";

export type { ResultadoConciliacao };

const CAMPOS_ATIVO =
  "id, nome, custodiante, isin, quantidade, categoria_acruo, data_vencimento, data_pagamento_anterior, periodicidade_cupom, valor_mercado, data_posicao";

/**
 * Lê o Statement do custodiante (Itaú Private Bank ou Bradesco/Pershing) e compara cada posição
 * com os Ativos cadastrados. Não grava nada — devolve o que mudaria.
 */
export async function lerEConciliarPosicoes(
  supabase: SupabaseClient,
  orgId: string,
  buffer: ArrayBuffer
): Promise<{ error?: string; resultado?: ResultadoConciliacao }> {
  let texto: string;
  try {
    texto = await extrairTextoPdf(buffer);
  } catch (e) {
    return { error: `Não consegui ler o arquivo: ${(e as Error).message}` };
  }
  const lido = parsePosicoesDeTexto(texto ?? "");
  if (!lido) {
    return {
      error:
        "Não reconheci este PDF como extrato de investimentos. Envie o \"Statement\" do Itaú Private Bank " +
        "ou o extrato de investimentos (Portfolio Holdings) do Bradesco.",
    };
  }
  if (!lido.dataBase) return { error: "Não consegui identificar a data-base do extrato." };
  if (lido.posicoes.length === 0) return { error: "Reconheci o extrato, mas não encontrei nenhuma posição nele." };

  const { data, error } = await supabase.from("ativos").select(CAMPOS_ATIVO).eq("org_id", orgId);
  if (error) return { error: error.message };

  return {
    resultado: conciliarPosicoes(lido.formato, lido.dataBase, lido.posicoes, (data ?? []) as AtivoParaConciliar[]),
  };
}

/**
 * Grava as posições lidas do extrato nos Ativos: quantidade, valor de mercado (limpo), juros
 * acruados informados, preço e a data-base. Nunca sobrescreve uma posição com data-base mais nova.
 * `cuponsAceitos` = ids dos Ativos cuja data do último cupom (recalculada pelo vencimento) deve ser corrigida.
 */
export async function aplicarAtualizacoesPosicao(
  supabase: SupabaseClient,
  orgId: string,
  resultado: ResultadoConciliacao,
  opcoes: { ativoIds?: string[]; cuponsAceitos?: string[]; fonte: string }
): Promise<{ error?: string; atualizadas: number; cuponsCorrigidos: number }> {
  let atualizadas = 0;
  let cuponsCorrigidos = 0;
  const filtro = opcoes.ativoIds ? new Set(opcoes.ativoIds) : null;
  const cupons = new Set(opcoes.cuponsAceitos ?? []);

  for (const u of resultado.atualizacoes) {
    if (filtro && !filtro.has(u.ativoId)) continue;
    if (u.maisAntigoQueCadastro) continue;

    const patch: Record<string, unknown> = {
      valor_mercado: u.valorMercado,
      juros_acruados_extrato: u.jurosAcruados,
      preco_mercado: u.precoMercado,
      data_posicao: resultado.dataBase,
      fonte_posicao: opcoes.fonte.slice(0, 200),
    };
    if (u.quantidade != null) patch.quantidade = u.quantidade;
    if (u.dataPagamentoAnteriorSugerida && cupons.has(u.ativoId)) {
      patch.data_pagamento_anterior = u.dataPagamentoAnteriorSugerida;
      cuponsCorrigidos++;
    }

    const { error } = await supabase.from("ativos").update(patch).eq("id", u.ativoId).eq("org_id", orgId);
    if (error) return { error: error.message, atualizadas, cuponsCorrigidos };
    atualizadas++;
  }
  return { atualizadas, cuponsCorrigidos };
}

/** Avisos do que a atualização automática NÃO resolve sozinha (precisa de decisão/lançamento). */
export function pendenciasDaConciliacao(r: ResultadoConciliacao): string[] {
  const avisos: string[] = [];
  const qtdMudou = r.atualizacoes.filter(
    (u) => u.quantidadeAntes != null && u.quantidade != null && Math.abs(u.quantidadeAntes - u.quantidade) > 0.0001
  );
  if (qtdMudou.length > 0) {
    avisos.push(
      `Quantidade diferente do cadastro em ${qtdMudou.length} papel(éis) (${qtdMudou
        .map((u) => u.nomeAtivo)
        .join(", ")}) — confira se houve compra/venda a contabilizar.`
    );
  }
  const cupons = r.atualizacoes.filter((u) => u.dataPagamentoAnteriorSugerida);
  if (cupons.length > 0) {
    avisos.push(
      `Data do último cupom desatualizada em ${cupons.length} papel(éis) (${cupons
        .map((u) => u.nomeAtivo)
        .join(", ")}) — corrija em Carteira → Atualizar posições pelo extrato.`
    );
  }
  const ausentes = r.ausentes.filter((a) => !a.vencido);
  if (ausentes.length > 0) {
    avisos.push(
      `${ausentes.length} ativo(s) do ${r.custodiante} não aparecem no extrato (${ausentes
        .map((a) => a.nome)
        .join(", ")}) — vendidos/resgatados?`
    );
  }
  if (r.semCadastro.length > 0) {
    avisos.push(
      `${r.semCadastro.length} posição(ões) do extrato sem cadastro na Carteira (${r.semCadastro
        .map((p) => p.nome.slice(0, 40))
        .join("; ")}).`
    );
  }
  return avisos;
}

/**
 * Regra automática (importação e automação diária): ao receber um Statement de investimentos,
 * as posições são atualizadas sozinhas. O que exige decisão (cupom, compra/venda, papel novo ou
 * sumido) volta como aviso.
 */
export async function atualizarPosicoesAutomaticamente(
  supabase: SupabaseClient,
  orgId: string,
  buffer: ArrayBuffer,
  fonte: string
): Promise<{ reconhecido: boolean; atualizadas: number; dataBase?: string; custodiante?: string; avisos: string[] }> {
  const { resultado } = await lerEConciliarPosicoes(supabase, orgId, buffer);
  if (!resultado) return { reconhecido: false, atualizadas: 0, avisos: [] };
  const r = await aplicarAtualizacoesPosicao(supabase, orgId, resultado, { fonte });
  const avisos = pendenciasDaConciliacao(resultado);
  if (r.error) avisos.unshift(`Erro ao atualizar posições: ${r.error}`);
  return {
    reconhecido: true,
    atualizadas: r.atualizadas,
    dataBase: resultado.dataBase,
    custodiante: resultado.custodiante,
    avisos,
  };
}
