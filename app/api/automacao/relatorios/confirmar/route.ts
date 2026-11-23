import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarChaveDownload } from "@/lib/automacao/chave-download";

export const runtime = "nodejs";

/** O PC confirma que salvou o relatório — marca as execuções como baixadas para não baixar de novo. */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const orgId = await validarChaveDownload(req, supabase);
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const corpo = (await req.json().catch(() => null)) as { caminho?: string } | null;
  if (!corpo?.caminho) return NextResponse.json({ error: "caminho obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("automacao_execucoes")
    .update({ baixado_em: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("relatorio_path", corpo.caminho)
    .is("baixado_em", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
