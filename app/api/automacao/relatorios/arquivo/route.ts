import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarChaveDownload } from "@/lib/automacao/chave-download";

export const runtime = "nodejs";

/** Devolve o PDF de um relatório da automação — só se ele pertencer à organização da chave. */
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const orgId = await validarChaveDownload(req, supabase);
  if (!orgId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const caminho = req.nextUrl.searchParams.get("caminho") ?? "";
  const { data: exec } = await supabase
    .from("automacao_execucoes")
    .select("id")
    .eq("org_id", orgId)
    .eq("relatorio_path", caminho)
    .limit(1)
    .maybeSingle();
  if (!exec) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const { data, error } = await supabase.storage.from("automacao").download(caminho);
  if (error || !data) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return new NextResponse(new Uint8Array(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf" },
  });
}
