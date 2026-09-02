// Script de seed — popula uma organização de EXEMPLO com dados fictícios
// (números redondos, não são os dados reais de nenhum cliente) para você
// explorar o produto rapidamente após configurar o Supabase.
//
// Uso:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/seed.mjs seu-email@exemplo.com "Sua Senha123!"
//
// Ele cria (ou reaproveita) o usuário informado, cria uma organização
// "Exemplo Holdings Ltd", e popula plano de contas, alguns lançamentos de
// diário, ativos de carteira e a configuração de alerta de vencimento.
//
// Roda com a SERVICE ROLE — nunca exponha esta chave fora deste contexto
// de setup local/administrativo.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const password = process.argv[3];

if (!url || !serviceKey || !email || !password) {
  console.error(
    "Uso: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs <email> <senha>"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log("1) Garantindo usuário de demonstração...");
  let userId;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr && !String(createErr.message).includes("already been registered")) {
    throw createErr;
  }

  if (created?.user) {
    userId = created.user.id;
  } else {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email === email);
    if (!existing) throw new Error("Não encontrei o usuário após tentativa de criação.");
    userId = existing.id;
  }
  console.log("   user_id:", userId);

  console.log("2) Criando organização de exemplo...");
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: "Exemplo Holdings Ltd", legal_name: "Exemplo Holdings Ltd", base_currency: "USD", created_by: userId })
    .select("id")
    .single();
  if (orgErr) throw orgErr;
  const orgId = org.id;
  console.log("   org_id:", orgId);

  await admin.from("memberships").insert({ org_id: orgId, user_id: userId, role: "owner" });

  console.log("3) Plano de contas...");
  const contas = [
    { code: "1.1.1.001", name: "Caixa - Banco A", natureza: "ATIVO" },
    { code: "1.1.2.001", name: "Juros Acruados a Receber", natureza: "ATIVO" },
    { code: "1.1.3.001", name: "Título Renda Fixa - Exemplo 1", natureza: "ATIVO" },
    { code: "1.1.3.002", name: "Título Renda Fixa - Exemplo 2", natureza: "ATIVO" },
    { code: "1.1.3.003", name: "Fundo Multimercado - Exemplo", natureza: "ATIVO" },
    { code: "3.1.001", name: "Capital Social", natureza: "PL" },
    { code: "3.2.001", name: "Lucros Acumulados", natureza: "PL" },
    { code: "4.1.001", name: "Receitas Financeiras", natureza: "RECEITA" },
    { code: "5.1.001", name: "Despesas Financeiras e Perdas", natureza: "DESPESA" },
  ];
  await admin.from("plano_de_contas").insert(contas.map((c) => ({ ...c, org_id: orgId })));

  console.log("4) Lançamentos de exemplo...");
  const lancamentos = [
    {
      numero: 1,
      data: "2026-01-01",
      historico: "Saldo de abertura",
      linhas: [
        { conta_code: "1.1.1.001", tipo: "D", valor: 50000 },
        { conta_code: "1.1.3.001", tipo: "D", valor: 200000 },
        { conta_code: "1.1.3.002", tipo: "D", valor: 150000 },
        { conta_code: "3.1.001", tipo: "C", valor: 50000 },
        { conta_code: "3.2.001", tipo: "C", valor: 350000 },
      ],
    },
    {
      numero: 2,
      data: "2026-02-15",
      historico: "Juros recebidos - Título Exemplo 1",
      linhas: [
        { conta_code: "1.1.1.001", tipo: "D", valor: 4500 },
        { conta_code: "4.1.001", tipo: "C", valor: 4500 },
      ],
    },
    {
      numero: 3,
      data: "2026-03-31",
      historico: "Rendimento do fundo multimercado",
      linhas: [
        { conta_code: "1.1.3.003", tipo: "D", valor: 1800 },
        { conta_code: "4.1.001", tipo: "C", valor: 1800 },
      ],
    },
    {
      numero: 4,
      data: "2026-04-10",
      historico: "Taxa de custódia",
      linhas: [
        { conta_code: "5.1.001", tipo: "D", valor: 320 },
        { conta_code: "1.1.1.001", tipo: "C", valor: 320 },
      ],
    },
  ];

  for (const l of lancamentos) {
    const { data: lanc, error: lancErr } = await admin
      .from("lancamentos")
      .insert({ org_id: orgId, numero: l.numero, data: l.data, historico: l.historico, created_by: userId })
      .select("id")
      .single();
    if (lancErr) throw lancErr;
    await admin
      .from("lancamento_linhas")
      .insert(l.linhas.map((x) => ({ ...x, org_id: orgId, lancamento_id: lanc.id })));
  }

  console.log("5) Ativos da carteira...");
  await admin.from("ativos").insert([
    {
      org_id: orgId,
      nome: "Título Renda Fixa - Exemplo 1",
      custodiante: "Banco A",
      conta_code: "1.1.3.001",
      tipo: "renda_fixa",
      valor_atual: 200000,
      taxa_cupom: 0.06,
      data_vencimento: "2031-03-18",
    },
    {
      org_id: orgId,
      nome: "Título Renda Fixa - Exemplo 2",
      custodiante: "Banco A",
      conta_code: "1.1.3.002",
      tipo: "renda_fixa",
      valor_atual: 150000,
      taxa_cupom: 0.055,
      data_vencimento: "2030-07-08",
    },
    {
      org_id: orgId,
      nome: "Fundo Multimercado - Exemplo",
      custodiante: "Banco B",
      conta_code: "1.1.3.003",
      tipo: "fundo",
      valor_atual: 51800,
    },
  ]);

  console.log("6) Configuração de alerta de vencimento...");
  await admin
    .from("alert_configs")
    .insert({ org_id: orgId, dias_antecedencia: [5, 4, 3, 2, 1], hora_local: "10:00", timezone: "America/Sao_Paulo", canal: "push" });

  console.log("\nPronto! Faça login com:");
  console.log("  e-mail:", email);
  console.log("  senha: (a que você passou no comando)");
  console.log("Organização de exemplo criada:", orgId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
