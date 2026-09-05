import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransacaoExtraida } from "@/lib/import/parsers";
import type { SugestaoClassificacao } from "@/lib/import/classify";

// Frases que aparecem nos extratos de custódia (Itaú Private Bank, Bradesco
// Bank/Pershing) quando um cupom/juro de um Ativo com acruamento é pago.
const RE_PALAVRA_CUPOM = /\b(BOND INTEREST|FOREIGN BOND INTEREST|INTEREST RECEIVED|COUPON)\b/i;

// CUSIP (9 caracteres alfanuméricos) ou ISIN (2 letras + 9 alfanuméricos +
// 1 dígito verificador, 12 no total) embutidos na descrição da transação —
// mesmo padrão usado para casar posições nos parsers de PDF de custódia.
const RE_IDENTIFICADOR = /\b([A-Z]{2}[A-Z0-9]{9}\d|[0-9A-Z]{9})\b/g;

type AtivoAcruoLookup = { isin: string | null; conta_acruo_code: string | null };

/**
 * Detecta, sem depender da IA, transações de extrato bancário que são
 * recebimento de cupom/juros de um Ativo com acruamento (identificado pelo
 * ISIN/CUSIP embutido na descrição) e sugere diretamente a conta de juros
 * acruados a receber do grupo daquele Ativo.
 *
 * Isso existe porque a IA (sugerirClassificacoes, em lib/import/classify.ts)
 * só enxerga o Plano de Contas — não sabe que a conta "1.1.4.017 — Itaú
 * fev2030" É o próprio título mencionado na descrição "FOREIGN BOND INTEREST
 * — 46556W2E9 — ITAU UNIBANCO...". Como o nome da conta bate com o nome do
 * título, a IA tende a sugerir a conta do ativo — o que zeraria indevidamente
 * o valor de face de um bond carregado até o vencimento (que deve ficar a
 * custo, sem variação). A conta certa é a de juros acruados a receber do
 * grupo (ex.: 1.1.2.006 para o grupo XP/Bradesco), não a do ativo.
 */
export async function sugerirClassificacaoCupomAcruo(
  transacoes: TransacaoExtraida[],
  supabase: SupabaseClient,
  orgId: string
): Promise<Map<number, SugestaoClassificacao>> {
  const sugestoes = new Map<number, SugestaoClassificacao>();

  const candidatos = transacoes
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => RE_PALAVRA_CUPOM.test(t.descricao));
  if (candidatos.length === 0) return sugestoes;

  const { data: ativosData } = await supabase
    .from("ativos")
    .select("isin, conta_acruo_code")
    .eq("org_id", orgId)
    .not("isin", "is", null)
    .not("conta_acruo_code", "is", null);
  const ativos = (ativosData ?? []) as AtivoAcruoLookup[];
  if (ativos.length === 0) return sugestoes;

  for (const { t, index } of candidatos) {
    const identificadores = t.descricao.toUpperCase().match(RE_IDENTIFICADOR) ?? [];
    for (const identificador of identificadores) {
      const ativo = ativos.find((a) =>
        (a.isin ?? "")
          .split(",")
          .map((s) => s.trim())
          .includes(identificador)
      );
      if (ativo?.conta_acruo_code) {
        // conta_acruo_code pode ser uma "pool" com mais de um código separado
        // por vírgula (ex.: grupo Itaú) — usa o primeiro, mesmo critério já
        // usado no resto do sistema para essas contas agrupadas.
        const primeiroCodigo = ativo.conta_acruo_code.split(",")[0].trim();
        sugestoes.set(index, { index, conta_code: primeiroCodigo, confianca: "alta" });
        break;
      }
    }
  }

  return sugestoes;
}
