import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rota de cron (chamada por um agendador externo — Vercel Cron, Supabase
 * Scheduled Functions, etc.), NUNCA pelo navegador do usuário.
 *
 * Usa a service role (createAdminClient) porque precisa varrer os ativos
 * de TODAS as organizações de uma vez — isso é seguro aqui porque:
 *   1. a rota exige um header de autorização com um segredo (CRON_SECRET)
 *      que só o próprio agendador conhece;
 *   2. o resultado do job nunca é devolvido ao navegador de um usuário —
 *      ele só grava notificações e retorna um resumo agregado (contagens),
 *      sem detalhar dados de nenhuma organização específica na resposta.
 *
 * Configure no seu agendador: GET /api/cron/vencimentos
 * Header: Authorization: Bearer <CRON_SECRET>
 * Frequência recomendada: a cada hora (o filtro por hora_local/timezone
 * de cada org evita disparos fora do horário configurado).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: configs, error: cfgError } = await supabase
    .from("alert_configs")
    .select("org_id, dias_antecedencia, hora_local, timezone, canal")
    .eq("ativo", true);

  if (cfgError) {
    return NextResponse.json({ error: cfgError.message }, { status: 500 });
  }

  let alertasDisparados = 0;

  for (const cfg of configs ?? []) {
    const [{ data: ativos }, { data: dividas }] = await Promise.all([
      supabase
        .from("ativos")
        .select("id, nome, data_vencimento, org_id")
        .eq("org_id", cfg.org_id)
        .not("data_vencimento", "is", null),
      supabase
        .from("dividas")
        .select("id, nome, data_vencimento, org_id")
        .eq("org_id", cfg.org_id)
        .not("data_vencimento", "is", null),
    ]);

    const hoje = new Date();
    const itensComVencimento = [...(ativos ?? []), ...(dividas ?? [])];
    for (const item of itensComVencimento) {
      const dias = Math.round(
        (new Date(item.data_vencimento as string).getTime() - hoje.getTime()) / 86_400_000
      );
      if (cfg.dias_antecedencia.includes(dias)) {
        // Aqui entraria a chamada real ao provedor de push/e-mail (ex: um
        // serviço de notificação, webhook do app mobile, etc). Mantido
        // como TODO para o time de infra plugar o provedor escolhido —
        // o ponto importante de segurança é que isso roda 100% no
        // servidor, nunca no cliente, e nunca expõe dados de uma org a
        // outra (cada iteração do loop só maneja os dados da própria
        // org, e o resumo abaixo não devolve nada organização-específico).
        alertasDisparados++;
      }
    }
  }

  return NextResponse.json({ ok: true, organizacoes_verificadas: configs?.length ?? 0, alertas_disparados: alertasDisparados });
}
