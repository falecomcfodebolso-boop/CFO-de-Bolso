import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Rota que recebe o redirecionamento do Supabase depois que o usuário
 * clica no link de confirmação de e-mail (signup) — Supabase valida o
 * token no servidor dele e manda o navegador pra cá com ?code=..., mas
 * quem precisa trocar esse code pela sessão (e gravar os cookies no
 * nosso domínio) é a nossa própria aplicação.
 *
 * Sem essa troca, o usuário chega aqui "confirmado" no Supabase mas
 * ainda deslogado no app — por isso essa rota existe.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?erro_confirmacao=1`);
}
