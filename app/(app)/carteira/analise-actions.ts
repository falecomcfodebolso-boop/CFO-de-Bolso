"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import {
  totalCarteira,
  hhi,
  concentracaoPorCustodiante,
  topNConcentracao,
  taxaMediaPonderada,
  prazoMedioPonderado,
  distribuicaoPorVencimento,
  distribuicaoPorGrupoEmissor,
  exposicaoEstrutura,
  exposicaoPais,
  type Ativo,
} from "@/lib/portfolio/indices";

export type AnaliseActionState = { error?: string } | null;

const SYSTEM_PROMPT = `Você é um analista de risco de carteiras de investimento, escrevendo para o gestor de uma
holding patrimonial. Use SOMENTE os números fornecidos no contexto abaixo — nunca invente valores, ratings de
crédito ao vivo ou cotações de mercado que não estejam no contexto. Se não houver dado suficiente para avaliar
alguma dimensão, diga isso explicitamente em vez de supor.

Estruture a resposta em português do Brasil, em Markdown, com exatamente duas seções:

## Análise de Risco
Uma tabela ou lista cobrindo, para cada dimensão de risco identificável a partir dos dados (concentração por papel,
concentração por emissor/setor, risco-país, exposição a estruturas complexas como CLNs, risco de contraparte/custódia,
risco de taxa de juros/duration, risco de liquidez, risco cambial, risco de mercado de fundos/renda variável quando
houver): o nível (baixo/médio/médio-alto/alto) e uma justificativa breve baseada nos números do contexto.

## Recomendações
Uma lista numerada de recomendações de rebalanceamento/ação, cada uma com 1-3 frases, coerentes com o perfil de
risco informado no contexto. Termine com uma recomendação padrão pedindo para obter ratings de crédito atualizados
por emissor, já que este relatório não tem acesso a ratings ao vivo.

Seja direto, sem preâmbulo antes do primeiro cabeçalho. Não adicione avisos legais além de, no máximo, uma frase
final lembrando que isto não é aconselhamento de investimento individualizado.`;

function montarContexto(ativos: Ativo[], currency: string, perfilRisco: string): string {
  const total = totalCarteira(ativos);
  const hhiValue = hhi(ativos);
  const top10 = topNConcentracao(ativos, 10);
  const porCustodiante = concentracaoPorCustodiante(ativos);
  const taxaMedia = taxaMediaPonderada(ativos);
  const prazoMedio = prazoMedioPonderado(ativos);
  const porVencimento = distribuicaoPorVencimento(ativos);
  const porGrupo = distribuicaoPorGrupoEmissor(ativos);
  const cln = exposicaoEstrutura(ativos, "CLN");
  const brasil = exposicaoPais(ativos, "Brasil");

  const linhas: string[] = [];
  linhas.push(`Perfil de risco declarado do investidor: ${perfilRisco}`);
  linhas.push(`Moeda: ${currency}`);
  linhas.push(`Total da carteira: ${total.toFixed(2)}`);
  linhas.push(`Número de posições: ${ativos.length}`);
  linhas.push(`HHI (concentração por papel, 0-10.000): ${hhiValue.toFixed(0)}`);
  linhas.push(`Cupom médio ponderado: ${(taxaMedia * 100).toFixed(2)}% a.a.`);
  linhas.push(`Prazo médio ponderado até o vencimento: ${prazoMedio.toFixed(2)} anos`);
  linhas.push(`Exposição a CLNs (Credit Linked Notes): ${cln.valor.toFixed(2)} (${(cln.pct * 100).toFixed(1)}%)`);
  linhas.push(`Exposição a risco-país Brasil: ${brasil.valor.toFixed(2)} (${(brasil.pct * 100).toFixed(1)}%)`);
  linhas.push(`\nConcentração por custodiante:`);
  for (const c of porCustodiante) linhas.push(`- ${c.custodiante}: ${c.valor.toFixed(2)} (${(c.pct * 100).toFixed(1)}%)`);
  linhas.push(`\nTop 10 posições individuais:`);
  for (const a of top10) linhas.push(`- ${a.nome}: ${a.valor.toFixed(2)} (${(a.pct * 100).toFixed(1)}%)`);
  linhas.push(`\nDistribuição por grupo de emissor/setor:`);
  for (const g of porGrupo) linhas.push(`- ${g.grupo}: ${g.valor.toFixed(2)} (${(g.pct * 100).toFixed(1)}%)`);
  linhas.push(`\nDistribuição por faixa de vencimento:`);
  for (const f of porVencimento) linhas.push(`- ${f.label}: ${f.valor.toFixed(2)} (${(f.pct * 100).toFixed(1)}%)`);
  linhas.push(`\nDetalhamento por ativo (nome | custodiante | valor | cupom | vencimento | grupo | estrutura):`);
  for (const a of ativos) {
    linhas.push(
      `- ${a.nome} | ${a.custodiante ?? "—"} | ${Number(a.valor_atual).toFixed(2)} | ${
        a.taxa_cupom != null ? (Number(a.taxa_cupom) * 100).toFixed(3) + "%" : "—"
      } | ${a.data_vencimento ?? "—"} | ${a.grupo_emissor ?? "—"} | ${a.estrutura ?? "—"}`
    );
  }
  return linhas.join("\n");
}

export async function gerarAnaliseCarteiraAction(
  ativos: Ativo[],
  currency: string,
  perfilRisco: string
): Promise<AnaliseActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite gerar análises." };
  }

  const contexto = montarContexto(ativos, currency, perfilRisco);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  let conteudo: string;
  if (!apiKey) {
    conteudo =
      "_[Modo demo — ANTHROPIC_API_KEY não configurada]_ Contexto que seria enviado ao modelo:\n\n```\n" +
      contexto +
      "\n```";
  } else {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: `${SYSTEM_PROMPT}\n\n--- DADOS DA CARTEIRA ---\n${contexto}`,
          messages: [{ role: "user", content: "Gere a análise de risco e as recomendações." }],
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        return { error: `Erro ao consultar o modelo: ${resp.status} ${errText.slice(0, 300)}` };
      }
      const json = await resp.json();
      conteudo = json.content?.[0]?.text ?? "Não foi possível gerar a análise agora.";
    } catch (e) {
      return { error: `Não foi possível consultar o modelo agora (${(e as Error).message}).` };
    }
  }

  const { error } = await supabase.from("analises_carteira").insert({
    org_id: currentOrgId,
    conteudo,
    contexto_resumo: contexto.slice(0, 4000),
  });
  if (error) return { error: error.message };

  revalidatePath("/carteira");
  return null;
}
