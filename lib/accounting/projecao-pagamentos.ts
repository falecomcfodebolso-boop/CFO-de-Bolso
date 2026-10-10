/**
 * Projeção de pagamentos futuros de ativos de renda fixa (cupons +
 * principal no vencimento) para a tela "Previsão de Pagamentos" —
 * puramente informativo/analítico: não gera nenhum lançamento contábil
 * e não é lido por nenhum relatório financeiro.
 *
 * O cronograma de cupons é simulado avançando a partir de
 * `data_pagamento_anterior` em passos de `periodicidade_cupom` até
 * `data_vencimento`. Isso só funciona bem se `data_pagamento_anterior`
 * estiver sempre atualizada com a data do último cupom realmente pago
 * (é o mesmo campo usado no cálculo de acruo em ajustes/Ajustes) — se
 * ela estiver desatualizada, a agenda simulada também fica desatualizada.
 * Por isso, sempre que o passo calculado não bate exatamente com
 * data_vencimento, emitimos um aviso em vez de inventar um valor de
 * cupom final.
 */

export type CategoriaAcruoProjecao =
  | "periodico"
  | "continuo"
  | "mercado"
  | "defaulted"
  | "desconto"
  | "vencido"
  | null;

export type PeriodicidadeCupom = "mensal" | "trimestral" | "semestral" | "anual";

export type AtivoProjecao = {
  id: string;
  nome: string;
  custodiante: string | null;
  valor_atual: number;
  valor_face: number | null;
  taxa_cupom: number | null;
  categoria_acruo: CategoriaAcruoProjecao;
  tipo_taxa: "fixa" | "flutuante" | null;
  spread_taxa: number | null;
  taxa_referencia_atual: number | null;
  periodicidade_cupom: PeriodicidadeCupom | null;
  data_pagamento_anterior: string | null;
  data_vencimento: string | null;
};

export type TipoPagamentoPrevisto = "cupom" | "cupom_final" | "vencimento_sem_cronograma";

export type PagamentoPrevisto = {
  ativoId: string;
  nome: string;
  custodiante: string | null;
  data: string; // ISO yyyy-mm-dd
  tipo: TipoPagamentoPrevisto;
  valorCupom: number | null;
  valorPrincipal: number | null;
  valorTotal: number;
  estimado: boolean; // taxa flutuante — usa a última taxa de referência conhecida
  observacao: string | null;
};

export const MESES_POR_PERIODO: Record<PeriodicidadeCupom, number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export const PERIODICIDADE_LABEL: Record<PeriodicidadeCupom, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

/** Exportada também pra app/(app)/ajustes/actions.ts, que usa o mesmo passo de meses pra
 *  avançar data_pagamento_anterior automaticamente quando um ajuste é lançado (ver
 *  avancarDataPagamentoAnteriorAposAjuste). */
export function addMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(y, m - 1 + meses, d));
  return data.toISOString().slice(0, 10);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Gera a lista de pagamentos previstos (cupons + vencimento) entre
 * `hojeISO` (inclusive) e `horizonteISO` (inclusive), para todos os
 * ativos informados que ainda não venceram.
 */
export function gerarPrevisaoPagamentos(
  ativos: AtivoProjecao[],
  hojeISO: string,
  horizonteISO: string
): PagamentoPrevisto[] {
  const resultado: PagamentoPrevisto[] = [];

  for (const a of ativos) {
    if (!a.data_vencimento) continue;
    if (a.data_vencimento < hojeISO) continue; // já vencido — não entra na agenda

    const principal = a.valor_face ?? a.valor_atual;

    const taxaConhecida =
      a.tipo_taxa === "flutuante" ? a.taxa_referencia_atual != null : a.taxa_cupom != null;
    const podeProjetarCupons =
      a.categoria_acruo === "periodico" &&
      a.periodicidade_cupom != null &&
      a.data_pagamento_anterior != null &&
      taxaConhecida;

    if (!podeProjetarCupons) {
      if (a.data_vencimento <= horizonteISO) {
        resultado.push({
          ativoId: a.id,
          nome: a.nome,
          custodiante: a.custodiante,
          data: a.data_vencimento,
          tipo: "vencimento_sem_cronograma",
          valorCupom: null,
          valorPrincipal: a.valor_atual,
          valorTotal: a.valor_atual,
          estimado: false,
          observacao:
            a.categoria_acruo === "periodico"
              ? "Periodicidade do cupom não cadastrada (periodicidade_cupom) — mostrando só o valor total no vencimento, sem separar os cupons intermediários."
              : "Esta categoria não tem cronograma de cupom previsível — valor total no vencimento.",
        });
      }
      continue;
    }

    const meses = MESES_POR_PERIODO[a.periodicidade_cupom as PeriodicidadeCupom];
    const taxaEfetivaAnual =
      a.tipo_taxa === "flutuante"
        ? (a.taxa_referencia_atual ?? 0) + (a.spread_taxa ?? 0)
        : a.taxa_cupom ?? 0;
    const estimado = a.tipo_taxa === "flutuante";

    let cursor = a.data_pagamento_anterior as string;
    let ultimoCupomEmitido: string | null = null;
    let guard = 0;
    while (guard < 400) {
      guard++;
      const proximo = addMeses(cursor, meses);
      if (proximo > a.data_vencimento) break;
      cursor = proximo;
      if (cursor >= hojeISO && cursor <= horizonteISO) {
        const ehFinal = cursor === a.data_vencimento;
        const valorCupom = round2(principal * taxaEfetivaAnual * (meses / 12));
        resultado.push({
          ativoId: a.id,
          nome: a.nome,
          custodiante: a.custodiante,
          data: cursor,
          tipo: ehFinal ? "cupom_final" : "cupom",
          valorCupom,
          valorPrincipal: ehFinal ? principal : null,
          valorTotal: ehFinal ? round2(valorCupom + principal) : valorCupom,
          estimado,
          observacao: estimado
            ? "Taxa flutuante — usa a última taxa de referência conhecida (taxa_referencia_atual), que pode mudar até a data do pagamento."
            : null,
        });
      }
      if (cursor === a.data_vencimento) {
        ultimoCupomEmitido = cursor;
        break;
      }
    }

    // Se o avanço por periodicidade não bateu exatamente no vencimento
    // (ex.: data_pagamento_anterior desatualizada, ou período final
    // quebrado), nunca inventamos o valor do cupom final — só avisamos.
    if (ultimoCupomEmitido !== a.data_vencimento && a.data_vencimento <= horizonteISO) {
      resultado.push({
        ativoId: a.id,
        nome: a.nome,
        custodiante: a.custodiante,
        data: a.data_vencimento,
        tipo: "vencimento_sem_cronograma",
        valorCupom: null,
        valorPrincipal: principal,
        valorTotal: principal,
        estimado: false,
        observacao:
          "O vencimento não coincidiu com um múltiplo exato da periodicidade cadastrada a partir de data_pagamento_anterior — confira se essa data está atualizada com o último cupom realmente pago. Mostrando só o principal, sem calcular o cupom final.",
      });
    }
  }

  return resultado.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

export type ResumoMes = {
  mes: string; // YYYY-MM
  totalCupons: number;
  totalPrincipal: number;
  total: number;
};

export function resumoPorMes(pagamentos: PagamentoPrevisto[]): ResumoMes[] {
  const mapa = new Map<string, { totalCupons: number; totalPrincipal: number }>();
  for (const p of pagamentos) {
    const mes = p.data.slice(0, 7);
    const atual = mapa.get(mes) ?? { totalCupons: 0, totalPrincipal: 0 };
    atual.totalCupons += p.valorCupom ?? 0;
    atual.totalPrincipal += p.valorPrincipal ?? 0;
    mapa.set(mes, atual);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([mes, v]) => ({
      mes,
      totalCupons: round2(v.totalCupons),
      totalPrincipal: round2(v.totalPrincipal),
      total: round2(v.totalCupons + v.totalPrincipal),
    }));
}
