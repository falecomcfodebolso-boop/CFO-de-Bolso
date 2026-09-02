import type { SupabaseClient } from "@supabase/supabase-js";
import { getSaldosPorConta, totalPorNatureza } from "@/lib/accounting/queries";
import { totalCarteira, hhi, concentracaoPorCustodiante, taxaMediaPonderada, type Ativo } from "@/lib/portfolio/indices";

/**
 * Monta o contexto financeiro da organização ATUAL para alimentar o
 * CFO de bolso (LLM). Recebe um client Supabase já autenticado como o
 * usuário da sessão (nunca a service role) — todas as queries aqui
 * passam pelas mesmas policies de RLS de qualquer outra parte do app,
 * então este contexto NUNCA pode conter dados de outra organização,
 * mesmo que o orgId informado esteja errado ou seja manipulado: se o
 * usuário não for membro daquela org, as queries simplesmente retornam
 * vazio.
 */
export async function buildFinancialContext(supabase: SupabaseClient, orgId: string, currency: string) {
  const [saldos, { data: ativosData }, { data: lancamentos }] = await Promise.all([
    getSaldosPorConta(supabase, orgId),
    supabase.from("ativos").select("*").eq("org_id", orgId),
    supabase
      .from("lancamentos")
      .select("numero, data, historico, lancamento_linhas(conta_code, tipo, valor)")
      .eq("org_id", orgId)
      .order("numero", { ascending: false })
      .limit(30),
  ]);

  const ativos = (ativosData ?? []) as Ativo[];
  const ativoTotal = totalPorNatureza(saldos, "ATIVO");
  const passivoTotal = totalPorNatureza(saldos, "PASSIVO");
  const receita = totalPorNatureza(saldos, "RECEITA");
  const despesa = totalPorNatureza(saldos, "DESPESA");
  const resultado = receita - despesa;

  const carteira = totalCarteira(ativos);
  const hhiValue = hhi(ativos);
  const porCustodiante = concentracaoPorCustodiante(ativos);
  const taxaMedia = taxaMediaPonderada(ativos);

  const linhas: string[] = [];
  linhas.push(`Moeda base: ${currency}`);
  linhas.push(`Ativo Total (contábil): ${ativoTotal.toFixed(2)}`);
  linhas.push(`Passivo Total: ${passivoTotal.toFixed(2)}`);
  linhas.push(`Receita do período: ${receita.toFixed(2)}`);
  linhas.push(`Despesa do período: ${despesa.toFixed(2)}`);
  linhas.push(`Resultado do período: ${resultado.toFixed(2)}`);
  linhas.push("");
  linhas.push("Saldos por conta (Plano de Contas):");
  for (const s of saldos) {
    linhas.push(`  ${s.conta_code} - ${s.conta_name} (${s.natureza}): ${Number(s.saldo).toFixed(2)}`);
  }
  linhas.push("");
  linhas.push(`Carteira de ativos — total: ${carteira.toFixed(2)}, HHI (concentração): ${hhiValue.toFixed(0)}, taxa média ponderada: ${(taxaMedia * 100).toFixed(2)}% a.a.`);
  linhas.push("Concentração por custodiante:");
  for (const c of porCustodiante) {
    linhas.push(`  ${c.custodiante}: ${c.valor.toFixed(2)} (${(c.pct * 100).toFixed(1)}%)`);
  }
  linhas.push("");
  linhas.push("Ativos individuais:");
  for (const a of ativos) {
    linhas.push(
      `  ${a.nome} | custodiante=${a.custodiante ?? "?"} | valor=${Number(a.valor_atual).toFixed(2)} | cupom=${a.taxa_cupom ? (Number(a.taxa_cupom) * 100).toFixed(3) + "%" : "-"} | vencimento=${a.data_vencimento ?? "-"}`
    );
  }
  linhas.push("");
  linhas.push("Últimos lançamentos do Diário:");
  for (const l of lancamentos ?? []) {
    const linhasLcto = (l.lancamento_linhas as { conta_code: string; tipo: string; valor: number }[]) ?? [];
    const resumo = linhasLcto.map((x) => `${x.tipo} ${x.conta_code} ${Number(x.valor).toFixed(2)}`).join("; ");
    linhas.push(`  #${l.numero} ${l.data} — ${l.historico} :: ${resumo}`);
  }

  return linhas.join("\n");
}
