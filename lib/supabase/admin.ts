import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a SERVICE ROLE KEY — ignora todas as policies de RLS.
 *
 * ⚠️ REGRA DE OURO: nunca importe este arquivo em código que roda a
 * partir de uma requisição feita pelo navegador do usuário (Client
 * Components, rotas de API chamadas pelo front). Ele existe só para
 * rotinas de confiança executadas pelo próprio backend/infra, como:
 *   - o job agendado que varre `ativos` de TODAS as orgs para disparar
 *     alertas de vencimento (precisa ver todas as orgs, então não dá
 *     para usar RLS de um usuário específico);
 *   - scripts administrativos internos.
 *
 * SUPABASE_SERVICE_ROLE_KEY nunca deve ter o prefixo NEXT_PUBLIC_ e nunca
 * deve ser enviada ao bundle do cliente — mantenha-a só em variáveis de
 * ambiente do servidor (Vercel/host), nunca commitada no repositório.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error(
      "createAdminClient() não pode ser chamado no browser — isso vazaria a service role key."
    );
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
