"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { getSaldosPorContaAteData } from "@/lib/accounting/queries";
import { calcularAcruoInterno, type AtivoAcruo } from "@/lib/accounting/acruo";
import {
  parseExtratoAcruoDePdf,
  parseValoresMercadoDePdf,
  ParseAcruoError,
  type EntradaAcruoExtrato,
} from "@/lib/accounting/parse-extrato-acruo";

export type PropostaApuracao = {
  nomeGrupo: string;
  contaAcruoCode: string;
  contaReceitaCode: string;
  dataBase: string;
  valorReportadoBanco: number;
  saldoContabilAntes: number;
  acruoCalculadoInterno: number | null;
  diferenca: number;
  itens: EntradaAcruoExtrato[];
};

export type PropostaMarcacao = {
  ativoId: string;
  nomeAtivo: string;
  isin: string;
  contaAtivoCode: string;
  contaGanhoPerdaCode: string;
  dataBase: string;
  valorReportadoMercado: number;
  saldoContabilAntes: number;
  diferenca: number;
};

export type ParseAcruoState = {
  error?: string;
  dataBase?: string;
  formato?: "itau" | "pershing";
  propostas?: PropostaApuracao[];
  naoReconhecidas?: EntradaAcruoExtrato[];
  propostasMercado?: PropostaMarcacao[];
} | null;

type AtivoComIsin = AtivoAcruo & { id: string; isin: string | null };

/** Ativo cujo ISIN (ou um dos ISINs, separados por vírgula) bate com o da linha do extrato. */
function encontrarPorIsin(entrada: EntradaAcruoExtrato, ativos: AtivoComIsin[]): AtivoComIsin | null {
  if (!entrada.isin) return null;
  return (
    ativos.find((a) =>
      (a.isin ?? "")
        .split(",")
        .map((s) => s.trim())
        .includes(entrada.isin as string)
    ) ?? null
  );
}

/** Fallback quando o extrato não traz ISIN (ex.: discount notes, alguns floaters) — casa pelo nome. */
function encontrarPorNome(entrada: EntradaAcruoExtrato, ativos: AtivoComIsin[]): AtivoComIsin | null {
  const nomeEntrada = entrada.nome.toUpperCase();
  const candidatos = ativos.filter((a) => nomeEntrada.includes(a.nome.toUpperCase()));
  return candidatos.length === 1 ? candidatos[0] : null;
}

export async function parseExtratoAcruoPdfAction(
  _prev: ParseAcruoState,
  formData: FormData
): Promise<ParseAcruoState> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite importar apurações." };
  }

  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) return { error: "Escolha um arquivo PDF para importar." };
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Por enquanto só é possível importar a partir de um arquivo PDF." };
  }

  const buffer = await file.arrayBuffer();
  let parseado;
  try {
    parseado = await parseExtratoAcruoDePdf(buffer);
  } catch (e) {
    if (e instanceof ParseAcruoError) return { error: e.message };
    return { error: `Não consegui ler o arquivo: ${(e as Error).message}` };
  }

  const dataBase = parseado.dataBase;
  if (!dataBase) {
    return {
      error:
        "Não consegui identificar a data-base do extrato (procurei por \"Market Value as of ...\"). " +
        "Registre essa apuração manualmente pelo formulário \"Nova apuração\".",
    };
  }

  const { data: ativosData, error: ativosError } = await supabase
    .from("ativos")
    .select(
      "id, isin, nome, valor_face, taxa_cupom, categoria_acruo, tipo_taxa, spread_taxa, taxa_referencia_atual, indice_referencia, data_pagamento_anterior, data_inicio_acruo, pendente_custodiante, conta_acruo_code, conta_receita_code, grupo_acruo_nome"
    )
    .eq("org_id", currentOrgId)
    .not("grupo_acruo_nome", "is", null);
  if (ativosError) return { error: ativosError.message };
  const ativos = (ativosData ?? []) as AtivoComIsin[];

  const naoReconhecidas: EntradaAcruoExtrato[] = [];
  const porGrupo = new Map<
    string,
    { contaAcruo: string; contaReceita: string; soma: number; itens: EntradaAcruoExtrato[] }
  >();

  for (const entrada of parseado.entradas) {
    const ativo = encontrarPorIsin(entrada, ativos) ?? encontrarPorNome(entrada, ativos);
    if (!ativo || !ativo.grupo_acruo_nome || !ativo.conta_acruo_code || !ativo.conta_receita_code) {
      naoReconhecidas.push(entrada);
      continue;
    }
    if (!porGrupo.has(ativo.grupo_acruo_nome)) {
      porGrupo.set(ativo.grupo_acruo_nome, {
        contaAcruo: ativo.conta_acruo_code,
        contaReceita: ativo.conta_receita_code,
        soma: 0,
        itens: [],
      });
    }
    const g = porGrupo.get(ativo.grupo_acruo_nome)!;
    g.soma = Math.round((g.soma + entrada.accruedInterest) * 100) / 100;
    g.itens.push(entrada);
  }

  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, dataBase);
  function somarSaldo(codigos: string): number {
    return codigos
      .split(",")
      .map((c) => c.trim())
      .reduce((acc, c) => acc + Number(saldos.find((s) => s.conta_code === c)?.saldo ?? 0), 0);
  }

  const propostas: PropostaApuracao[] = [];
  for (const [nomeGrupo, g] of porGrupo.entries()) {
    const ativosGrupo = ativos.filter((a) => a.grupo_acruo_nome === nomeGrupo);
    let acruoCalculadoInterno: number | null = null;
    let soma = 0;
    let algumCalculavel = false;
    for (const a of ativosGrupo) {
      if (a.pendente_custodiante) continue;
      const r = calcularAcruoInterno(a, dataBase);
      if (r.valor != null) {
        soma += r.valor;
        algumCalculavel = true;
      }
    }
    if (algumCalculavel) acruoCalculadoInterno = Math.round(soma * 100) / 100;

    const saldoContabilAntes = somarSaldo(g.contaAcruo);
    const diferenca = Math.round((g.soma - saldoContabilAntes) * 100) / 100;

    propostas.push({
      nomeGrupo,
      contaAcruoCode: g.contaAcruo,
      contaReceitaCode: g.contaReceita,
      dataBase,
      valorReportadoBanco: g.soma,
      saldoContabilAntes,
      acruoCalculadoInterno,
      diferenca,
      itens: g.itens,
    });
  }

  propostas.sort((a, b) => a.nomeGrupo.localeCompare(b.nomeGrupo));

  // Fundos de renda variável (categoria 'mercado') — o mesmo Statement traz o valor de
  // mercado deles em outras seções do PDF (Alternatives/Equities/High Yield sem cupom).
  const { data: ativosMercadoData, error: ativosMercadoError } = await supabase
    .from("ativos")
    .select("id, nome, isin, conta_code, conta_ganho_perda_mercado_code")
    .eq("org_id", currentOrgId)
    .eq("categoria_acruo", "mercado");
  if (ativosMercadoError) return { error: ativosMercadoError.message };

  const ativosMercado = (ativosMercadoData ?? []).filter(
    (a) => a.isin && a.conta_code && a.conta_ganho_perda_mercado_code
  );

  let propostasMercado: PropostaMarcacao[] = [];
  if (ativosMercado.length > 0) {
    const isins = ativosMercado.map((a) => a.isin as string);
    const valoresMercado = await parseValoresMercadoDePdf(buffer, isins);

    propostasMercado = ativosMercado
      .map((a) => {
        const entrada = valoresMercado.entradas.find((e) => e.isin === a.isin);
        if (!entrada) return null;
        const saldoContabilAntes = Number(saldos.find((s) => s.conta_code === a.conta_code)?.saldo ?? 0);
        const diferenca = Math.round((entrada.valorMercado - saldoContabilAntes) * 100) / 100;
        return {
          ativoId: a.id,
          nomeAtivo: a.nome,
          isin: a.isin as string,
          contaAtivoCode: a.conta_code as string,
          contaGanhoPerdaCode: a.conta_ganho_perda_mercado_code as string,
          dataBase,
          valorReportadoMercado: entrada.valorMercado,
          saldoContabilAntes,
          diferenca,
        };
      })
      .filter((p): p is PropostaMarcacao => p != null);
  }

  return { dataBase, formato: parseado.formato, propostas, naoReconhecidas, propostasMercado };
}

export async function confirmarApuracoesAction(
  propostas: PropostaApuracao[],
  fonte: string
): Promise<{ error?: string; registradas?: number }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar apurações." };
  }
  if (propostas.length === 0) return { error: "Selecione ao menos um grupo para registrar." };

  const { error, count } = await supabase.from("ajustes_acruo").insert(
    propostas.map((p) => ({
      org_id: currentOrgId,
      ativo_id: null,
      conta_acruo_code: p.contaAcruoCode,
      conta_receita_code: p.contaReceitaCode,
      nome_grupo: p.nomeGrupo,
      data_base: p.dataBase,
      data_base_anterior: null,
      valor_reportado_banco: p.valorReportadoBanco,
      saldo_contabil_antes: p.saldoContabilAntes,
      acruo_calculado_interno: p.acruoCalculadoInterno,
      diferenca: p.diferenca,
      fonte,
      observacoes: "Sugerido automaticamente a partir da importação de PDF — revisar e lançar.",
      lancamento_id: null,
    })),
    { count: "exact" }
  );
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { registradas: count ?? propostas.length };
}

export async function confirmarMarcacoesAction(
  propostas: PropostaMarcacao[],
  fonte: string
): Promise<{ error?: string; registradas?: number }> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite registrar apurações." };
  }
  if (propostas.length === 0) return { error: "Selecione ao menos um fundo para registrar." };

  const { error, count } = await supabase.from("ajustes_marcacao_mercado").insert(
    propostas.map((p) => ({
      org_id: currentOrgId,
      ativo_id: p.ativoId,
      conta_ativo_code: p.contaAtivoCode,
      conta_ganho_perda_code: p.contaGanhoPerdaCode,
      nome_ativo: p.nomeAtivo,
      data_base: p.dataBase,
      valor_reportado_mercado: p.valorReportadoMercado,
      saldo_contabil_antes: p.saldoContabilAntes,
      diferenca: p.diferenca,
      fonte,
      observacoes: "Sugerido automaticamente a partir da importação de PDF — revisar e lançar.",
      lancamento_id: null,
    })),
    { count: "exact" }
  );
  if (error) return { error: error.message };

  revalidatePath("/ajustes");
  return { registradas: count ?? propostas.length };
}
