import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para uso em Server Components, Server Actions e Route
 * Handlers. Também usa somente a anon key: a sessão do usuário (via
 * cookies) é o que autentica cada query, e o RLS do banco decide o que
 * cada usuário pode ler/escrever. Isso é o que garante que uma
 * organização nunca enxergue dados de outra, mesmo que haja um bug de
 * lógica na camada de aplicação — a última linha de defesa é o banco.
 *
 * NUNCA importe/instancie a service role key em código que responde a
 * requisições de usuários finais. A service role (ver lib/supabase/admin.ts)
 * só deve ser usada em rotinas internas de confiança (ex: jobs agendados
 * de alerta de vencimento), nunca em uma rota chamada pelo browser.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component — pode ser ignorado
            // se houver um middleware atualizando a sessão.
          }
        },
      },
    }
  );
}
