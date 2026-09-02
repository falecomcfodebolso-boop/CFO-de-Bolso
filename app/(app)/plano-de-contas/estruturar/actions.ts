"use server";

import { requireOrgContext, canWrite } from "@/lib/org";
import { revalidatePath } from "next/cache";
import { gerarPlanoDeContas, type PerfilEmpresa, type ContaProposta } from "@/lib/estruturacao/gerar-plano";
import { classificarConta, type Natureza } from "@/lib/accounting/classificacao";

export type GerarResultado = { error?: string; contas?: ContaProposta[]; modoDemo?: boolean };

export async function gerarPropostaAction(perfil: PerfilEmpresa): Promise<GerarResultado> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite estruturar o plano de contas." };
  }
  if (!perfil.atividades?.trim()) {
    return { error: "Descreva brevemente as principais atividades da empresa." };
  }

  const { data: existentes } = await supabase
    .from("plano_de_contas")
    .select("code")
    .eq("org_id", currentOrgId);
  const codigosExistentes = new Set((existentes ?? []).map((c) => c.code));

  const { contas, modoDemo } = await gerarPlanoDeContas(perfil);
  const filtradas = contas.filter((c) => !codigosExistentes.has(c.code));

  if (filtradas.length === 0) {
    return { error: "Todas as contas sugeridas já existem no seu Plano de Contas.", modoDemo };
  }
  return { contas: filtradas, modoDemo };
}

export type CriarResultado = { error?: string; criadas?: number };

export async function criarContasEmLoteAction(contas: ContaProposta[]): Promise<CriarResultado> {
  const { supabase, currentOrgId, currentMembership } = await requireOrgContext();
  if (!canWrite(currentMembership.role)) {
    return { error: "Seu papel (viewer) não permite criar contas." };
  }
  if (!contas || contas.length === 0) {
    return { error: "Nenhuma conta selecionada." };
  }

  const { data: existentes } = await supabase
    .from("plano_de_contas")
    .select("code")
    .eq("org_id", currentOrgId);
  const codigosExistentes = new Set((existentes ?? []).map((c) => c.code));

  const paraCriar = contas.filter(
    (c) => c.code?.trim() && c.name?.trim() && c.natureza && !codigosExistentes.has(c.code)
  );

  if (paraCriar.length === 0) {
    return { error: "Nenhuma das contas selecionadas pôde ser criada (os códigos já existem)." };
  }

  const { error } = await supabase.from("plano_de_contas").insert(
    paraCriar.map((c) => ({
      org_id: currentOrgId,
      code: c.code,
      name: c.name,
      natureza: c.natureza,
      ...classificarConta(c.natureza as Natureza, c.name),
    }))
  );

  if (error) return { error: error.message };

  revalidatePath("/plano-de-contas");
  return { criadas: paraCriar.length };
}
