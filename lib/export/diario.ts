import type { SupabaseClient } from "@supabase/supabase-js";
import type { LinhaDiario } from "@/lib/export/excel";

/** Linhas do Diário (uma por partida, débitos antes dos créditos) no intervalo — usada pela exportação do Diário e pelo relatório geral. */
export async function getLinhasDiario(
  supabase: SupabaseClient,
  orgId: string,
  inicio: string,
  fim: string
): Promise<LinhaDiario[]> {
  const [{ data: contas }, { data: lancamentos, error }] = await Promise.all([
    supabase.from("plano_de_contas").select("code, name").eq("org_id", orgId),
    supabase
      .from("lancamentos")
      .select("id, numero, data, historico, lancamento_linhas(conta_code, tipo, valor)")
      .eq("org_id", orgId)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data", { ascending: true })
      .order("numero", { ascending: true }),
  ]);

  if (error) throw error;

  const nomePorCodigo = new Map((contas ?? []).map((c) => [c.code, c.name]));

  return (lancamentos ?? []).flatMap((l) =>
    (l.lancamento_linhas as { conta_code: string; tipo: "D" | "C"; valor: number }[])
      .sort((a) => (a.tipo === "D" ? -1 : 1))
      .map((ln) => ({
        data: l.data,
        lancamentoNumero: l.numero,
        historico: l.historico,
        contaCode: ln.conta_code,
        contaName: nomePorCodigo.get(ln.conta_code) ?? "",
        tipo: ln.tipo,
        valor: Number(ln.valor),
      }))
  );
}
