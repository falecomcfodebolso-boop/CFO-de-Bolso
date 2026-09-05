import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { calcularAcruoInterno, CATEGORIA_ACRUO_LABEL, type AtivoAcruo } from "@/lib/accounting/acruo";
import { getSaldosPorContaAteData } from "@/lib/accounting/queries";
import { getIntervaloDeLancamentos, resolverDataReferencia } from "@/lib/accounting/data-referencia";
import ExcelJS from "exceljs";
import {
  buildAjustesGrupoSheet,
  buildAjustesHistoricoSheet,
  workbookToBuffer,
  type GrupoAcruoExport,
  type ApuracaoHistoricoExport,
} from "@/lib/export/excel";
import { buildAjustesPdf, type GrupoAcruoPdf, type ApuracaoHistoricoPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

/** Soma o saldo contábil de uma lista de contas separadas por vírgula (pools compartilhados). */
function somarSaldo(saldos: { conta_code: string; saldo: number }[], codigos: string): number {
  return codigos
    .split(",")
    .map((c) => c.trim())
    .reduce((acc, c) => acc + Number(saldos.find((s) => s.conta_code === c)?.saldo ?? 0), 0);
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const orgName = currentMembership.organizations?.name ?? "";
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const formato = req.nextUrl.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";

  const [{ data: ativosData }, { data: ajustesData }, intervalo] = await Promise.all([
    supabase
      .from("ativos")
      .select(
        "id, nome, valor_face, taxa_cupom, categoria_acruo, tipo_taxa, spread_taxa, taxa_referencia_atual, indice_referencia, data_pagamento_anterior, data_inicio_acruo, pendente_custodiante, conta_acruo_code, conta_receita_code, grupo_acruo_nome"
      )
      .eq("org_id", currentOrgId)
      .not("grupo_acruo_nome", "is", null)
      .order("grupo_acruo_nome")
      .order("nome"),
    supabase
      .from("ajustes_acruo")
      .select("*")
      .eq("org_id", currentOrgId)
      .order("data_base", { ascending: false })
      .order("created_at", { ascending: false }),
    getIntervaloDeLancamentos(supabase, currentOrgId),
  ]);

  const ativos = (ativosData ?? []) as AtivoAcruo[];
  const ajustes = ajustesData ?? [];

  const dataParam = req.nextUrl.searchParams.get("data") || hoje();
  const { data: dataRef } = resolverDataReferencia(dataParam, intervalo);
  const saldos = await getSaldosPorContaAteData(supabase, currentOrgId, dataRef);

  // Agrupa os ativos por grupo de acruo, calculando o cálculo interno papel a papel na data de
  // referência — mesma lógica de app/(app)/ajustes/page.tsx.
  const grupos = new Map<
    string,
    { contaAcruo: string; contaReceita: string; itens: (AtivoAcruo & { dias: number | null; valorCalc: number | null })[] }
  >();
  for (const a of ativos) {
    if (!a.grupo_acruo_nome || !a.conta_acruo_code || !a.conta_receita_code) continue;
    const r = calcularAcruoInterno(a, dataRef);
    if (!grupos.has(a.grupo_acruo_nome)) {
      grupos.set(a.grupo_acruo_nome, { contaAcruo: a.conta_acruo_code, contaReceita: a.conta_receita_code, itens: [] });
    }
    grupos.get(a.grupo_acruo_nome)!.itens.push({ ...a, dias: r.dias, valorCalc: r.valor });
  }

  const gruposExport: GrupoAcruoExport[] = [];
  const gruposPdf: GrupoAcruoPdf[] = [];

  for (const [nomeGrupo, g] of grupos.entries()) {
    // Confirmados primeiro, pending depois — necessário para as fórmulas de SUM por faixa
    // contígua de linhas na planilha Excel.
    const itensOrdenados = [...g.itens].sort(
      (a, b) => Number(!!a.pendente_custodiante) - Number(!!b.pendente_custodiante)
    );
    const saldoContabilAtual = somarSaldo(saldos, g.contaAcruo);
    const ajustesGrupo = ajustes.filter((a) => a.nome_grupo === nomeGrupo);
    const ultimoAjuste =
      ajustesGrupo.find((a) => a.data_base === dataRef) ?? ajustesGrupo.find((a) => a.data_base <= dataRef) ?? null;
    const subtotal = itensOrdenados.reduce((acc, i) => acc + (i.valorCalc ?? 0), 0);
    const diferenca =
      ultimoAjuste != null ? Math.round((subtotal - ultimoAjuste.valor_reportado_banco) * 100) / 100 : null;

    gruposExport.push({
      nomeGrupo,
      contaAcruo: g.contaAcruo,
      contaReceita: g.contaReceita,
      saldoContabilAtual,
      valorInformadoBanco: ultimoAjuste?.valor_reportado_banco ?? null,
      dataUltimoAjuste: ultimoAjuste?.data_base ?? null,
      itens: itensOrdenados.map((i) => ({
        nome: i.nome,
        categoriaLabel: i.categoria_acruo ? CATEGORIA_ACRUO_LABEL[i.categoria_acruo] : "—",
        valorFace: i.valor_face,
        tipoTaxa: i.tipo_taxa,
        taxaCupom: i.taxa_cupom,
        taxaReferenciaAtual: i.taxa_referencia_atual,
        spreadTaxa: i.spread_taxa,
        indiceReferencia: i.indice_referencia,
        dataBase: i.categoria_acruo === "continuo" ? i.data_inicio_acruo : i.data_pagamento_anterior,
        pendente: !!i.pendente_custodiante,
      })),
    });

    gruposPdf.push({
      nomeGrupo,
      contaAcruo: g.contaAcruo,
      contaReceita: g.contaReceita,
      saldoContabilAtual,
      valorInformadoBanco: ultimoAjuste?.valor_reportado_banco ?? null,
      dataUltimoAjuste: ultimoAjuste?.data_base ?? null,
      diferenca,
      itens: itensOrdenados.map((i) => {
        const taxaEfetiva =
          i.tipo_taxa === "flutuante" ? (i.taxa_referencia_atual ?? 0) + (i.spread_taxa ?? 0) : i.taxa_cupom;
        return {
          nome: i.nome,
          categoriaLabel: i.categoria_acruo ? CATEGORIA_ACRUO_LABEL[i.categoria_acruo] : "—",
          valorFace: i.valor_face,
          taxaEfetiva,
          tipoTaxa: i.tipo_taxa,
          indiceReferencia: i.indice_referencia,
          dataBase: i.categoria_acruo === "continuo" ? i.data_inicio_acruo : i.data_pagamento_anterior,
          dias: i.dias,
          valorCalc: i.valorCalc,
          pendente: !!i.pendente_custodiante,
        };
      }),
    });
  }

  const historicoExport: ApuracaoHistoricoExport[] = ajustes.map((a) => ({
    dataBase: a.data_base,
    nomeGrupo: a.nome_grupo,
    contaAcruoCode: a.conta_acruo_code,
    saldoContabilAntes: a.saldo_contabil_antes,
    valorReportadoBanco: a.valor_reportado_banco,
    acruoCalculadoInterno: a.acruo_calculado_interno,
    fonte: a.fonte,
    lancado: !!a.lancamento_id,
  }));
  const historicoPdf: ApuracaoHistoricoPdf[] = ajustes.map((a) => ({
    dataBase: a.data_base,
    nomeGrupo: a.nome_grupo,
    contaAcruoCode: a.conta_acruo_code,
    saldoContabilAntes: a.saldo_contabil_antes,
    valorReportadoBanco: a.valor_reportado_banco,
    acruoCalculadoInterno: a.acruo_calculado_interno,
    diferenca: a.diferenca,
    fonte: a.fonte,
    lancado: !!a.lancamento_id,
  }));

  if (formato === "pdf") {
    const buffer = await buildAjustesPdf(gruposPdf, historicoPdf, currency, orgName, dataRef);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ajustes-acruamento-${dataRef}.pdf"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  for (const g of gruposExport) {
    buildAjustesGrupoSheet(wb, g, dataRef, orgName);
  }
  buildAjustesHistoricoSheet(wb, historicoExport, orgName);
  const buffer = await workbookToBuffer(wb);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ajustes-acruamento-${dataRef}.xlsx"`,
    },
  });
}
