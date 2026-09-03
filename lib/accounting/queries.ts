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

/**
 * Igual a `getSaldosPorConta`, mas calcula o saldo de cada conta somando apenas os
 * lançamentos até (e incluindo) a data informada — para ver a Carteira, Dívidas ou
 * qualquer outra tela sincronizada com o contábil "como estava" numa data passada, em
 * vez do saldo atual (hoje).
 */
export async function getSaldosPorContaAteData(
  supabase: SupabaseClient,
  orgId: string,
  ateData: string
): Promise<SaldoConta[]> {
  const { data, error } = await supabase
    .from("v_movimento_contas")
    .select("conta_code, conta_name, natureza, valor_saldo")
    .eq("org_id", orgId)
    .lte("data", ateData);

  if (error) throw error;

  const porConta = new Map<string, SaldoConta>();
  for (const m of data ?? []) {
    const atual = porConta.get(m.conta_code) ?? {
      org_id: orgId,
      conta_code: m.conta_code,
      conta_name: m.conta_name,
      natureza: m.natureza,
      saldo: 0,
    };
    atual.saldo += Number(m.valor_saldo);
    porConta.set(m.conta_code, atual);
  }
  return Array.from(porConta.values()).sort((a, b) => a.conta_code.localeCompare(b.conta_code));
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
