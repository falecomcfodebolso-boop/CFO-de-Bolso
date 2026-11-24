"use server";

import { revalidatePath } from "next/cache";
import { requireOrgContext, canWrite } from "@/lib/org";
import { classificarConta, type Natureza } from "@/lib/accounting/classificacao";
import {
  extrairNotaComIA,
  validarNota,
  NotaError,
  TIPOS_IMAGEM,
  type NotaNegociacao,
} from "@/lib/import/nota-negociacao";
import {
  montarPropostaNota,
  type AtivoContexto,
  type ContaContexto,
  type PropostaNota,
} from "@/lib/import/proposta-nota";

export type LerNotaState = {
  error?: string;
  proposta?: PropostaNota;
  avisosNota?: string[];
  /** Lançamentos que parecem ser esta mesma compra (já lançada pelo extrato ou por outra nota). */
  possiveisDuplicatas?: string[];
} | null;

async function carregarContexto(orgId: string) {
  const { supabase } = await requireOrgContext();
  const [{ data: ativos, error: e1 }, { data: contas, error: e2 }] = await Promise.all([
    supabase
      .from("ativos")
      .select(
        "id, nome, custodiante, isin, conta_code, quantidade, valor_face, categoria_acruo, grupo_acruo_nome, conta_acruo_code, conta_receita_code, conta_ganho_perda_mercado_code"
      )
      .eq("org_id", orgId),
    supabase.from("plano_de_contas").select("code, name, natureza, is_leaf").eq("org_id", orgId),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return { ativos: (ativos ?? []) as AtivoContexto[], contas: (contas ?? []) as ContaContexto[] };
}

async function procurarDuplicatas(orgId: string, p: PropostaNota): Promise<string[]> {
  const { supabase } = await requireOrgContext();
  const achados: string[] = [];
  if (p.nota.numeroNegocio) {
    const { data } = await supabase
      .from("lancamentos")
      .select("numero, data")
      .eq("org_id", orgId)
      .ilike("historico", `%${p.nota.numeroNegocio}%`);
    for (const l of data ?? []) achados.push(`Lançamento #${l.numero} (${l.data}) já cita a nota ${p.nota.numeroNegocio}.`);
  }
  const caixa = p.linhas.find((l) => l.tipo === "C");
  if (caixa) {
    const ini = new Date(`${p.dataLancamento}T00:00:00Z`);
    const de = new Date(ini.getTime() - 5 * 86_400_000).toISOString().slice(0, 10);
    const ate = new Date(ini.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("v_movimento_contas")
      .select("lancamento_numero, data, valor, historico")
      .eq("org_id", orgId)
      .eq("conta_code", caixa.conta_code)
      .eq("tipo", "C")
      .gte("data", de)
      .lte("data", ate);
    for (const m of data ?? []) {
      if (Math.abs(Number(m.valor) - caixa.valor) < 0.01 && !achados.some((a) => a.includes(`#${m.lancamento_numero} `))) {
        achados.push(
          `Lançamento #${m.lancamento_numero} (${m.data}) já tem saída de ${Number(m.valor).toFixed(2)} no ${caixa.conta_nome}: ${String(m.historico).slice(0, 90)}`
        );
      }
    }
  }
  return achados;
}

export async function lerNotaAction(_prev: LerNotaState, formData: FormData): Promise<LerNotaState> {
  const { currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { error: "Seu papel (viewer) não permite importar notas." };

  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) return { error: "Escolha o PDF ou a foto da nota de negociação." };
  const nome = file.name.toLowerCase();
  let mediaType = file.type;
  if (nome.endsWith(".pdf")) mediaType = "application/pdf";
  else if (/\.(jpe?g)$/.test(nome)) mediaType = "image/jpeg";
  else if (nome.endsWith(".png")) mediaType = "image/png";
  else if (nome.endsWith(".webp")) mediaType = "image/webp";
  if (/\.(heic|heif)$/.test(nome) || /heic|heif/.test(mediaType)) {
    return { error: "Foto em formato HEIC (iPhone) não é aceita. Envie como JPG (no iPhone: Ajustes → Câmera → Formatos → Mais Compatível) ou tire um print da foto." };
  }
  if (mediaType !== "application/pdf" && !TIPOS_IMAGEM.includes(mediaType)) {
    return { error: "Envie a nota em PDF ou foto (JPG/PNG)." };
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const nota = await extrairNotaComIA({ mediaType, base64 });
    if (nota.operacao === "venda") {
      return { error: "Esta nota é de VENDA. Por enquanto a importação de notas cobre só compras — lance a venda pelo extrato." };
    }
    const avisosNota = validarNota(nota);
    const ctx = await carregarContexto(currentOrgId);
    const proposta = montarPropostaNota(nota, ctx);
    const possiveisDuplicatas = await procurarDuplicatas(currentOrgId, proposta);
    return { proposta, avisosNota, possiveisDuplicatas };
  } catch (e) {
    if (e instanceof NotaError) return { error: e.message };
    return { error: (e as Error).message || "Não consegui ler a nota." };
  }
}

/** Recalcula a proposta a partir da nota revisada (valores editados na tela). */
export async function recalcularNotaAction(
  nota: NotaNegociacao
): Promise<{ error?: string; proposta?: PropostaNota; avisosNota?: string[]; possiveisDuplicatas?: string[] }> {
  const { currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { error: "Seu papel (viewer) não permite importar notas." };
  try {
    const ctx = await carregarContexto(currentOrgId);
    const proposta = montarPropostaNota(nota, ctx);
    return { proposta, avisosNota: validarNota(nota), possiveisDuplicatas: await procurarDuplicatas(currentOrgId, proposta) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function confirmarNotaAction(
  nota: NotaNegociacao,
  dataLancamento: string
): Promise<{ error?: string; numero?: number; ativoNome?: string; contaCriada?: string | null }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) return { error: "Seu papel (viewer) não permite importar notas." };
  if (nota.operacao !== "compra") return { error: "Por enquanto só notas de compra." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLancamento)) return { error: "Data do lançamento inválida." };

  // Monta de novo no servidor (não confia nas contas vindas do navegador).
  let p: PropostaNota;
  try {
    p = montarPropostaNota(nota, await carregarContexto(currentOrgId));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const totD = p.linhas.filter((l) => l.tipo === "D").reduce((s, l) => s + l.valor, 0);
  const totC = p.linhas.filter((l) => l.tipo === "C").reduce((s, l) => s + l.valor, 0);
  if (Math.abs(totD - totC) > 0.005) return { error: "Lançamento desbalanceado — confira os valores da nota." };

  // 1) Conta contábil do papel novo
  let contaCriada: string | null = null;
  if (p.contaNova) {
    const classificacao = classificarConta("ATIVO" as Natureza, p.contaNova.name, p.contaNova.dataVencimento);
    const { error } = await supabase.from("plano_de_contas").insert({
      org_id: currentOrgId,
      code: p.contaNova.code,
      name: p.contaNova.name,
      natureza: "ATIVO",
      parent_code: null,
      ...classificacao,
    });
    if (error) return { error: `Não consegui criar a conta ${p.contaNova.code}: ${error.message}` };
    contaCriada = p.contaNova.code;
  }
  const desfazerConta = async () => {
    if (contaCriada) await supabase.from("plano_de_contas").delete().eq("org_id", currentOrgId).eq("code", contaCriada);
  };

  // 2) Lançamento
  const { data: maxNumero } = await supabase
    .from("lancamentos")
    .select("numero")
    .eq("org_id", currentOrgId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  const numero = (maxNumero?.numero ?? 0) + 1;
  const { data: lancId, error: lancError } = await supabase.rpc("create_lancamento", {
    p_org_id: currentOrgId,
    p_numero: numero,
    p_data: dataLancamento,
    p_historico: p.historico,
    p_linhas: p.linhas.map(({ conta_code, tipo, valor }) => ({ conta_code, tipo, valor })),
    p_intercompany_org_id: null,
  });
  if (lancError) {
    await desfazerConta();
    return { error: lancError.message };
  }

  // 3) Carteira / acruo / vencimentos
  let ativoNome: string;
  if (p.ativoExistente) {
    const { data: atual } = await supabase
      .from("ativos")
      .select("quantidade, valor_face, valor_atual")
      .eq("id", p.ativoExistente.id)
      .eq("org_id", currentOrgId)
      .single();
    const patch: Record<string, number> = {
      quantidade: Number(atual?.quantidade ?? 0) + nota.quantidade,
      valor_atual: Math.round((Number(atual?.valor_atual ?? 0) + nota.principal) * 100) / 100,
    };
    if (nota.tipoAtivo === "titulo") patch.valor_face = Number(atual?.valor_face ?? 0) + nota.quantidade;
    const { error } = await supabase.from("ativos").update(patch).eq("id", p.ativoExistente.id).eq("org_id", currentOrgId);
    if (error) return { error: `Lançamento #${numero} criado, mas não consegui atualizar o ativo: ${error.message}` };
    ativoNome = p.ativoExistente.nome;
  } else {
    const a = p.ativoNovo!;
    const { error } = await supabase.from("ativos").insert({
      org_id: currentOrgId,
      ...a,
      conta_code: p.contaNova!.code,
      moeda: nota.moeda,
      observacoes: `Cadastrado pela nota de negociação${nota.numeroNegocio ? ` ${nota.numeroNegocio}` : ""} (${nota.dataOperacao}).`,
    });
    if (error) {
      await supabase.from("lancamentos").delete().eq("id", lancId as string).eq("org_id", currentOrgId);
      await desfazerConta();
      return { error: `Não consegui cadastrar o ativo: ${error.message}` };
    }
    ativoNome = a.nome;
  }

  for (const path of ["/importar", "/diario", "/razoes", "/balancete", "/carteira", "/vencimentos", "/ajustes", "/dashboard", "/plano-de-contas"]) {
    revalidatePath(path);
  }
  return { numero, ativoNome, contaCriada };
}
