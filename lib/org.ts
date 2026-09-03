import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type RegimeTributario = "MEI" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";
export type AtividadeTributaria = "COMERCIO_INDUSTRIA" | "SERVICOS" | "COMERCIO_E_SERVICOS" | "TRANSPORTE_CARGA";

export type Membership = {
  org_id: string;
  role: "owner" | "admin" | "accountant" | "viewer";
  organizations: {
    id: string;
    name: string;
    base_currency: string;
    regime_tributario: RegimeTributario | null;
    atividade_tributaria: AtividadeTributaria | null;
    aliquota_iss: number | null;
    data_abertura_atividade: string | null;
  };
};

/**
 * Resolve o usuário logado + a organização "ativa" na sessão (a que está
 * selecionada no seletor de organizações da barra superior). Toda página
 * autenticada do app deve chamar isto no topo — nunca deve montar uma
 * query usando um org_id vindo direto da URL/formulário sem checar que o
 * usuário realmente pertence àquela organização (é exatamente para isso
 * que o RLS existe: mesmo que a camada de app erre, o Postgres barra).
 */
export async function requireOrgContext(): Promise<{
  supabase: SupabaseClient;
  user: User;
  memberships: Membership[];
  currentOrgId: string;
  currentMembership: Membership;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select(
      "org_id, role, organizations(id, name, base_currency, regime_tributario, atividade_tributaria, aliquota_iss, data_abertura_atividade)"
    )
    .returns<Membership[]>();

  if (error) throw error;

  if (!memberships || memberships.length === 0) {
    redirect("/signup/organizacao");
  }

  const cookieStore = await cookies();
  const cookieOrg = cookieStore.get("current_org")?.value;
  const currentMembership =
    memberships.find((m) => m.org_id === cookieOrg) ?? memberships[0];

  return {
    supabase,
    user,
    memberships,
    currentOrgId: currentMembership.org_id,
    currentMembership,
  };
}

export function canWrite(role: Membership["role"]) {
  return role === "owner" || role === "admin" || role === "accountant";
}

export function canManageMembers(role: Membership["role"]) {
  return role === "owner" || role === "admin";
}
