import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Valida a chave de download (header `Authorization: Bearer <chave>`) e devolve a
 * organização dela. Só o hash SHA-256 fica no banco (automacao_chaves_download).
 * A chave dá acesso APENAS aos relatórios gerados pela automação dessa organização.
 */
export async function validarChaveDownload(req: NextRequest, supabase: SupabaseClient): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const chave = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (chave.length < 20) return null;
  const hash = createHash("sha256").update(chave).digest("hex");
  const { data } = await supabase
    .from("automacao_chaves_download")
    .select("id, org_id")
    .eq("chave_hash", hash)
    .eq("ativo", true)
    .maybeSingle();
  if (!data) return null;
  await supabase.from("automacao_chaves_download").update({ ultimo_uso: new Date().toISOString() }).eq("id", data.id);
  return data.org_id as string;
}
