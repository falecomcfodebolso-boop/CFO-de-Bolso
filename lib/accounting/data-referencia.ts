import type { SupabaseClient } from "@supabase/supabase-js";

export type IntervaloLancamentos = { primeira: string | null; ultima: string | null };

/**
 * Menor e maior data entre os lançamentos da organização — o intervalo em que
 * existem dados contábeis reais. Fora dele (antes do primeiro lançamento ou
 * depois do último) não há nada nas telas que dependem de saldo contábil.
 */
export async function getIntervaloDeLancamentos(
  supabase: SupabaseClient,
  orgId: string
): Promise<IntervaloLancamentos> {
  const [{ data: primeiro }, { data: ultimo }] = await Promise.all([
    supabase
      .from("lancamentos")
      .select("data")
      .eq("org_id", orgId)
      .order("data", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lancamentos")
      .select("data")
      .eq("org_id", orgId)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return { primeira: primeiro?.data ?? null, ultima: ultimo?.data ?? null };
}

export type ResolucaoData = {
  /** Data efetivamente usada pela tela — já ajustada, se preciso, pro intervalo com dados. */
  data: string;
  /** true quando a data pedida pelo usuário caía fora do intervalo e precisou ser ajustada. */
  ajustada: boolean;
  /** A data originalmente pedida, só quando `ajustada` é true (senão null). */
  dataOriginal: string | null;
};

/**
 * Garante que a data de referência escolhida pelo usuário caia dentro do intervalo em que a
 * organização tem lançamentos registrados. Fora desse intervalo não há dado contábil/analítico
 * nenhum pra mostrar (é antes do primeiro lançamento ou depois do último) — nesse caso "clampa"
 * pro extremo mais próximo e sinaliza o ajuste, pra a tela avisar o usuário e já corrigir o
 * campo de data em vez de mostrar um relatório vazio silenciosamente.
 */
export function resolverDataReferencia(dataEscolhida: string, intervalo: IntervaloLancamentos): ResolucaoData {
  const { primeira, ultima } = intervalo;
  if (!primeira || !ultima) {
    // Organização ainda sem nenhum lançamento — não há intervalo válido pra ajustar contra.
    return { data: dataEscolhida, ajustada: false, dataOriginal: null };
  }
  if (dataEscolhida > ultima) {
    return { data: ultima, ajustada: true, dataOriginal: dataEscolhida };
  }
  if (dataEscolhida < primeira) {
    return { data: primeira, ajustada: true, dataOriginal: dataEscolhida };
  }
  return { data: dataEscolhida, ajustada: false, dataOriginal: null };
}
