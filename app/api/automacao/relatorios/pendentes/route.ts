import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarChaveDownload } from "@/lib/automacao/chave-download";

export const runtime = "nodejs";

/** Lista os relatórios da automação ainda não baixados pelo PC (chave de download). */
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const orgId = await validarChaveDownload(req, supabase);
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("automacao_execucoes")
    .select("relatorio_path, created_at, organizations(name)")
    .eq("org_id", orgId)
    .not("relatorio_path", "is", null)
    .is("baixado_em", null)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vistos = new Set<string>();
  const relatorios: { caminho: string; arquivo: string; empresa: string }[] = [];
  for (const e of data ?? []) {
    const caminho = e.relatorio_path as string;
    if (vistos.has(caminho)) continue;
    vistos.add(caminho);
    const org = e.organizations as unknown as { name: string } | null;
    relatorios.push({ caminho, arquivo: caminho.split("/").pop() ?? "relatorio.pdf", empresa: org?.name ?? "Empresa" });
  }
  return NextResponse.json({ relatorios });
}
