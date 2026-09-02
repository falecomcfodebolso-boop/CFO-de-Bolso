"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUpAction, type ActionState } from "../actions";

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signUpAction,
    null
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 mb-4">Criar conta</h1>
      <form action={formAction} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Nome completo
          </label>
          <input
            name="name"
            type="text"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            E-mail
          </label>
          <input
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Senha
          </label>
          <input
            name="password"
            type="password"
            minLength={8}
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <p className="text-xs text-slate-400 mt-1">Mínimo de 8 caracteres.</p>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input name="aceite" type="checkbox" required className="mt-0.5" />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="underline text-slate-900">
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="underline text-slate-900">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Criando conta..." : "Criar conta"}
        </button>
      </form>

      <p className="text-sm text-slate-500 mt-4 text-center">
        Já tem conta?{" "}
        <Link href="/login" className="text-slate-900 font-medium underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
