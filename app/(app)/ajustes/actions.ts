"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { getSaldosPorConta } from "@/lib/accounting/queries";

export type ActionState = { error?: string; aviso?: string } | null;

/** Diferença em dias corridos entre duas datas ISO (YYYY-MM-DD). */
function diasEntre(dataInicio: string, dataFim: string): number {
  const a = new Date(`${dataInicio}T00:00:00Z`).getTime();
  const b = new Date(`${dataFim}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Registra a leitura do extrato/valuation statement de um período (valor de acruo informado pelo
 * banco/custodiante), compara com o saldo já reconhecido na contabilidade e — quando há diferença —
 * gera automaticamente o lançamento de ajuste (débito/crédito entre a conta de acruo e a conta de
 * receita financeira correspondente). Também calcula, quando possível, um acruo esperado por um
 * método interno simplificado (cupom x dias corridos / 360) só para comparação/justificativa — o
 * valor efetivamente reconhecido na contabilidade é sempre o do extrato do banco, seguindo a mesma
 * política já documentada nas planilhas de origem (o custodiante é a fonte de verdade do acruo).
 */
export async function registrarAjusteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar ajustes." };
  }

  const ativoId = String(formData.get("ativo_id") || "").trim() || null;
  const contaAcruoCode = String(formData.get("conta_acruo_code") || "").trim();
  const contaReceitaCode = String(formData.get("conta_receita_code") || "").trim();
  const nomeGrupo = String(formData.get("nome_grupo") || "").trim();
  const dataBase = String(formData.get("data_base") || "").trim();
  const dataBaseAnteriorInput = String(formData.get("data_base_anterior") || "").trim() || null;
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
  const saldoAtual = Number(saldos.find((s) => s.conta_code === contaAcruoCode)?.saldo ?? 0);

  let acruoCalculadoInterno: number | null = null;
  let dataBaseAnterior: string | null = dataBaseAnteriorInput;

  if (ativoId) {
    const { data: ativo } = await supabase
      .from("ativos")
      .select("valor_atual, taxa_cupom")
      .eq("org_id", currentOrgId)
      .eq("id", ativoId)
      .maybeSingle();

    if (ativo?.taxa_cupom) {
      if (!dataBaseAnterior) {
        const { data: ultimoAjuste } = await supabase
          .from("ajustes_acruo")
          .select("data_base")
          .eq("org_id", currentOrgId)
          .eq("ativo_id", ativoId)
          .order("data_base", { ascending: false })
          .limit(1)
          .maybeSingle();
        dataBaseAnterior = ultimoAjuste?.data_base ?? null;
      }
      if (dataBaseAnterior) {
        const dias = diasEntre(dataBaseAnterior, dataBase);
        if (dias > 0) {
          acruoCalculadoInterno = Number(ativo.valor_atual) * Number(ativo.taxa_cupom) * (dias / 360);
        }
      }
    }
  }

  const diferenca = Math.round((valorBanco - saldoAtual) * 100) / 100;
  let lancamentoId: string | null = null;

  if (Math.abs(diferenca) >= 0.01) {
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
            { conta_code: contaAcruoCode, tipo: "D", valor: Math.abs(diferenca) },
            { conta_code: contaReceitaCode, tipo: "C", valor: Math.abs(diferenca) },
          ]
        : [
            { conta_code: contaReceitaCode, tipo: "D", valor: Math.abs(diferenca) },
            { conta_code: contaAcruoCode, tipo: "C", valor: Math.abs(diferenca) },
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
    ativo_id: ativoId,
    conta_acruo_code: contaAcruoCode,
    conta_receita_code: contaReceitaCode,
    nome_grupo: nomeGrupo,
    data_base: dataBase,
    data_base_anterior: dataBaseAnterior,
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
