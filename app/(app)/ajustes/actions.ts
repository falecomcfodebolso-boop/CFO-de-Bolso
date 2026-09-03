"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { getSaldosPorConta } from "@/lib/accounting/queries";
import { calcularAcruoInterno, type AtivoAcruo } from "@/lib/accounting/acruo";

export type ActionState = { error?: string; aviso?: string } | null;

/** Primeiro código de uma lista separada por vírgula (usado nas linhas do lançamento). */
function primeiroCodigo(lista: string): string {
  return lista.split(",")[0].trim();
}

/** Soma o saldo contábil de uma lista de contas (separadas por vírgula, para pools compartilhados). */
function somarSaldo(saldos: { conta_code: string; saldo: number }[], codigos: string): number {
  const lista = codigos.split(",").map((c) => c.trim());
  return lista.reduce((acc, c) => acc + Number(saldos.find((s) => s.conta_code === c)?.saldo ?? 0), 0);
}

/**
 * Registra a leitura do extrato/valuation statement de um grupo de acruo (valor informado pelo
 * banco/custodiante na data-base), compara com o saldo já reconhecido na contabilidade (podendo
 * somar mais de uma conta, quando o grupo compartilha um pool de contas) e — quando há diferença —
 * gera automaticamente o lançamento de ajuste entre a conta de acruo e a conta de receita
 * correspondente (a primeira de cada lista, quando o grupo tem mais de uma). Também calcula, quando
 * o grupo tem Ativos cadastrados com o detalhamento necessário (valor face, taxa, cronograma ou
 * data de início da aplicação), a soma do cálculo interno papel a papel (30/360) de todos os papéis
 * de renda fixa do grupo, só para comparação/justificativa — o valor efetivamente reconhecido na
 * contabilidade é sempre o do extrato do banco.
 */
export async function registrarAjusteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar ajustes." };
  }

  const contaAcruoCode = String(formData.get("conta_acruo_code") || "").trim();
  const contaReceitaCode = String(formData.get("conta_receita_code") || "").trim();
  const nomeGrupo = String(formData.get("nome_grupo") || "").trim();
  const dataBase = String(formData.get("data_base") || "").trim();
  const valorBancoRaw = String(formData.get("valor_reportado_banco") || "").trim();
  const fonte = String(formData.get("fonte") || "").trim() || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!contaAcruoCode || !contaReceitaCode || !nomeGrupo || !dataBase || !valorBancoRaw) {
    return {
      error: "Preencha conta de acruo, conta de receita, nome do grupo, data-base e valor informado pelo banco.",
    };
  }
  const valorBanco = parseFloat(valorBancoRaw.replace(",", "."));
  if (Number.isNaN(valorBanco)) return { error: "Valor informado pelo banco inválido." };

  const saldos = await getSaldosPorConta(supabase, currentOrgId);
  const saldoAtual = somarSaldo(saldos, contaAcruoCode);

  // Cálculo interno papel a papel: soma o acruo calculado de todos os Ativos cadastrados
  // neste grupo (grupo_acruo_nome), incluindo os de categoria "continuo" (ex. CLNs sem
  // cronograma, calculados desde a data de início da aplicação). Serve só de comparação —
  // o valor lançado continua sendo sempre o do extrato do banco.
  let acruoCalculadoInterno: number | null = null;
  const { data: ativosGrupo } = await supabase
    .from("ativos")
    .select(
      "id, nome, valor_face, taxa_cupom, categoria_acruo, tipo_taxa, spread_taxa, taxa_referencia_atual, indice_referencia, data_pagamento_anterior, data_inicio_acruo, pendente_custodiante, conta_acruo_code, conta_receita_code, grupo_acruo_nome"
    )
    .eq("org_id", currentOrgId)
    .eq("grupo_acruo_nome", nomeGrupo);

  if (ativosGrupo && ativosGrupo.length > 0) {
    let soma = 0;
    let algumCalculavel = false;
    for (const a of ativosGrupo as AtivoAcruo[]) {
      // Posições "pending receipt" no custodiante ainda não têm valor reportado pelo banco,
      // então não entram nesta soma — ela é comparada diretamente com valor_reportado_banco,
      // que por definição só reflete posições já confirmadas.
      if (a.pendente_custodiante) continue;
      const r = calcularAcruoInterno(a, dataBase);
      if (r.valor != null) {
        soma += r.valor;
        algumCalculavel = true;
      }
    }
    if (algumCalculavel) acruoCalculadoInterno = Math.round(soma * 100) / 100;
  }

  const diferenca = Math.round((valorBanco - saldoAtual) * 100) / 100;
  let lancamentoId: string | null = null;

  if (Math.abs(diferenca) >= 0.01) {
    const contaAcruoLancamento = primeiroCodigo(contaAcruoCode);
    const contaReceitaLancamento = primeiroCodigo(contaReceitaCode);

    const { data: maxNumero } = await supabase
      .from("lancamentos")
      .select("numero")
      .eq("org_id", currentOrgId)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    const numero = (maxNumero?.numero ?? 0) + 1;

    const linhas =
      diferenca > 0
        ? [
            { conta_code: contaAcruoLancamento, tipo: "D", valor: Math.abs(diferenca) },
            { conta_code: contaReceitaLancamento, tipo: "C", valor: Math.abs(diferenca) },
          ]
        : [
            { conta_code: contaReceitaLancamento, tipo: "D", valor: Math.abs(diferenca) },
            { conta_code: contaAcruoLancamento, tipo: "C", valor: Math.abs(diferenca) },
          ];

    const { data: lancId, error: lancError } = await supabase.rpc("create_lancamento", {
      p_org_id: currentOrgId,
      p_numero: numero,
      p_data: dataBase,
      p_historico: `Ajuste de acruamento — ${nomeGrupo} (${fonte || "extrato do banco/custodiante"})`,
      p_linhas: linhas,
      p_intercompany_org_id: null,
    });
    if (lancError) return { error: lancError.message };
    lancamentoId = lancId as string;
  }

  const { error } = await supabase.from("ajustes_acruo").insert({
    org_id: currentOrgId,
    ativo_id: null,
    conta_acruo_code: contaAcruoCode,
    conta_receita_code: contaReceitaCode,
    nome_grupo: nomeGrupo,
    data_base: dataBase,
    data_base_anterior: null,
    valor_reportado_banco: valorBanco,
    saldo_contabil_antes: saldoAtual,
    acruo_calculado_interno: acruoCalculadoInterno,
    diferenca,
    fonte,
    observacoes,
    lancamento_id: lancamentoId,
  });
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  revalidatePath("/diario");
  revalidatePath("/balancete");
  revalidatePath("/razoes");
  revalidatePath("/demonstracoes/dre");
  revalidatePath("/consolidado");

  if (Math.abs(diferenca) < 0.01) {
    return { aviso: "Valor do banco já bate com a contabilidade — nenhum lançamento foi necessário." };
  }
  return null;
}

export async function deleteAjusteAction(formData: FormData) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return;

  const id = String(formData.get("id") || "");
  await supabase.from("ajustes_acruo").delete().eq("org_id", currentOrgId).eq("id", id);

  revalidatePath("/ajustes");
}
