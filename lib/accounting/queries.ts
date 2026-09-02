import type { SupabaseClient } from "@supabase/supabase-js";

export type SaldoConta = {
  org_id: string;
  conta_code: string;
  conta_name: string;
  natureza: "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA" | "CONTROLE";
  saldo: number;
};

/**
 * Busca o saldo de todas as contas da organização atual a partir da view
 * v_saldo_contas. A view é security_invoker, então esta query só retorna
 * linhas da(s) organização(ões) às quais o usuário logado pertence — o
 * filtro por org_id abaixo é redundante com o RLS, mas mantido explícito
 * por clareza e para aproveitar o índice.
 */
export async function getSaldosPorConta(supabase: SupabaseClient, orgId: string) {
  const { data, error } = await supabase
    .from("v_saldo_contas")
    .select("*")
    .eq("org_id", orgId)
    .order("conta_code")
    .returns<SaldoConta[]>();

  if (error) throw error;
  return data ?? [];
}

export async function getMovimentoConta(
  supabase: SupabaseClient,
  orgId: string,
  contaCode: string
) {
  const { data, error } = await supabase
    .from("v_movimento_contas")
    .select("*")
    .eq("org_id", orgId)
    .eq("conta_code", contaCode)
    .order("data", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export function totalPorNatureza(saldos: SaldoConta[], natureza: SaldoConta["natureza"]) {
  return saldos
    .filter((s) => s.natureza === natureza)
    .reduce((acc, s) => acc + Number(s.saldo), 0);
}
