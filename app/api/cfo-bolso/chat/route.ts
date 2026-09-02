import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { buildFinancialContext } from "@/lib/cfo-bolso/context";

export const runtime = "nodejs";

const SYSTEM_PROMPT_BASE = `Você é o "CFO de Bolso", um assistente financeiro que responde SOMENTE com base
no contexto financeiro fornecido abaixo, referente a UMA ÚNICA organização (tenant) do sistema.

Regras estritas:
- Responda sempre em português do Brasil, em tom direto e profissional.
- Use apenas os números fornecidos no contexto. Nunca invente valores.
- Se a pergunta pedir algo que não está no contexto (ex: dados de outra empresa,
  cotações de mercado em tempo real, informação fora do escopo contábil/carteira
  desta organização), diga claramente que não tem essa informação — não tente adivinhar.
- Nunca revele, mencione ou compare dados de outras organizações/tenants: você não
  tem acesso a eles e não deve fingir que tem.
- Sempre que fizer uma estimativa ou cálculo (ex: índices, projeções), explique a
  lógica/fórmula usada de forma breve.
- Isto não é aconselhamento financeiro ou fiscal profissional — quando relevante,
  lembre o usuário de validar decisões relevantes com um contador/advisor.`;

export async function POST(req: NextRequest) {
  // Cliente com a sessão do usuário (RLS ativo) — é isso que garante que
  // o contexto financeiro montado abaixo só pode conter dados da(s)
  // organização(ões) às quais ESTE usuário pertence.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const currentOrgId = cookieStore.get("current_org")?.value;
  if (!currentOrgId) {
    return NextResponse.json({ error: "no organization selected" }, { status: 400 });
  }

  // Confirma explicitamente que o usuário é membro da org (defesa em
  // profundidade — o RLS já garantiria isso em qualquer query abaixo,
  // mas falhar cedo aqui evita até tentar montar contexto).
  const { data: membership } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(base_currency)")
    .eq("org_id", currentOrgId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message || "").trim();
  const conversaId = body?.conversaId as string | undefined;

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const currency = (membership.organizations as { base_currency?: string } | null)?.base_currency ?? "USD";
  const context = await buildFinancialContext(supabase, currentOrgId, currency);

  let conversationId = conversaId;
  if (!conversationId) {
    const { data: conv, error: convError } = await supabase
      .from("chat_conversas")
      .insert({ org_id: currentOrgId, user_id: user.id, titulo: message.slice(0, 60) })
      .select("id")
      .single();
    if (convError) return NextResponse.json({ error: convError.message }, { status: 500 });
    conversationId = conv.id;
  }

  await supabase.from("chat_mensagens").insert({
    org_id: currentOrgId,
    conversa_id: conversationId,
    role: "user",
    content: message,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let answer: string;

  if (!apiKey) {
    answer =
      "[Modo demo — ANTHROPIC_API_KEY não configurada] Aqui está o contexto financeiro que seria enviado ao modelo:\n\n" +
      context.slice(0, 1500) +
      "\n\n(Configure ANTHROPIC_API_KEY no .env para respostas reais do CFO de Bolso.)";
  } else {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: `${SYSTEM_PROMPT_BASE}\n\n--- CONTEXTO FINANCEIRO DA ORGANIZAÇÃO ---\n${context}`,
          messages: [{ role: "user", content: message }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Anthropic API error: ${resp.status} ${errText}`);
      }

      const json = await resp.json();
      answer = json.content?.[0]?.text ?? "Não consegui gerar uma resposta agora.";
    } catch (e) {
      answer = `Não foi possível consultar o modelo agora (${(e as Error).message}). Tente novamente em instantes.`;
    }
  }

  await supabase.from("chat_mensagens").insert({
    org_id: currentOrgId,
    conversa_id: conversationId,
    role: "assistant",
    content: answer,
  });

  return NextResponse.json({ conversaId: conversationId, answer });
}
