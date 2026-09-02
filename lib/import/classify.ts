import type { TransacaoExtraida } from "./parsers";

export type ContaResumo = { code: string; name: string; natureza: string };

export type SugestaoClassificacao = {
  index: number;
  conta_code: string | null;
  confianca: "alta" | "media" | "baixa" | null;
};

const SYSTEM_PROMPT = `Você é um assistente contábil que classifica transações de um extrato bancário
nas contas de um plano de contas fornecido. Para cada transação, escolha a conta de CONTRAPARTIDA mais
provável — ou seja, NÃO a conta bancária em si (o débito/crédito na conta bancária já é tratado à parte
pelo sistema), mas a conta do outro lado do lançamento (ex: uma despesa, uma receita, um ativo).

Responda SOMENTE com um array JSON, sem nenhum texto antes ou depois, no formato exato:
[{"index": 0, "conta_code": "3.1.001", "confianca": "alta"}, ...]

Regras:
- "index" deve corresponder exatamente ao índice da transação na lista fornecida.
- "conta_code" deve ser um código EXATO da lista de contas fornecida, ou null se nenhuma conta parecer
  razoável para aquela descrição.
- "confianca" é "alta", "media" ou "baixa" — use "baixa" quando a descrição for muito genérica ou ambígua.
- Toda transação da lista deve aparecer no array de saída, na mesma ordem.`;

// Descrições vindas de extratos de custódia/corretora (parser multi-linha) podem
// concatenar várias linhas do PDF original e ficar bem mais longas que uma
// descrição normal de extrato bancário. Truncamos antes de mandar pro modelo
// pra manter o prompt enxuto e não estourar limites de tokens da API.
const MAX_LEN_DESCRICAO = 300;

function extrairJsonArray(texto: string): unknown {
  const inicio = texto.indexOf("[");
  const fim = texto.lastIndexOf("]");
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error(`Resposta do modelo não continha um array JSON. Início da resposta: ${texto.slice(0, 200)}`);
  }
  return JSON.parse(texto.slice(inicio, fim + 1));
}

/**
 * Pede ao modelo (Anthropic) uma sugestão de conta de contrapartida para cada
 * transação extraída de um extrato. Sem ANTHROPIC_API_KEY configurada, retorna
 * sugestões vazias (o usuário classifica manualmente na tela de conciliação) —
 * mesmo comportamento de "modo demo" já usado no chat do CFO de Bolso.
 */
export async function sugerirClassificacoes(
  transacoes: TransacaoExtraida[],
  contas: ContaResumo[]
): Promise<SugestaoClassificacao[]> {
  const vazio = transacoes.map((_, index) => ({ index, conta_code: null, confianca: null }) as const);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[sugerirClassificacoes] ANTHROPIC_API_KEY não configurada — pulando sugestão de IA.");
    return vazio;
  }
  if (transacoes.length === 0) return vazio;
  if (contas.length === 0) {
    console.warn("[sugerirClassificacoes] Lista de contas vazia — nenhuma conta de contrapartida disponível para sugerir.");
    return vazio;
  }

  const listaContas = contas
    .map((c) => `${c.code} — ${c.name} (${c.natureza})`)
    .join("\n");
  const listaTransacoes = transacoes
    .map((t, i) => {
      const descricao =
        t.descricao.length > MAX_LEN_DESCRICAO
          ? `${t.descricao.slice(0, MAX_LEN_DESCRICAO)}…`
          : t.descricao;
      return `${i}: ${t.data} | ${descricao} | ${t.valor > 0 ? "entrada" : "saída"} de ${Math.abs(t.valor).toFixed(2)}`;
    })
    .join("\n");

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
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `PLANO DE CONTAS:\n${listaContas}\n\nTRANSAÇÕES:\n${listaTransacoes}`,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      throw new Error(`Anthropic API error: ${resp.status} — ${corpo.slice(0, 500)}`);
    }

    const json = await resp.json();
    const texto = json.content?.[0]?.text ?? "";
    const parsed = extrairJsonArray(texto) as SugestaoClassificacao[];

    const contasValidas = new Set(contas.map((c) => c.code));
    const porIndice = new Map(parsed.map((p) => [p.index, p]));

    return transacoes.map((_, index) => {
      const s = porIndice.get(index);
      if (!s || !s.conta_code || !contasValidas.has(s.conta_code)) {
        return { index, conta_code: null, confianca: null };
      }
      return s;
    });
  } catch (e) {
    // Falha ao consultar a IA não deve travar a importação — as
    // transações simplesmente ficam sem sugestão, para classificação manual.
    // Logamos o motivo pra dar pra investigar depois nos Vercel Runtime Logs.
    console.error("[sugerirClassificacoes] Falha ao obter sugestões da IA:", e);
    return vazio;
  }
}
