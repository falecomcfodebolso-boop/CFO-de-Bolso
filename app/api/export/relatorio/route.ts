import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { resolverPeriodoComAnterior } from "@/lib/export/periodo";
import { gerarRelatorioCompleto } from "@/lib/export/relatorio-completo";

export const runtime = "nodejs";

/** Relatório completo (botão do Dashboard e da tela de Demonstrações) — ver lib/export/relatorio-completo.ts. */
export async function GET(req: NextRequest) {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  const currency = currentMembership.organizations?.base_currency ?? "USD";
  const orgName = currentMembership.organizations?.name ?? "";

  const parametros = resolverPeriodoComAnterior(req.nextUrl.searchParams);
  const formato = req.nextUrl.searchParams.get("formato") === "xlsx" ? "xlsx" : "pdf";

  const { buffer, nomeArquivo, contentType } = await gerarRelatorioCompleto(
    supabase,
    currentOrgId,
    { currency, orgName },
    parametros,
    formato
  );
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
