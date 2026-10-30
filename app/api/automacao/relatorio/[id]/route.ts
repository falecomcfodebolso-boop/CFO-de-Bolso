import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Download do relatório gerado pela automação — a leitura da execução passa pelo RLS (só membros da organização). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, currentOrgId } = await requireOrgContext();
  const { data: exec } = await supabase
    .from("automacao_execucoes")
    .select("relatorio_path, org_id")
    .eq("id", id)
    .eq("org_id", currentOrgId)
    .maybeSingle();
  if (!exec?.relatorio_path) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const { data, error } = await createAdminClient().storage.from("automacao").download(exec.relatorio_path);
  if (error || !data) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const nome = exec.relatorio_path.split("/").pop() ?? "relatorio.pdf";
  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nome}"` },
  });
}
