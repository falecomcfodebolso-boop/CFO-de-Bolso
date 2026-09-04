"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { getSaldosPorContaAteData } from "@/lib/accounting/queries";

export type MarcacaoActionState = { error?: string; aviso?: string } | null;

function revalidarTelasContabeis() {
  revalidatePath("/ajustes");
  revalidatePath("/diario");
  revalidatePath("/balancete");
  revalidatePath("/razoes");
  revalidatePath("/demonstracoes/dre");
  revalidatePath("/consolidado");
  revalidatePath("/carteira");
}

/**
 * Registra a apuração de marcação a mercado de um fundo/posição de categoria 'mercado'
 * (Pimco, Vanguard, Oaktree, CP Note GLD — sem cronograma de cupom, cujo valor contábil é o
 * próprio principal). Só grava os números pra revisão; o lançamento contábil da diferença
 * (contra a conta de ganho/perda dedicada do fundo) só é gerado depois de aprovado
 * separadamente (ver lancarMarcacaoAction), no mesmo padrão dos Ajustes de Acruamento.
 */
export async function registrarMarcacaoAction(
  _prev: MarcacaoActionState,
  formData: FormData
): Promise<MarcacaoActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar apurações." };
  }

  const ativoId = String(formData.get("ativo_id") || "").trim();
  const dataBase = String(formData.get("data_base") || "").trim();
  const valorRaw = String(formData.get("valor_reportado_mercado") || "").trim();
  const fonte = String(formData.get("fonte") || "").trim() || null;
  const observacoes = String(formData.get("observacoes") || "").trim() || null;

  if (!ativoId || !dataBase || !valorRaw) {
    return { error: "Preencha o fundo, a data-base e o valor de mercado informado." };
  }
  const valorMercado = parseFloat(valorRaw.replace(",", "."));
  if (Number.isNaN(valorMercado)) return { error: "Valor de mercado inválido." };

  const { data: ativo, error: ativoError } = await supabase
    .from("ativos")
    .select("id, nome, conta_code, conta_ganho_perda_mercado_code, categoria_acruo")
    .eq("org_id", currentOrgId)
    .eq("id", ativoId)
    .maybeSingle();
  if (ativoError) return { error: ativoError.message };
  if (!ativo) return { error: "Ativo não encontrado." };
  if (!ativo.conta_code || !ativo.conta_ganho_perda_mercado_code) {
    return { error: "Este ativo não tem conta de ativo e/ou conta de ganho/perda configuradas." };
  }

  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, dataBase);
  const saldoContabilAntes = Number(saldos.find((s) => s.conta_code === ativo.conta_code)?.saldo ?? 0);
  const diferenca = Math.round((valorMercado - saldoContabilAntes) * 100) / 100;

  const { error } = await supabase.from("ajustes_marcacao_mercado").insert({
    org_id: currentOrgId,
    ativo_id: ativo.id,
    conta_ativo_code: ativo.conta_code,
    conta_ganho_perda_code: ativo.conta_ganho_perda_mercado_code,
    nome_ativo: ativo.nome,
    data_base: dataBase,
    valor_reportado_mercado: valorMercado,
    saldo_contabil_antes: saldoContabilAntes,
    diferenca,
    fonte,
    observacoes,
    lancamento_id: null,
  });
  if (error) return { error: error.message };

  revalidarTelasContabeis();

  if (Math.abs(diferenca) < 0.01) {
    return { aviso: "Apuração registrada. Valor de mercado já bate com a contabilidade — nenhum lançamento será necessário." };
  }
  return { aviso: "Apuração registrada. Revise e clique em \"Lançar no Diário\" na tabela abaixo para aprovar." };
}

/**
 * Gera o lançamento contábil de uma apuração de marcação a mercado já registrada e aprovada,
 * recalculando o saldo contábil na hora (como estava na própria data-base da apuração).
 */
export async function lancarMarcacaoAction(
  _prev: MarcacaoActionState,
  formData: FormData
): Promise<MarcacaoActionState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite lançar ajustes." };
  }

  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Apuração inválida." };

  const { data: apuracao, error: fetchError } = await supabase
    .from("ajustes_marcacao_mercado")
    .select("*")
    .eq("org_id", currentOrgId)
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!apuracao) return { error: "Apuração não encontrada." };
  if (apuracao.lancamento_id) return { error: "Essa apuração já tem um lançamento gerado." };

  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, apuracao.data_base);
  const saldoAtual = Number(saldos.find((s) => s.conta_code === apuracao.conta_ativo_code)?.saldo ?? 0);
  const diferenca = Math.round((Number(apuracao.valor_reportado_mercado) - saldoAtual) * 100) / 100;

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
            { conta_code: apuracao.conta_ativo_code, tipo: "D", valor: Math.abs(diferenca) },
            { conta_code: apuracao.conta_ganho_perda_code, tipo: "C", valor: Math.abs(diferenca) },
          ]
        : [
            { conta_code: apuracao.conta_ganho_perda_code, tipo: "D", valor: Math.abs(diferenca) },
            { conta_code: apuracao.conta_ativo_code, tipo: "C", valor: Math.abs(diferenca) },
          ];

    const { data: lancId, error: lancError } = await supabase.rpc("create_lancamento", {
      p_org_id: currentOrgId,
      p_numero: numero,
      p_data: apuracao.data_base,
      p_historico: `Marcação a mercado — ${apuracao.nome_ativo} (${apuracao.fonte || "extrato/valuation do custodiante"})`,
      p_linhas: linhas,
      p_intercompany_org_id: null,
    });
    if (lancError) return { error: lancError.message };
    lancamentoId = lancId as string;
  }

  const { error: updateError } = await supabase
    .from("ajustes_marcacao_mercado")
    .update({
      saldo_contabil_antes: saldoAtual,
      diferenca,
      lancamento_id: lancamentoId,
    })
    .eq("org_id", currentOrgId)
    .eq("id", id);
  if (updateError) return { error: updateError.message };

  revalidarTelasContabeis();

  if (Math.abs(diferenca) < 0.01) {
    return { aviso: "Valor já bate com a contabilidade — nenhum lançamento foi necessário." };
  }
  return { aviso: "Lançamento gerado com sucesso no Diário." };
}

export async function deleteMarcacaoAction(formData: FormData) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return;

  const id = String(formData.get("id") || "");
  await supabase.from("ajustes_marcacao_mercado").delete().eq("org_id", currentOrgId).eq("id", id);

  revalidatePath("/ajustes");
}
