"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para uso em Client Components.
 *
 * Usa sempre a chave pública (anon key) — nunca a service role key aqui.
 * A segurança de cada requisição é garantida pelo RLS do Postgres,
 * avaliado no servidor do Supabase com base no JWT do usuário logado.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
