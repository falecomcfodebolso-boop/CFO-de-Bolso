"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export type ActionState = { error?: string } | null;

export async function signUpAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();
  const acceitouTermos = formData.get("aceite") === "on";

  if (!acceitouTermos) {
    return { error: "É necessário aceitar os Termos de Uso e a Política de Privacidade para continuar." };
  }
  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  if (error) return { error: error.message };

  if (data.session) {
    redirect("/signup/organizacao");
  }

  redirect("/login?check_email=1");
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "E-mail ou senha inválidos." };

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function createOrganizationAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") || "").trim();
  const legalName = String(formData.get("legal_name") || "").trim() || null;
  const taxId = String(formData.get("tax_id") || "").trim() || null;
  const baseCurrency = String(formData.get("base_currency") || "USD");
  const regimeTributario = String(formData.get("regime_tributario") || "").trim() || null;
  const atividadeTributaria = String(formData.get("atividade_tributaria") || "").trim() || null;
  const aliquotaIssPct = String(formData.get("aliquota_iss_pct") || "").trim();
  const aliquotaIss = aliquotaIssPct ? parseFloat(aliquotaIssPct.replace(",", ".")) / 100 : null;
  const anexoSimples = String(formData.get("anexo_simples") || "").trim() || null;

  if (!name) return { error: "Informe o nome da organização." };

  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_legal_name: legalName,
    p_tax_id: taxId,
    p_base_currency: baseCurrency,
    p_regime_tributario: regimeTributario,
    p_atividade_tributaria: atividadeTributaria,
    p_aliquota_iss: aliquotaIss,
    p_anexo_simples: anexoSimples,
  });

  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.set("current_org", orgId as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect("/dashboard");
}

export async function switchOrgAction(formData: FormData) {
  const orgId = String(formData.get("org_id") || "");
  const cookieStore = await cookies();
  cookieStore.set("current_org", orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/dashboard");
}
